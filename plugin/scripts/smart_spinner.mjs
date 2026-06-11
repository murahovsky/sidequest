#!/usr/bin/env node
// Smart Spinner engine — Node mirror of smart_spinner.py, used when python3
// is unavailable. Commands: rotate | off. Never prints to stdout (hook stdout
// is injected into the model context); never writes settings it cannot parse.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = os.homedir();
const DATA_DIR = process.env.SMART_SPINNER_HOME || path.join(HOME, ".claude", "smart-spinner");
const SETTINGS_PATH = process.env.SMART_SPINNER_SETTINGS || path.join(HOME, ".claude", "settings.json");
const FACTS_PATH = path.join(DATA_DIR, "facts.json");
const STATE_PATH = path.join(DATA_DIR, "state.json");
const BACKUP_PATH = path.join(DATA_DIR, "settings.backup.json");

const TIPS_PER_BATCH = 30;
const MAX_TIP_LEN = 80;
const MAX_VERB_LEN = 60;
const MANAGED_KEYS = ["spinnerTipsOverride", "spinnerVerbs"];

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

function atomicWrite(p, obj) {
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.smart-spinner-${process.pid}-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n");
  fs.renameSync(tmp, p);
}

function loadSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) return { settings: {}, existed: false };
  const settings = readJson(SETTINGS_PATH); // throws on broken JSON → abort, never clobber
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
    throw new Error("settings root is not an object");
  }
  return { settings, existed: true };
}

function loadFacts() {
  let doc;
  try {
    doc = readJson(FACTS_PATH);
  } catch {
    return [];
  }
  if (!doc || !Array.isArray(doc.facts)) return [];
  return doc.facts
    .filter((f) => typeof f === "string")
    .map((f) => f.split(/\s+/).join(" ").trim())
    .filter((f) => f && f.length <= MAX_TIP_LEN);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function nextBatch(facts) {
  let state = {};
  try {
    state = readJson(STATE_PATH);
  } catch {}
  let order = Array.isArray(state.order) ? state.order : null;
  let pos = Number.isInteger(state.pos) && state.pos >= 0 ? state.pos : 0;
  const expected = Array.from({ length: facts.length }, (_, i) => i);
  if (!order || [...order].sort((a, b) => a - b).join(",") !== expected.join(",")) {
    order = shuffle(expected.slice());
    pos = 0;
  }
  if (pos > order.length) pos = 0;
  const batch = [];
  for (let k = 0; k < Math.min(TIPS_PER_BATCH, facts.length); k++) {
    if (pos >= order.length) {
      shuffle(order);
      pos = 0;
    }
    batch.push(facts[order[pos]]);
    pos += 1;
  }
  atomicWrite(STATE_PATH, { order, pos });
  return batch;
}

function rotate() {
  const facts = loadFacts();
  if (!facts.length) return;
  const { settings, existed } = loadSettings();
  if (existed && !fs.existsSync(BACKUP_PATH)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.copyFileSync(SETTINGS_PATH, BACKUP_PATH);
  }
  const batch = nextBatch(facts);
  settings.spinnerTipsOverride = { tips: batch, excludeDefault: true };
  const verbs = batch.filter((f) => f.length <= MAX_VERB_LEN);
  if (verbs.length >= 5) settings.spinnerVerbs = { mode: "replace", verbs };
  atomicWrite(SETTINGS_PATH, settings);
}

function off() {
  let loaded;
  try {
    loaded = loadSettings();
  } catch {
    return;
  }
  if (!loaded.existed) return;
  const { settings } = loaded;
  let backup = {};
  try {
    const b = readJson(BACKUP_PATH);
    if (b && typeof b === "object" && !Array.isArray(b)) backup = b;
  } catch {}
  let changed = false;
  for (const key of MANAGED_KEYS) {
    if (key in backup) {
      if (JSON.stringify(settings[key]) !== JSON.stringify(backup[key])) {
        settings[key] = backup[key];
        changed = true;
      }
    } else if (key in settings) {
      delete settings[key];
      changed = true;
    }
  }
  if (changed) atomicWrite(SETTINGS_PATH, settings);
}

try {
  const cmd = process.argv[2] || "rotate";
  if (cmd === "off") off();
  else rotate();
} catch {
  // A broken spinner toy must never break the user's session.
}
