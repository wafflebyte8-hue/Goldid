'use strict';

/*
 * Project registry for the GolDid desktop app.
 *
 * A "project" is a named workspace bound to a folder on disk. The desktop app
 * launches in plain-chat mode (no tools, no graph); creating/opening a project
 * is what turns on the agentic tools and the 3D codebase visualizer, scoped to
 * that folder. The list of projects is persisted here so it survives restarts;
 * which one is *active* is session state held by the main process (the app
 * always starts in plain chat).
 *
 * Stored at ~/.goldid/projects.json:
 *   { "version": 1, "projects": [ { id, name, path, createdAt, lastOpenedAt } ] }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const GOLDID_DIR = path.join(os.homedir(), '.goldid');
const PROJECTS_PATH = path.join(GOLDID_DIR, 'projects.json');

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PROJECTS_PATH, 'utf8'));
    const projects = Array.isArray(parsed.projects) ? parsed.projects : [];
    return projects.filter((p) => p && p.id && p.path);
  } catch {
    return [];
  }
}

function persist(projects) {
  fs.mkdirSync(GOLDID_DIR, { recursive: true });
  const tmp = PROJECTS_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, projects }, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, PROJECTS_PATH);
}

// Most-recently-opened first, falling back to creation time.
function list() {
  return load().sort((a, b) =>
    String(b.lastOpenedAt || b.createdAt || '').localeCompare(String(a.lastOpenedAt || a.createdAt || ''))
  );
}

function get(id) {
  return load().find((p) => p.id === id) || null;
}

function nameFromPath(dir) {
  const base = path.basename(path.resolve(dir));
  return base || dir;
}

/**
 * Register a folder as a project. The folder must exist. If the same folder is
 * already registered, the existing entry is returned (no duplicates). Returns
 * the project record.
 */
function create({ name, path: dir } = {}) {
  const resolved = path.resolve(String(dir || '').trim());
  if (!resolved) throw new Error('a project folder is required');
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new Error(`folder does not exist: ${resolved}`);
  }
  if (!stat.isDirectory()) throw new Error(`not a folder: ${resolved}`);

  const projects = load();
  const existing = projects.find((p) => path.resolve(p.path) === resolved);
  if (existing) {
    if (name && String(name).trim()) existing.name = String(name).trim();
    existing.lastOpenedAt = new Date().toISOString();
    persist(projects);
    return existing;
  }

  const now = new Date().toISOString();
  const project = {
    id: `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
    name: (name && String(name).trim()) || nameFromPath(resolved),
    path: resolved,
    createdAt: now,
    lastOpenedAt: now,
  };
  projects.push(project);
  persist(projects);
  return project;
}

/** Mark a project as just-opened (updates ordering). Returns the record. */
function touch(id) {
  const projects = load();
  const project = projects.find((p) => p.id === id);
  if (!project) throw new Error('project not found');
  project.lastOpenedAt = new Date().toISOString();
  persist(projects);
  return project;
}

function remove(id) {
  const projects = load();
  const next = projects.filter((p) => p.id !== id);
  if (next.length === projects.length) return false;
  persist(next);
  return true;
}

/** True if the folder still exists on disk (projects can be deleted externally). */
function exists(project) {
  try {
    return Boolean(project) && fs.statSync(project.path).isDirectory();
  } catch {
    return false;
  }
}

module.exports = { PROJECTS_PATH, list, get, create, touch, remove, exists, nameFromPath };
