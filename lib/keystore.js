'use strict';

/*
 * Protection for GolDid's master encryption key.
 *
 * Provider API keys in config.json are encrypted with a 32-byte AES-256-GCM
 * master key. This module decides how that master key itself is protected, best
 * option first:
 *
 *   1. tpm      — sealed by the TPM 2.0 and never stored in plaintext.
 *                 Windows: an RSA key in the Microsoft Platform Crypto Provider.
 *                 Linux:   a sealed object held at a persistent TPM handle via
 *                          tpm2-tools (auto-installed on /keystore migrate).
 *   2. machine  — no TPM: the key is double-encrypted (two AES-256-GCM layers,
 *                 each with a key derived from stable machine identifiers) and
 *                 hidden outside ~/.goldid. Copying the file to another machine
 *                 is useless, but this is machine-binding + obscurity, NOT real
 *                 protection against code running as you. Honest about that.
 *   3. plaintext— legacy ~/.goldid/key.bin (kept readable for back-compat).
 *
 * Files:
 *   ~/.goldid/key.bin          legacy plaintext master key
 *   ~/.goldid/key.tpm          TPM marker/wrapped key (JSON)
 *   ~/.goldid/tpm-helper.ps1   Windows CNG helper (inspectable)
 *   ~/.cache/.gd-syscache.bin  machine-bound double-encrypted key (hidden store)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const DIR = path.join(os.homedir(), '.goldid');
const PLAIN_KEY = path.join(DIR, 'key.bin');
const WRAPPED_KEY = path.join(DIR, 'key.tpm');
const HELPER = path.join(DIR, 'tpm-helper.ps1');

// Hidden machine-bound store, deliberately outside ~/.goldid.
const HIDDEN_DIR = path.join(os.homedir(), '.cache');
const MACHINE_KEY = path.join(HIDDEN_DIR, '.gd-syscache.bin');

const KEY_BYTES = 32;
// Not a secret (open source) — just an extra fixed input to the second layer.
const APP_PEPPER = 'goldid/keystore/v1';

let cachedKey = null;
let tpmAvailable = null;

// =============================================================================
// Windows TPM via the Microsoft Platform Crypto Provider (CNG)
// =============================================================================

const HELPER_PS1 = `param([Parameter(Mandatory=$true)][string]$Action)
$ErrorActionPreference = 'Stop'
$keyName  = 'GolDidMasterKEK'
$provider = 'Microsoft Platform Crypto Provider'

function Get-KEK {
  $cngProvider = [System.Security.Cryptography.CngProvider]::new($provider)
  if ([System.Security.Cryptography.CngKey]::Exists($keyName, $cngProvider)) {
    return [System.Security.Cryptography.CngKey]::Open($keyName, $cngProvider)
  }
  $params = [System.Security.Cryptography.CngKeyCreationParameters]::new()
  $params.Provider = $cngProvider
  $params.KeyCreationOptions = [System.Security.Cryptography.CngKeyCreationOptions]::None
  $lenBytes = [BitConverter]::GetBytes([int]2048)
  $lenProp  = [System.Security.Cryptography.CngProperty]::new('Length', $lenBytes, [System.Security.Cryptography.CngPropertyOptions]::None)
  $params.Parameters.Add($lenProp)
  return [System.Security.Cryptography.CngKey]::Create([System.Security.Cryptography.CngAlgorithm]::Rsa, $keyName, $params)
}

$kek = Get-KEK
$rsa = [System.Security.Cryptography.RSACng]::new($kek)
$pad = [System.Security.Cryptography.RSAEncryptionPadding]::OaepSHA256

if ($Action -eq 'check') {
  Write-Output 'ok'
} elseif ($Action -eq 'wrap') {
  $in  = [Console]::In.ReadToEnd().Trim()
  $enc = $rsa.Encrypt([Convert]::FromBase64String($in), $pad)
  Write-Output ([Convert]::ToBase64String($enc))
} elseif ($Action -eq 'unwrap') {
  $in  = [Console]::In.ReadToEnd().Trim()
  $dec = $rsa.Decrypt([Convert]::FromBase64String($in), $pad)
  Write-Output ([Convert]::ToBase64String($dec))
} else {
  throw "unknown action: $Action"
}
`;

function ensureHelper() {
  fs.mkdirSync(DIR, { recursive: true });
  let current = '';
  try { current = fs.readFileSync(HELPER, 'utf8'); } catch { /* missing */ }
  if (current !== HELPER_PS1) fs.writeFileSync(HELPER, HELPER_PS1, { mode: 0o600 });
}

