'use strict';

const { spawn } = require('child_process');
const electron = require('electron');
const path = require('path');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const args = [];
if (process.platform === 'linux' && env.GOLDID_ELECTRON_SANDBOX !== '1') {
  args.push('--no-sandbox');
}
if (process.platform === 'linux' && env.GOLDID_ELECTRON_GPU !== '1') {
  args.push('--disable-gpu', '--disable-software-rasterizer');
}
if (process.platform === 'linux') {
  args.push('--disable-dev-shm-usage', '--gtk-version=3');
}
args.push(path.join(__dirname, 'main.js'));

const child = spawn(electron, args, { stdio: 'inherit', env, cwd: path.resolve(__dirname, '..') });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
