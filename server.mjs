import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { open, realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const ROOT = dirname(fileURLToPath(import.meta.url));
const LOOPBACK = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');
const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.otf', 'font/otf'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
]);
const digest = (value) => createHash('sha256').update(value).digest();
const isWithin = (file, directory) => file === directory || file.startsWith(`${directory}${sep}`);

async function configure() {
  const username = process.env.PLANNER_USERNAME ?? 'charlie-and-daniella';
  const password = process.env.PLANNER_PASSWORD;
  if (
    typeof password !== 'string' ||
    password.length < 16 ||
    password.length > 1024 ||
    /[\u0000-\u001f\u007f]/u.test(password)
  ) {
    throw new Error(
      'PLANNER_PASSWORD must be supplied securely and contain 16–1024 characters without control characters.',
    );
  }
  if (!username || username.length > 128 || /[:\u0000-\u001f\u007f]/u.test(username)) {
    throw new Error(
      'PLANNER_USERNAME must contain 1–128 characters without colons or control characters.',
    );
  }
  let origin;
  try {
    origin = new URL(process.env.APP_ORIGIN);
  } catch {
    throw new Error('APP_ORIGIN must be the public HTTPS origin of this private site.');
  }
  const testing = process.env.NODE_ENV === 'test';
  const host = process.env.HOST ?? '0.0.0.0';
  const localOnly = process.env.PLANNER_LOCAL_ONLY === '1';
  if (localOnly && !LOOPBACK.has(host)) {
    throw new Error('PLANNER_LOCAL_ONLY requires a loopback HOST.');
  }
  const localTest =
    (testing || localOnly) &&
    origin.protocol === 'http:' &&
    LOOPBACK.has(origin.hostname) &&
    LOOPBACK.has(host);
  if (
    (origin.protocol !== 'https:' && !localTest) ||
    !origin.hostname ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(
      'APP_ORIGIN must be an HTTPS origin without credentials, path, query or fragment; HTTP is allowed only for loopback tests or explicitly enabled local-only serving.',
    );
  }
  const portText = process.env.PORT ?? '3000';
  const port = Number(portText);
  if (!/^\d{1,5}$/u.test(portText) || port > 65535 || port < (testing ? 0 : 1)) {
    throw new Error('PORT must be a valid listening port.');
  }
  let directory;
  try {
    directory = await realpath(resolve(ROOT, 'dist'));
    const indexPath = await realpath(resolve(directory, 'index.html'));
    if (!isWithin(indexPath, directory) || !(await stat(indexPath)).isFile()) throw new Error();
  } catch {
    throw new Error(
      'The production build is missing or invalid. Run the build before starting the server.',
    );
  }
  return {
    directory,
    host,
    port,
    secure: origin.protocol === 'https:',
    credentialHash: digest(`${username}:${password}`),
  };
}

function authenticate(request, expectedHash) {
  // Reject duplicate credentials instead of depending on intermediary header merging.
  let authHeaders = 0;
  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    if (request.rawHeaders[i].toLowerCase() === 'authorization') authHeaders++;
  }
  const header = request.headers.authorization;
  if (authHeaders !== 1 || typeof header !== 'string' || header.length > 8192) return false;
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/iu.exec(header);
  if (!match) return false;
  const decoded = Buffer.from(match[1], 'base64');
  if (decoded.toString('base64') !== match[1]) return false;
  // Both operands always have SHA-256's fixed length; username/password lengths
  // and partial matches never influence the credential comparison.
  return timingSafeEqual(digest(decoded), expectedHash);
}