function winHelper(action, inputB64) {
  ensureHelper();
  return execFileSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', HELPER, '-Action', action],
    { input: inputB64 || '', encoding: 'utf8', windowsHide: true, timeout: 20000 }
  ).trim();
}

function winTpmAvailable() {
  try { return winHelper('check') === 'ok'; } catch { return false; }
}

// =============================================================================
// Linux TPM via tpm2-tools
// =============================================================================

const LINUX_TPM_HANDLE = '0x81010005';

function hasCmd(cmd) {
  try { execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function linuxHasTpmDevice() {
  return fs.existsSync('/dev/tpmrm0') || fs.existsSync('/dev/tpm0');
}

// Presence of the device + tools isn't enough — confirm we can actually talk to
// the TPM (often gated behind the 'tss' group / root). A cheap getcap proves access.
function linuxTpmAccessible() {
  try { execFileSync('tpm2_getcap', ['properties-fixed'], { stdio: 'ignore', timeout: 10000 }); return true; }
  catch { return false; }
}

function linuxTpmAvailable() {
  return process.platform === 'linux' && linuxHasTpmDevice() && hasCmd('tpm2_unseal') && linuxTpmAccessible();
}

/** Detect the distro package manager and the command to install tpm2-tools. */
function tpm2InstallCommand() {
  const managers = [
    ['apt-get', 'apt-get update && apt-get install -y tpm2-tools'],
    ['dnf', 'dnf install -y tpm2-tools'],
    ['yum', 'yum install -y tpm2-tools'],
    ['pacman', 'pacman -S --noconfirm tpm2-tools'],
    ['zypper', 'zypper --non-interactive install tpm2-tools'],
    ['apk', 'apk add tpm2-tools'],
  ];
  for (const [bin, cmd] of managers) if (hasCmd(bin)) return cmd;
  return null;
}

/** Attempt to install tpm2-tools on Linux. Needs root or sudo. */
function installTpm2Linux() {
  const cmd = tpm2InstallCommand();
  if (!cmd) return { ok: false, message: 'No supported package manager found (apt/dnf/pacman/zypper/apk).' };
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  const full = isRoot ? cmd : (hasCmd('sudo') ? `sudo sh -c '${cmd}'` : null);
  if (!full) return { ok: false, message: 'tpm2-tools missing and neither root nor sudo is available to install it.' };
  try {
    execFileSync('sh', ['-c', full], { stdio: 'inherit', timeout: 300000 });
  } catch (e) {
    return { ok: false, message: 'Install command failed: ' + e.message };
  }
  return hasCmd('tpm2_unseal')
    ? { ok: true, message: 'tpm2-tools installed.' }
    : { ok: false, message: 'Install ran but tpm2_unseal is still missing.' };
}

function linuxSeal(keyBuf) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdtpm-'));
  try {
    // Release any prior object at our handle (ignore if none).
    try { execFileSync('tpm2_evictcontrol', ['-C', 'o', '-c', LINUX_TPM_HANDLE], { stdio: 'ignore' }); } catch { /* none */ }
    const primary = path.join(tmp, 'primary.ctx');
    execFileSync('tpm2_createprimary', ['-C', 'o', '-g', 'sha256', '-G', 'rsa', '-c', primary], { stdio: 'ignore' });
    const kf = path.join(tmp, 'k.bin');
    fs.writeFileSync(kf, keyBuf, { mode: 0o600 });
    execFileSync('tpm2_create', ['-C', primary, '-g', 'sha256', '-i', kf,
      '-u', path.join(tmp, 'seal.pub'), '-r', path.join(tmp, 'seal.priv')], { stdio: 'ignore' });
    const sealCtx = path.join(tmp, 'seal.ctx');
    execFileSync('tpm2_load', ['-C', primary, '-u', path.join(tmp, 'seal.pub'),
      '-r', path.join(tmp, 'seal.priv'), '-c', sealCtx], { stdio: 'ignore' });
    execFileSync('tpm2_evictcontrol', ['-C', 'o', '-c', sealCtx, LINUX_TPM_HANDLE], { stdio: 'ignore' });
    return JSON.stringify({ tpm: 'linux', handle: LINUX_TPM_HANDLE });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function linuxUnseal(stored) {
  const { handle } = JSON.parse(stored);
  const out = execFileSync('tpm2_unseal', ['-c', handle], { maxBuffer: 4096 });
  return Buffer.from(out);
}

// =============================================================================
// Cross-platform TPM dispatch
// =============================================================================

function isTpmAvailable() {
  if (tpmAvailable !== null) return tpmAvailable;
  if (process.platform === 'win32') tpmAvailable = winTpmAvailable();
  else if (process.platform === 'linux') tpmAvailable = linuxTpmAvailable();
  else tpmAvailable = false;
  return tpmAvailable;
}

function sealWithTpm(keyBuf) {
  if (process.platform === 'win32') return JSON.stringify({ tpm: 'win', data: winHelper('wrap', keyBuf.toString('base64')) });
  if (process.platform === 'linux') return linuxSeal(keyBuf);
  throw new Error('TPM sealing not supported on this platform');
}

function unsealWithTpm(stored) {
  const meta = JSON.parse(stored);
  if (meta.tpm === 'win') return Buffer.from(winHelper('unwrap', meta.data), 'base64');
  if (meta.tpm === 'linux') return linuxUnseal(stored);
  throw new Error('unknown TPM marker');
}

// =============================================================================
// Machine-bound double-encryption fallback (no TPM)
// =============================================================================

function machineSecret() {
  const parts = [os.hostname(), process.platform, os.arch()];
  try { parts.push(os.userInfo().username); } catch { /* ignore */ }
  for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
    try { parts.push(fs.readFileSync(f, 'utf8').trim()); } catch { /* ignore */ }
  }
  return parts.filter(Boolean).join('|');
}

function deriveKey(label, salt) {
  return crypto.scryptSync(`${machineSecret()}|${label}`, salt, KEY_BYTES);
}

function gcmEncrypt(key, data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ct };
}

function gcmDecrypt(key, iv, tag, ct) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

function machineWrap(keyBuf) {
  const s1 = crypto.randomBytes(16);
  const s2 = crypto.randomBytes(16);
  const inner = gcmEncrypt(deriveKey('L1', s1), keyBuf);                       // layer 1
  const outer = gcmEncrypt(deriveKey('L2|' + APP_PEPPER, s2), inner.ct);       // layer 2
  return JSON.stringify({
    v: 1,
    s1: s1.toString('base64'), iv1: inner.iv.toString('base64'), tag1: inner.tag.toString('base64'),
    s2: s2.toString('base64'), iv2: outer.iv.toString('base64'), tag2: outer.tag.toString('base64'),
    data: outer.ct.toString('base64'),
  });
}

function machineUnwrap(stored) {
  const j = JSON.parse(stored);
  const b = (x) => Buffer.from(x, 'base64');
  const ct1 = gcmDecrypt(deriveKey('L2|' + APP_PEPPER, b(j.s2)), b(j.iv2), b(j.tag2), b(j.data));
  return gcmDecrypt(deriveKey('L1', b(j.s1)), b(j.iv1), b(j.tag1), ct1);
}

function writeMachineStore(keyBuf) {
  fs.mkdirSync(HIDDEN_DIR, { recursive: true });
  fs.writeFileSync(MACHINE_KEY, machineWrap(keyBuf), { mode: 0o600 });
}

// =============================================================================
// Master-key resolution
// =============================================================================

function mode() {
  if (fs.existsSync(WRAPPED_KEY)) return 'tpm';
  if (fs.existsSync(MACHINE_KEY)) return 'machine';
  if (fs.existsSync(PLAIN_KEY)) return 'plaintext';
  return 'none';
}

/** Return the 32-byte master key, creating + protecting it on first use. Cached. */
function getMasterKey() {
  if (cachedKey) return cachedKey;
  fs.mkdirSync(DIR, { recursive: true });

  if (fs.existsSync(WRAPPED_KEY)) {
    try {
      const key = unsealWithTpm(fs.readFileSync(WRAPPED_KEY, 'utf8'));
      if (key.length === KEY_BYTES) { cachedKey = key; return key; }
    } catch { /* fall through */ }
  }
  if (fs.existsSync(MACHINE_KEY)) {
    try {
      const key = machineUnwrap(fs.readFileSync(MACHINE_KEY, 'utf8'));
      if (key.length === KEY_BYTES) { cachedKey = key; return key; }
    } catch { /* fall through */ }
  }
  try {
    const key = fs.readFileSync(PLAIN_KEY);
    if (key.length === KEY_BYTES) { cachedKey = key; return key; }
  } catch { /* create below */ }

  // No key yet — create one and protect it the best available way.
  const key = crypto.randomBytes(KEY_BYTES);
  if (isTpmAvailable()) {
    try { fs.writeFileSync(WRAPPED_KEY, sealWithTpm(key), { mode: 0o600 }); cachedKey = key; return key; }
    catch { /* fall back */ }
  }
  try { writeMachineStore(key); cachedKey = key; return key; }
  catch { /* last resort */ }
  fs.writeFileSync(PLAIN_KEY, key, { mode: 0o600 });
  cachedKey = key;
  return key;
}

/**
 * Secure the master key the best available way: TPM if present (auto-installing
 * tpm2-tools on Linux when needed), otherwise the machine-bound hidden store.
 */
function migrateToTpm() {
  // On Linux with a TPM chip but no tools, try to install them first.
  if (process.platform === 'linux' && linuxHasTpmDevice() && !hasCmd('tpm2_unseal')) {
    const inst = installTpm2Linux();
    tpmAvailable = null; // re-detect after install
    if (!inst.ok) {
      // Fall through to machine-bound storage with the install note.
      const key = getMasterKey();
      writeMachineStore(key);
      cleanupAfter('machine');
      return { ok: true, changed: true, message: `${inst.message} Used machine-bound encrypted storage instead.` };
    }
  }

  const key = getMasterKey();

  if (isTpmAvailable()) {
    try {
      fs.writeFileSync(WRAPPED_KEY, sealWithTpm(key), { mode: 0o600 });
      const check = unsealWithTpm(fs.readFileSync(WRAPPED_KEY, 'utf8'));
      if (!check.equals(key)) throw new Error('round-trip mismatch');
      cleanupAfter('tpm');
      cachedKey = key;
      return { ok: true, changed: true, message: 'Master key is now sealed by the TPM. Plaintext key removed.' };
    } catch (e) {
      rm(WRAPPED_KEY);
      // TPM looked available but sealing failed — don't lose the key, fall back.
      writeMachineStore(key);
      cleanupAfter('machine');
      cachedKey = key;
      return { ok: true, changed: true, message: `TPM sealing failed (${e.message}); used machine-bound encrypted storage instead.` };
    }
  }

  // No usable TPM: machine-bound double-encrypted hidden store.
  // Distinguish "no chip" from "chip present but no access" so the hint is useful.
  let note = '';
  if (process.platform === 'linux' && linuxHasTpmDevice()) {
    note = ' (a TPM device exists but is not accessible — add your user to the "tss" group and re-login, then retry /keystore migrate)';
  }
  writeMachineStore(key);
  const check = machineUnwrap(fs.readFileSync(MACHINE_KEY, 'utf8'));
  if (!check.equals(key)) {
    rm(MACHINE_KEY);
    return { ok: false, changed: false, message: 'Machine-store verification failed; nothing changed.' };
  }
  cleanupAfter('machine');
  cachedKey = key;
  return { ok: true, changed: true, message: `No usable TPM${note} — master key double-encrypted and hidden, bound to this machine. key.bin removed.` };
}

// Remove the lower-security stores once a stronger one is in place.
function cleanupAfter(active) {
  if (active === 'tpm') { rm(MACHINE_KEY); rm(PLAIN_KEY); }
  else if (active === 'machine') { rm(PLAIN_KEY); }
}
function rm(p) { try { fs.rmSync(p, { force: true }); } catch { /* ignore */ } }

function revertToPlaintext() {
  if (mode() === 'plaintext') return { ok: true, changed: false, message: 'Already plaintext.' };
  const key = getMasterKey();
  fs.writeFileSync(PLAIN_KEY, key, { mode: 0o600 });
  rm(WRAPPED_KEY); rm(MACHINE_KEY);
  cachedKey = key;
  return { ok: true, changed: true, message: 'Reverted to plaintext key.bin.' };
}

function status() {
  return {
    mode: mode(),
    platform: process.platform,
    tpmAvailable: isTpmAvailable(),
    linuxTpmDevice: process.platform === 'linux' ? linuxHasTpmDevice() : false,
    tpm2ToolsInstalled: process.platform === 'linux' ? hasCmd('tpm2_unseal') : null,
    wrappedKeyPath: WRAPPED_KEY,
    machineKeyPath: MACHINE_KEY,
    plainKeyPath: PLAIN_KEY,
  };
}

module.exports = {
  getMasterKey,
  isTpmAvailable,
  migrateToTpm,
  revertToPlaintext,
  installTpm2Linux,
  status,
  mode,
  PLAIN_KEY,
  WRAPPED_KEY,
  MACHINE_KEY,
};
