'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PACKAGE_URL = 'https://raw.githubusercontent.com/wafflebyte8-hue/Goldid/main/package.json';
const TIMEOUT_MS = 10 * 60 * 1000;

function compareVersions(a, b) {
  const left = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const right = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) return diff > 0 ? 1 : -1;
  }
  return 0;
}

async function latestVersion() {
  const res = await fetch(PACKAGE_URL, {
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      'User-Agent': 'GolDid updater',
    },
  });
  if (!res.ok) throw new Error(`update check failed: HTTP ${res.status}`);
  const json = await res.json();
  if (!json.version) throw new Error('update check failed: latest package has no version');
  return json.version;
}

async function check(currentVersion) {
  const latest = await latestVersion();
  return {
    current: currentVersion,
    latest,
    updateAvailable: compareVersions(latest, currentVersion) > 0,
  };
}

function installerCommand(rootDir) {
  if (process.platform === 'win32') {
    const script = path.join(rootDir, 'setup.ps1');
    if (!fs.existsSync(script)) throw new Error('setup.ps1 is missing; cannot update this install');
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-InstallDir', rootDir],
    };
  }

  const script = path.join(rootDir, 'setup.sh');
  if (!fs.existsSync(script)) throw new Error('setup.sh is missing; cannot update this install');
  return {
    command: 'bash',
    args: [script, '--install-dir', rootDir],
  };
}

function runInstaller(rootDir) {
  const { command, args } = installerCommand(rootDir);
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(command, args, {
      cwd: rootDir,
      windowsHide: true,
      env,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('update timed out'));
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const detail = (stderr || stdout || '').trim();
        reject(new Error(detail || `updater exited with code ${code}`));
      }
    });
  });
}

async function update({ currentVersion, rootDir, force = false } = {}) {
  const status = await check(currentVersion);
  if (!force && !status.updateAvailable) {
    return { ...status, updated: false, skipped: true, output: 'GolDid is already up to date.' };
  }
  const result = await runInstaller(path.resolve(rootDir || process.cwd()));
  return {
    ...status,
    updated: true,
    skipped: false,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
  };
}

module.exports = {
  check,
  update,
  compareVersions,
};
