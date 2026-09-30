import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const serverFile = fileURLToPath(new URL('../server.mjs', import.meta.url));
const username = 'test-travellers';
const password = randomBytes(32).toString('base64url');
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
const baseEnvironment = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: '0',
  APP_ORIGIN: 'http://127.0.0.1',
  PLANNER_USERNAME: username,
  PLANNER_PASSWORD: password,
};
let child;
let port;
let html;
let assetPath;
let output = '';

function launch(environment) {
  return spawn(process.execPath, [serverFile], {
    cwd: root,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function request(path = '/', { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      { hostname: '127.0.0.1', port, path, method, headers, agent: false },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks),
          }),
        );
        response.on('error', reject);
      },
    );
    outgoing.setTimeout(5000, () => outgoing.destroy(new Error('Test request timed out.')));
    outgoing.on('error', reject);
    outgoing.end();
  });
}

async function startupFailure(overrides, omitted = []) {
  const environment = { ...baseEnvironment, ...overrides };
  for (const key of omitted) delete environment[key];
  const processUnderTest = launch(environment);
  let diagnostics = '';
  processUnderTest.stdout.on('data', (chunk) => {
    diagnostics += chunk;
  });
  processUnderTest.stderr.on('data', (chunk) => {
    diagnostics += chunk;
  });
  const timer = setTimeout(() => processUnderTest.kill('SIGKILL'), 5000);
  const result = await new Promise((resolve, reject) => {
    processUnderTest.on('error', reject);
    processUnderTest.on('exit', (code, signal) => resolve({ code, signal }));
  }).finally(() => clearTimeout(timer));
  assert.equal(
    result.signal,
    null,
    'invalid configuration must exit promptly rather than start listening',
  );
  assert.notEqual(result.code, 0);
  assert.doesNotMatch(diagnostics, /Server ready/);
  assert.ok(!diagnostics.includes(password), 'startup diagnostics must never include the password');
  return diagnostics;
}

before(async () => {
  html = await readFile(new URL('../dist/index.html', import.meta.url));
  const script = html.toString().match(/src="(\.\/assets\/[^" ]+\.js)"/u);
  assert.ok(
    script,
    'build the actual production application before running these integration tests',
  );
  assetPath = script[1].slice(1);
  child = launch(baseEnvironment);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Server startup timed out.'));
    }, 5000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const ready = output.match(/Server ready on port (\d+)/u);
      if (ready) {
        port = Number(ready[1]);
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (!port) reject(new Error(`Server exited before becoming ready (${code}).`));
    });
  });
});

after(async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    const stopped = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await stopped;
  }
  assert.ok(!output.includes(password), 'server output must not contain credentials');
  assert.ok(
    !output.includes(authorization),
    'server output must not contain authentication headers',
  );
});

test('unauthenticated requests cannot reveal the application, assets, paths or supported methods', async () => {
  const variants = [
    ['/', {}],
    [assetPath, {}],
    ['/a-path-that-does-not-exist', {}],
    ['/../server.mjs', {}],
    ['/', { method: 'POST' }],
  ];
  for (const [path, options] of variants) {
    const response = await request(path, options);
    assert.equal(response.status, 401);
    assert.equal(response.body.toString(), 'Authentication required.\n');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.match(
      response.headers['www-authenticate'],
      /^Basic realm="Private site", charset="UTF-8"$/u,
    );
    assert.equal(response.headers.allow, undefined);
  }
  const head = await request('/', { method: 'HEAD' });
  assert.equal(head.status, 401);
  assert.equal(head.body.length, 0);
});

test('wrong and malformed authentication is rejected safely', async () => {
  const wrongPassword = randomBytes(32).toString('base64url');
  const invalid = [
    `Basic ${Buffer.from(`${username}:${wrongPassword}`).toString('base64')}`,
    'Bearer token',
    'Basic %%%',
    'Basic A===',
    `Basic ${Buffer.from(username).toString('base64')}`,
    `Basic ${Buffer.from([0xff, 0xfe]).toString('base64')}`,
    [authorization, authorization],
  ];
  for (const header of invalid) {
    const response = await request('/', { headers: { authorization: header } });
    assert.equal(response.status, 401);
    assert.equal(response.body.toString(), 'Authentication required.\n');
  }
});

test('valid credentials serve the exact production HTML with restrictive security headers', async () => {
  const response = await request('/', { headers: { authorization } });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, html);
  assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.equal(response.headers.vary, 'Authorization');
  const csp = response.headers['content-security-policy'];
  assert.match(csp, /script-src 'self'(?:;|$)/u);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/u);
  assert.match(csp, /connect-src 'self'/u);
  assert.match(csp, /img-src 'self' data:/u);
  assert.match(csp, /frame-ancestors 'none'/u);
});

