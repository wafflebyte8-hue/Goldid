'use strict';

/*
 * Agent action modes for GolDid. Controls how the agent treats actions that
 * modify the machine (the dangerous tools: shell, write_file, generate_image):
 *
 *   ask        Ask before every edit/command (default, safest).
 *   auto-edit  Run edits/commands automatically, no prompts.
 *   auto       The model judges safety: safe, easily-reversible actions run
 *              automatically; destructive/irreversible ones still ask first.
 *   plan       Never modify anything — investigate read-only and produce a plan.
 *
 * Read-only tools (read_file, list_dir, search_text, web_search, memory, ...)
 * always run regardless of mode.
 */

const MODES = ['ask', 'auto-edit', 'auto', 'plan'];

const MODE_LABELS = {
  ask: 'Ask before edits',
  'auto-edit': 'Edit automatically',
  auto: 'Auto (model decides safety)',
  plan: 'Plan mode (read-only)',
};

function getMode(cfg) {
  const m = cfg && cfg.agent && cfg.agent.mode;
  return MODES.includes(m) ? m : 'ask';
}

// Destructive / irreversible / privileged / system-affecting command patterns.
// In auto mode these still require explicit approval; everything else runs.
const DANGEROUS_PATTERNS = [
  /\brm\s+(-\w*\s+)*-\w*[rf]/i,                 // rm -rf, rm -r, rm -f
  /\brmdir\b/i,
  /\bdel\b|\berase\b/i,
  /remove-item\b[\s\S]*-(recurse|force)/i,
  /\bformat\b|\bmkfs\w*|\bdiskpart\b/i,
  /\bdd\s+if=/i,
  />\s*\/dev\/(sd|nvme|disk)/i,
  /\bshutdown\b|\breboot\b|\bhalt\b|\bpoweroff\b/i,
  /\b(kill|pkill|killall|taskkill)\b|stop-process\b/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,   // fork bomb
  /git\s+(push\b[\s\S]*--force|reset\s+--hard|clean\s+-\w*[fd])/i,
  /\bchmod\s+-R\b|\bchown\s+-R\b|\bicacls\b/i,
  /\breg\s+(delete|add)\b/i,
  /(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b[\s\S]*\|\s*(sh|bash|zsh|iex|invoke-expression)/i,
  /\bsudo\b|\brunas\b/i,
  /\bnet\s+(user|localgroup)\b/i,
  /\b(truncate|shred|wipefs)\b/i,
];

function isDangerousCommand(command) {
  return DANGEROUS_PATTERNS.some((re) => re.test(String(command || '')));
}

// Is this specific dangerous-tool action safe enough to run without asking?
function isSafeAction(toolName, args = {}) {
  if (toolName === 'generate_image') return true;
  if (toolName === 'write_file') return true; // create/edit a file; sandbox guards where
  if (toolName === 'shell') return !isDangerousCommand(args.command || '');
  return false;
}

/** Decide how to handle a tool call: 'run' (no prompt), 'ask' (approval), 'block'. */
function decide(mode, toolName, danger, args = {}) {
  if (!danger) return 'run';
  if (mode === 'plan') return 'block';
  if (mode === 'auto-edit') return 'run';
  if (mode === 'auto') return isSafeAction(toolName, args) ? 'run' : 'ask';
  return 'ask';
}

function blockedMessage(toolName) {
  return `Plan mode is on — not executing "${toolName}". Investigate with read-only tools and present a plan instead. The user can switch to "ask before edits" or "edit automatically" to run it.`;
}

/** Mode-specific guidance appended to the system prompt (empty for 'ask'). */
function promptGuidance(mode) {
  if (mode === 'plan') {
    return [
      '# Plan mode (READ-ONLY)',
      '',
      'You are in PLAN MODE. You MUST NOT change anything: do not write or overwrite',
      'files, do not run shell commands that modify state, and do not generate files.',
      'You MAY use read-only tools (read_file, list_dir, find_files, search_text,',
      'web_search) to investigate. Produce a clear, numbered PLAN of exactly what you',
      'would do — the specific commands and file edits, the risks, and what to verify',
      'afterward. If the user asks you to act, restate that you are in plan mode and',
      'present the plan instead of doing it. End by noting they can switch to "edit',
      'automatically" or "ask before edits" to execute it.',
    ].join('\n');
  }
  if (mode === 'auto') {
    return [
      '# Autonomous mode',
      '',
      'You may take safe, easily-reversible actions WITHOUT asking — reading,',
      'searching, creating or editing project files, and running non-destructive',
      'commands. But STOP and ask the user first before anything destructive,',
      'irreversible, privileged, or outside this project: deleting data, overwriting',
      'important files, force-pushing, system/network/account changes, installing',
      'software, or anything you could not easily undo. When in doubt, ask. Briefly',
      'say what you are doing as you go.',
    ].join('\n');
  }
  if (mode === 'auto-edit') {
    return [
      '# Automatic edits',
      '',
      'Your file edits and commands run without a confirmation prompt. Be deliberate:',
      'do exactly what the task needs and avoid destructive or irreversible actions',
      'unless the user explicitly asked for them.',
    ].join('\n');
  }
  return '';
}

module.exports = {
  MODES,
  MODE_LABELS,
  getMode,
  decide,
  isSafeAction,
  isDangerousCommand,
  blockedMessage,
  promptGuidance,
};
