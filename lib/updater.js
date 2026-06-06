'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PACKAGE_URL = 'https://raw.githubusercontent.com/wafflebyte8-hue/Goldid/main/package.json';
const CONTENTS_URL = 'https://api.github.com/repos/wafflebyte8-hue/Goldid/contents/package.json?ref=main';
const SETUP_PS1_URL = 'https://raw.githubusercontent.com/wafflebyte8-hue/Goldid/main/setup.ps1';
const SETUP_SH_URL = 'https://raw.githubusercontent.com/wafflebyte8-hue/Goldid/main/setup.sh';
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

async function fetchJson(url, accept = 'application/json') {
  const res = await fetch(url, {
    headers: {
      Accept: accept,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'User-Agent': 'GolDid updater',
    },
  });
  if (!res.ok) throw new Error(`update check failed: HTTP ${res.status}`);
  return res.json();
}

async function rawPackageVersion() {
  const sep = PACKAGE_URL.includes('?') ? '&' : '?';
  const json = await fetchJson(`${PACKAGE_URL}${sep}t=${Date.now()}`);
  if (!json.version) throw new Error('update check failed: latest package has no version');
  return json.version;
}

async function contentsPackageVersion() {
  const json = await fetchJson(CONTENTS_URL, 'application/vnd.github+json');
  if (!json.content) throw new Error('update check failed: package content is missing');
  const text = Buffer.from(String(json.content).replace(/\s/g, ''), 'base64').toString('utf8');
  const pkg = JSON.parse(text);
  if (!pkg.version) throw new Error('update check failed: latest package has no version');
  return pkg.version;
}

async function latestVersion() {
  const settled = await Promise.allSettled([contentsPackageVersion(), rawPackageVersion()]);
  const versions = settled
    .filter((item) => item.status === 'fulfilled')
    .map((item) => item.value);
  if (!versions.length) {
    const reason = settled.find((item) => item.status === 'rejected')?.reason;
    throw reason || new Error('update check failed');
  }
  return versions.sort(compareVersions).at(-1);
}

async function fetchText(url) {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}t=${Date.now()}`, {
    headers: {
      Accept: 'text/plain',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'User-Agent': 'GolDid updater',
    },
  });
  if (!res.ok) throw new Error(`could not download updater script: HTTP ${res.status}`);
  return res.text();
}

async function ensureInstallerScript(rootDir) {
  if (process.platform === 'win32') {
    const local = path.join(rootDir, 'setup.ps1');
    if (fs.existsSync(local)) return local;
    const script = await fetchText(SETUP_PS1_URL);
    const temp = path.join(os.tmpdir(), `goldid-update-${process.pid}-${Date.now()}.ps1`);
    fs.writeFileSync(temp, script, 'utf8');
    return temp;
  }

  const local = path.join(rootDir, 'setup.sh');
  if (fs.existsSync(local)) return local;
  const script = await fetchText(SETUP_SH_URL);
  const temp = path.join(os.tmpdir(), `goldid-update-${process.pid}-${Date.now()}.sh`);
  fs.writeFileSync(temp, script, { encoding: 'utf8', mode: 0o755 });
  return temp;
}

async function check(currentVersion) {
  const latest = await latestVersion();
  return {
    current: currentVersion,
    latest,
    updateAvailable: compareVersions(latest, currentVersion) > 0,
  };
}

async function installerCommand(rootDir) {
  if (process.platform === 'win32') {
    const script = await ensureInstallerScript(rootDir);
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-InstallDir', rootDir],
    };
  }

  const script = await ensureInstallerScript(rootDir);
  return {
    command: 'bash',
    args: [script, '--install-dir', rootDir],
  };
}

async function runInstaller(rootDir) {
  const { command, args } = await installerCommand(rootDir);
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
