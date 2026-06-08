"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const SESSION_DIR = path.join(os.homedir(), ".goldid", "sessions");
const MAX_SESSIONS = 100;

function ensureDir() {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

function safeId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function newId() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").toLowerCase();
  return `${stamp}-${crypto.randomBytes(3).toString("hex")}`;
}

function sessionPath(id) {
  const clean = safeId(id);
  if (!clean) throw new Error("invalid session id");
  return path.join(SESSION_DIR, clean + ".json");
}

function titleFrom(messages) {
  const first = messages.find(
    (m) => m.role === "user" && typeof m.content === "string",
  );
  return first
    ? first.content.replace(/\s+/g, " ").trim().slice(0, 80)
    : "New conversation";
}

function save(id, messages, extra = {}) {
  ensureDir();
  const clean = safeId(id) || newId();
  const file = sessionPath(clean);
  let createdAt = new Date().toISOString();
  let existingTitle = "";
  try {
    const existing = JSON.parse(fs.readFileSync(file, "utf8"));
    createdAt = existing.createdAt || createdAt;
    existingTitle = existing.title || "";
  } catch {
    /* new session */
  }
  const title =
    typeof extra.title === "string" && extra.title.trim()
      ? extra.title.trim()
      : existingTitle || titleFrom(messages);
  const data = {
    version: 1,
    id: clean,
    title,
    cwd: extra.cwd || process.cwd(),
    createdAt,
    updatedAt: new Date().toISOString(),
    messages: Array.isArray(messages) ? messages : [],
  };
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
  prune();
  return data;
}

function rename(id, title) {
  const clean = safeId(id);
  const nextTitle = String(title || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) throw new Error("invalid session id");
  if (!nextTitle) throw new Error("session title cannot be empty");
  const data = load(clean);
  return save(clean, data.messages, { cwd: data.cwd, title: nextTitle });
}

function load(id) {
  const data = JSON.parse(fs.readFileSync(sessionPath(id), "utf8"));
  if (!Array.isArray(data.messages)) throw new Error("session has no messages");
  return data;
}

function list() {
  ensureDir();
  return fs
    .readdirSync(SESSION_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(SESSION_DIR, name), "utf8"),
        );
        return {
          id: data.id || path.basename(name, ".json"),
          title: data.title || "Untitled",
          cwd: data.cwd || "",
          updatedAt: data.updatedAt || "",
          messageCount: Array.isArray(data.messages) ? data.messages.length : 0,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function search(query) {
  const needle = String(query || "")
    .trim()
    .toLowerCase();
  if (!needle) return list();
  return list().filter((item) => {
    if (`${item.id} ${item.title} ${item.cwd}`.toLowerCase().includes(needle))
      return true;
    try {
      const data = load(item.id);
      return data.messages.some((m) =>
        String(m.content || "")
          .toLowerCase()
          .includes(needle),
      );
    } catch {
      return false;
    }
  });
}

function remove(id) {
  const file = sessionPath(id);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

function prune() {
  const items = list();
  for (const item of items.slice(MAX_SESSIONS)) {
    try {
      fs.unlinkSync(sessionPath(item.id));
    } catch {
      /* best effort */
    }
  }
}

module.exports = { SESSION_DIR, newId, save, load, list, search, remove, rename, titleFrom };