test('assets also require authentication and use precise MIME types with private caching', async () => {
  const response = await request(assetPath, { headers: { authorization } });
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'text/javascript; charset=utf-8');
  assert.match(response.headers['cache-control'], /^private,/u);
  const expected = await readFile(new URL(`../dist${assetPath}`, import.meta.url));
  assert.deepEqual(response.body, expected);
});

test('authenticated HEAD reports metadata without returning the page or asset body', async () => {
  for (const path of ['/', assetPath]) {
    const response = await request(path, { method: 'HEAD', headers: { authorization } });
    assert.equal(response.status, 200);
    assert.equal(response.body.length, 0);
    assert.ok(Number(response.headers['content-length']) > 0);
  }
});

test('authenticated requests reject traversal and malformed encoding without filesystem disclosure', async () => {
  for (const path of [
    '/../server.mjs',
    '/%2e%2e/server.mjs',
    '/%2e%2e%2fserver.mjs',
    '/%5c..%5cserver.mjs',
    '/%00',
    '/%ZZ',
    '//example.com/',
  ]) {
    const response = await request(path, { headers: { authorization } });
    assert.equal(response.status, 400, path);
    assert.equal(response.body.toString(), 'Invalid request.\n');
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  for (const path of ['/assets/', '/server.mjs', '/missing-file', '/%252e%252e/server.mjs']) {
    const response = await request(path, { headers: { authorization } });
    assert.equal(response.status, 404, path);
    assert.equal(response.body.toString(), 'Not found.\n');
  }
});

test('only authenticated GET and HEAD requests are supported', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await request('/', { method, headers: { authorization } });
    assert.equal(response.status, 405);
    assert.equal(response.headers.allow, 'GET, HEAD');
  }
});

test('missing or inadequate credentials prevent the process from starting', async () => {
  assert.match(await startupFailure({}, ['PLANNER_PASSWORD']), /PLANNER_PASSWORD/u);
  assert.match(
    await startupFailure({ PLANNER_PASSWORD: randomBytes(4).toString('hex') }),
    /PLANNER_PASSWORD/u,
  );
  assert.match(await startupFailure({ PLANNER_USERNAME: 'invalid:user' }), /PLANNER_USERNAME/u);
});

test('production fails closed for missing or insecure public origins', async () => {
  assert.match(
    await startupFailure({ NODE_ENV: 'production', PORT: '3000' }, ['APP_ORIGIN']),
    /APP_ORIGIN/u,
  );
  for (const origin of [
    'http://example.com',
    'http://127.0.0.1',
    'https://example.com/private',
    'https://example.com/?query=1',
    'https://user@example.com',
  ]) {
    assert.match(
      await startupFailure({ NODE_ENV: 'production', PORT: '3000', APP_ORIGIN: origin }),
      /APP_ORIGIN/u,
    );
  }
  assert.match(
    await startupFailure({ HOST: '0.0.0.0' }),
    /APP_ORIGIN/u,
    'test HTTP must bind only to loopback',
  );
});

test('local-only mode cannot listen on a network interface', async () => {
  assert.match(
    await startupFailure({
      NODE_ENV: 'production',
      PORT: '3000',
      PLANNER_LOCAL_ONLY: '1',
      HOST: '0.0.0.0',
    }),
    /loopback HOST/u,
  );
  assert.match(
    await startupFailure({
      NODE_ENV: 'production',
      PORT: '3000',
      PLANNER_LOCAL_ONLY: '1',
      HOST: '127.0.0.1',
      APP_ORIGIN: 'http://192.168.1.2',
    }),
    /APP_ORIGIN/u,
  );
});

test('repeated failures are throttled using the real peer rather than forwarded-IP headers', async () => {
  // Run last: this intentionally blocks this test peer for the remainder of its window.
  const reset = await request('/', { headers: { authorization } });
  assert.equal(reset.status, 200);
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await request('/', {
      headers: { 'x-forwarded-for': `192.0.2.${attempt + 1}` },
    });
    assert.equal(response.status, 401);
  }
  const limited = await request('/', {
    headers: { authorization, 'x-forwarded-for': '198.51.100.1' },
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['cache-control'], 'no-store');
  assert.ok(Number(limited.headers['retry-after']) >= 1);
  assert.equal(limited.body.toString(), 'Please try again later.\n');
});
