#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { emitKeypressEvents } from 'node:readline';
import { fileURLToPath } from 'node:url';

// Prompts are local to the user's terminal. Passwords are never logged or saved.
function passwordPrompt(label) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    return Promise.reject(
      new Error('Open an interactive terminal to enter your password securely.'),
    );
  }
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const wasRaw = input.isRaw;
    let value = '';
    process.stdout.write(label);
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    const finish = (error) => {
      input.off('keypress', keypress);
      input.setRawMode(wasRaw);
      input.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const keypress = (text, key = {}) => {
      if (key.ctrl && key.name === 'c') return finish(new Error('Cancelled.'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') {
        value = Array.from(value).slice(0, -1).join('');
        return;
      }
      if (key.ctrl && key.name === 'u') {
        value = '';
        return;
      }
      if (!key.ctrl && !key.meta && text && !/[\u0000-\u001f\u007f]/u.test(text)) value += text;
    };
    input.on('keypress', keypress);
  });
}

async function main() {
  await access(new URL('../dist/index.html', import.meta.url)).catch(() => {
    throw new Error(
      'The built app is missing. Use the local-ready download, or run npm ci and npm run build.',
    );
  });
  let password = process.env.PLANNER_PASSWORD;
  if (password === undefined) {
    console.log('Japan, together — private local startup');
    console.log('Choose a password of at least 16 characters. It will not appear as you type.');
    password = await passwordPrompt('Password: ');
    if (password.length < 16 || password.length > 1024 || /[\u0000-\u001f\u007f]/u.test(password)) {
      throw new Error(
        'Use 16–1024 characters without control characters, then run this command again.',
      );
    }
    const confirmation = await passwordPrompt('Confirm password: ');
    if (password !== confirmation)
      throw new Error('Passwords did not match. Run this command again.');
  }
  const username = process.env.PLANNER_USERNAME || 'charlie-and-daniella';
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('../server.mjs', import.meta.url))],
    {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3000',
        APP_ORIGIN: 'http://127.0.0.1:3000',
        PLANNER_LOCAL_ONLY: '1',
        PLANNER_USERNAME: username,
        PLANNER_PASSWORD: password,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  // The server handles validation, including a port already being in use.
  let output = '';
  let ready = false;
  child.stdout.on('data', (chunk) => {
    output = (output + chunk.toString()).slice(-1000);
    if (!ready && output.includes('Server ready on port 3000')) {
      ready = true;
      console.log('\nPrivate app ready on this computer: http://127.0.0.1:3000');
      console.log(`Login name: ${username}`);
      console.log('\nTo share, open a SECOND terminal and run:');
      console.log('  cloudflared tunnel --url http://127.0.0.1:3000');
      console.log('\nCloudflare will print a temporary HTTPS link. Send that link to Daniella.');
      console.log(
        'Keep both terminals open and this computer awake. Download your plan before stopping.',
      );
      console.log('Press Ctrl+C here to stop the private app.');
    }
  });
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  child.once('error', () => {
    console.error('Could not start the private app. Check that Node.js is installed.');
    process.exitCode = 1;
  });
  const stop = () => child.kill('SIGTERM');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.once('exit', (code, signal) => {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    if (!ready)
      console.error(
        'No sharing command was started. Check the message above; port 3000 may already be in use.',
      );
    process.exitCode = signal ? 0 : code || 0;
  });
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
