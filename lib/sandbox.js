'use strict';

/*
 * Sandboxing for GolDid's filesystem and shell tools.
 *
 * Modes (stored at cfg.agent.sandbox):
 *   - "off"    : current behavior — tools touch the host freely.
 *   - "jail"   : pure-Node path confinement. read/write/list and shell are
 *                locked to the directory GolDid was launched in. A guardrail,
 *                not true isolation: a determined shell command can still escape.
 *   - "docker" : shell commands run inside a throwaway container with the jail
 *                root mounted at /work. Real isolation. Filesystem tools still
 *                run on the host but stay path-confined to the jail root.
 *
 * The jail root is the working directory captured once, when this module is
 * first required at startup — i.e. wherever the user ran `gd`.
 */

const path = require('path');
const { execSync } = require('child_process');

const JAIL_ROOT = process.cwd();
const DEFAULT_IMAGE = 'alpine';

// Which argument keys, per tool, name a filesystem path that must be confined.
const PATH_ARGS = {
  read_file: ['path'],
  list_dir: ['path'],
  file_info: ['path'],
  find_files: ['path'],
  search_text: ['path'],
  write_file: ['path'],
  generate_image: ['path'],
};

function mode(cfg) {
  const m = cfg && cfg.agent && cfg.agent.sandbox;
  return m === 'jail' || m === 'docker' ? m : 'off';
}

function image(cfg) {
  const i = cfg && cfg.agent && cfg.agent.sandboxImage;
  return (typeof i === 'string' && i.trim()) || DEFAULT_IMAGE;
}

/**
 * Resolve a caller-supplied path against the jail root and refuse anything that
 * escapes it. Returns the absolute, confined path; throws on escape.
 */
function resolveInJail(p, root = JAIL_ROOT) {
  const abs = path.resolve(root, p == null || p === '' ? '.' : String(p));
  const rel = path.relative(root, abs);
  if (rel && (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel))) {
    throw new Error(
      `sandbox: path "${p}" is outside the allowed directory (${root}). ` +
        'Run /sandbox off to disable confinement.'
    );
  }
  return abs;
}

/**
 * Enforce path confinement on a parsed tool call, mutating its path args to the
 * resolved absolute paths. No-op for tools without path args. Throws on escape.
 */
function enforcePaths(call) {
  const keys = PATH_ARGS[call.name];
  if (!keys || !call.args) return;
  for (const k of keys) {
    if (call.args[k] != null && call.args[k] !== '') {
      call.args[k] = resolveInJail(call.args[k]);
    }
  }
}

let dockerOk = null;
function dockerAvailable() {
  if (dockerOk !== null) return dockerOk;
  try {
    execSync('docker --version', { stdio: 'ignore', windowsHide: true });
    dockerOk = true;
  } catch {
    dockerOk = false;
  }
  return dockerOk;
}

/**
 * Given a raw shell command and the active sandbox config, return the
 * { command, options } to hand to child_process.exec. In jail mode the working
 * directory is pinned to the jail root; in docker mode the command is wrapped to
 * run inside a container with the jail root mounted at /work.
 */
function wrapShell(rawCommand, cfg) {
  const m = mode(cfg);
  if (m === 'off') return { command: rawCommand, options: {} };

  if (m === 'docker') {
    if (!dockerAvailable()) {
      throw new Error(
        'sandbox: docker mode is on but Docker is not available. ' +
          'Install/start Docker, or switch with /sandbox jail (or /sandbox off).'
      );
    }
    // Pass the command to the container shell via stdin-safe single arg.
    const img = image(cfg);
    const escaped = String(rawCommand).replace(/'/g, `'\\''`);
    const command =
      `docker run --rm -i -w /work -v "${JAIL_ROOT}:/work" ${img} ` +
      `sh -c '${escaped}'`;
    return { command, options: {} };
  }

  // jail mode: pin the process working directory to the jail root.
  return { command: rawCommand, options: { cwd: JAIL_ROOT } };
}

module.exports = {
  JAIL_ROOT,
  PATH_ARGS,
  mode,
  image,
  resolveInJail,
  enforcePaths,
  wrapShell,
  dockerAvailable,
};
