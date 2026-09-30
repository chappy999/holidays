#!/usr/bin/env python3
"""Exercise the extracted dependency-free bundle through a real hidden-password terminal."""
import base64
import http.client
import os
from pathlib import Path
import pty
import secrets
import select
import signal
import socket
import subprocess
import tempfile
import termios
import time
import zipfile

root = Path(__file__).resolve().parent.parent
with socket.socket() as check:
    check.bind(('127.0.0.1', 3000))
with tempfile.TemporaryDirectory(prefix='japan-local-check-') as temp:
    with zipfile.ZipFile(root / 'releases/japan-together-local.zip') as archive:
        members = archive.namelist()
        assert not any('.env' in name or 'node_modules/' in name for name in members)
        archive.extractall(temp)
    directory = Path(temp) / 'japan-together'
    master, slave = pty.openpty()
    environment = dict(os.environ)
    for name in ('PLANNER_PASSWORD', 'PLANNER_USERNAME'):
        environment.pop(name, None)
    process = subprocess.Popen(['node', 'scripts/start-local.mjs'], cwd=directory,
                               env=environment, stdin=slave, stdout=slave, stderr=slave)
    transcript = ''
    password = secrets.token_urlsafe(28)
    def until(marker, timeout=8):
        global transcript
        limit = time.monotonic() + timeout
        while marker not in transcript:
            if time.monotonic() > limit:
                raise AssertionError('Local launcher did not reach the expected prompt/readiness state')
            if select.select([master], [], [], .1)[0]:
                transcript += os.read(master, 8192).decode('utf8', 'replace')
    try:
        until('Password: ')
        limit = time.monotonic() + 2
        while termios.tcgetattr(slave)[3] & termios.ECHO:
            if time.monotonic() > limit: raise AssertionError('Password input was not hidden')
            time.sleep(.01)
        os.write(master, password.encode() + b'\r')
        until('Confirm password: ')
        limit = time.monotonic() + 2
        while termios.tcgetattr(slave)[3] & termios.ECHO:
            if time.monotonic() > limit: raise AssertionError('Confirmation input was not hidden')
            time.sleep(.01)
        os.write(master, password.encode() + b'\r')
        until('Press Ctrl+C here')
        assert password not in transcript, 'Password was echoed in terminal output'
        assert 'cloudflared tunnel --url http://127.0.0.1:3000' in transcript
        connection = http.client.HTTPConnection('127.0.0.1', 3000, timeout=5)
        connection.request('GET', '/')
        response = connection.getresponse()
        assert response.status == 401
        assert response.read() == b'Authentication required.\n'
        authorization = 'Basic ' + base64.b64encode(('charlie-and-daniella:' + password).encode()).decode()
        connection.request('GET', '/', headers={'Authorization': authorization})
        response = connection.getresponse()
        assert response.status == 200
        assert b'Japan, together' in response.read()
        connection.close()
        print('Extracted local bundle passed: no dependencies/credentials bundled; hidden interactive password and confirmation; 401 without login; built app served after login.')
    finally:
        process.send_signal(signal.SIGTERM)
        try: process.wait(timeout=6)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        os.close(master)
        os.close(slave)