function securityHeaders(response, secure) {
  response.setHeader('Content-Security-Policy', CSP);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Vary', 'Authorization');
  if (secure) response.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

function reply(request, response, status, message) {
  const body = `${message}\n`;
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.setHeader('Content-Length', Buffer.byteLength(body));
  response.end(request.method === 'HEAD' ? undefined : body);
}

async function start() {
  const config = await configure();
  const failures = new Map();
  const failureWindowMs = 60_000;
  const maxFailures = 20;
  const maxTrackedAddresses = 2048;

  function recentFailures(address, now) {
    const record = failures.get(address);
    if (record && record.until > now) return record;
    failures.delete(address);
    return undefined;
  }

  function recordFailure(address, now) {
    const record = recentFailures(address, now);
    if (record) {
      record.count++;
      return;
    }
    if (failures.size >= maxTrackedAddresses) {
      for (const [key, value] of failures) if (value.until <= now) failures.delete(key);
      if (failures.size >= maxTrackedAddresses) failures.delete(failures.keys().next().value);
    }
    failures.set(address, { count: 1, until: now + failureWindowMs });
  }

  const server = createServer(
    {
      maxHeaderSize: 16_384,
      requestTimeout: 15_000,
      headersTimeout: 10_000,
      keepAliveTimeout: 5_000,
    },
    (request, response) => {
      void handle(request, response).catch(() => {
        if (!response.headersSent && !response.destroyed)
          reply(request, response, 500, 'Unable to serve this request.');
        else response.destroy();
      });
    },
  );
  server.maxConnections = 200;
  server.maxRequestsPerSocket = 100;

  async function handle(request, response) {
    securityHeaders(response, config.secure);
    // Use the actual peer only. Forwarded IP headers are not trusted.
    const address = request.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const record = recentFailures(address, now);
    if (record && record.count >= maxFailures) {
      response.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil((record.until - now) / 1000))),
      );
      return reply(request, response, 429, 'Please try again later.');
    }
    if (!authenticate(request, config.credentialHash)) {
      recordFailure(address, now);
      response.setHeader('WWW-Authenticate', 'Basic realm="Private site", charset="UTF-8"');
      return reply(request, response, 401, 'Authentication required.');
    }
    failures.delete(address);

    // Authentication precedes method checks, path validation and filesystem access.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      return reply(request, response, 405, 'Method not allowed.');
    }
    let pathname;
    try {
      const target = request.url ?? '';
      if (!target.startsWith('/') || target.startsWith('//')) throw new Error();
      pathname = decodeURIComponent(target.split('?')[0]);
      if (
        /[\u0000-\u001f\u007f\\]/u.test(pathname) ||
        pathname.split('/').some((part) => part === '..' || part === '.')
      )
        throw new Error();
    } catch {
      return reply(request, response, 400, 'Invalid request.');
    }
    if (pathname === '/') pathname = '/index.html';
    const candidate = resolve(config.directory, `.${pathname}`);
    if (!isWithin(candidate, config.directory))
      return reply(request, response, 400, 'Invalid request.');
    let handle;
    try {
      const actual = await realpath(candidate);
      if (!isWithin(actual, config.directory)) return reply(request, response, 404, 'Not found.');
      handle = await open(actual, 'r');
      const details = await handle.stat();
      if (!details.isFile()) return reply(request, response, 404, 'Not found.');
      const extension = extname(actual).toLowerCase();
      response.statusCode = 200;
      response.setHeader('Content-Type', MIME_TYPES.get(extension) ?? 'application/octet-stream');
      response.setHeader('Content-Length', details.size);
      response.setHeader(
        'Cache-Control',
        extension === '.html' ? 'no-store' : 'private, max-age=3600, must-revalidate',
      );
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      await pipeline(handle.createReadStream({ autoClose: false }), response);
    } catch (error) {
      if (response.headersSent || response.destroyed) {
        response.destroy();
        return;
      }
      if (['ENOENT', 'ENOTDIR', 'EISDIR', 'EACCES', 'ELOOP'].includes(error.code))
        return reply(request, response, 404, 'Not found.');
      throw error;
    } finally {
      await handle?.close();
    }
  }

  server.on('error', () => {
    console.error('Server could not listen with the configured host and port.');
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () => {
    // Deliberately omit credentials, URLs, request paths and authentication data.
    console.log(`Server ready on port ${server.address().port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => {
        server.closeAllConnections();
        process.exit(0);
      }, 2000).unref();
    });
  }
}

start().catch((error) => {
  console.error(`Server did not start: ${error.message}`);
  process.exitCode = 1;
});
