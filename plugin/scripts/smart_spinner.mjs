#!/usr/bin/env node
// Smart Spinner engine — Node mirror of smart_spinner.py, used when python3
// is unavailable. Commands: rotate | add <topic> <lang> [banner] | count | off.
// rotate/off stay silent (hook stdout is injected into model context);
// add/count print so the model can verify success when run via the Bash tool.
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
const MAX_POOL = 300;
const MANAGED_KEYS = ["spinnerTipsOverride", "spinnerVerbs"];
const SPARK = "✨";

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

function readJsonOr(p, fallback) {
  try {
    const doc = readJson(p);
    return doc && typeof doc === "object" && !Array.isArray(doc) ? doc : fallback;
  } catch {
    return fallback;
  }
}

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

function cleanLines(lines) {
  const out = [];
  for (const item of lines) {
    if (typeof item !== "string") continue;
    let line = item.split(/\s+/).join(" ").trim();
    line = line.replace(/^[-*•]\s+/, "").replace(/^\d{1,3}[.)]\s+/, "");
    if (line && line.length <= MAX_TIP_LEN) out.push(line);
  }
  return out;
}

function loadFacts() {
  const doc = readJsonOr(FACTS_PATH, {});
  return Array.isArray(doc.facts) ? cleanLines(doc.facts) : [];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function takeBatch(facts, state) {
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
  state.order = order;
  state.pos = pos;
  return batch;
}

function decorate(batch, banner) {
  const lines = [`${SPARK} ${banner.slice(0, 72)} ${SPARK}`];
  for (const f of batch) lines.push(f.length <= MAX_TIP_LEN - 2 ? `${SPARK} ${f}` : f);
  return lines;
}

function rotate() {
  const facts = loadFacts();
  if (!facts.length) return 0;
  const { settings, existed } = loadSettings();
  if (existed && !fs.existsSync(BACKUP_PATH)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.copyFileSync(SETTINGS_PATH, BACKUP_PATH);
  }
  const state = readJsonOr(STATE_PATH, {});
  const batch = takeBatch(facts, state);
  const banner = typeof state.banner === "string" && state.banner.trim() ? state.banner.trim() : null;
  delete state.banner;
  const display = banner ? decorate(batch, banner) : batch;
  settings.spinnerTipsOverride = { tips: display, excludeDefault: true };
  const verbs = display.filter((f) => f.length <= MAX_VERB_LEN);
  if (verbs.length >= 5) settings.spinnerVerbs = { mode: "replace", verbs };
  atomicWrite(SETTINGS_PATH, settings);
  atomicWrite(STATE_PATH, state);
  return display.length;
}

function add(topic, lang, banner) {
  const newFacts = cleanLines(fs.readFileSync(0, "utf8").split("\n"));
  let doc = readJsonOr(FACTS_PATH, null);
  const fresh = doc === null || doc.topic !== topic;
  if (fresh) doc = { topic, language: lang, facts: [] };
  const existing = Array.isArray(doc.facts) ? cleanLines(doc.facts) : [];
  const seen = new Set(existing.map((f) => f.toLowerCase()));
  const added = [];
  for (const f of newFacts) {
    const key = f.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      added.push(f);
    }
  }
  doc.facts = existing.concat(added).slice(0, MAX_POOL);
  doc.topic = topic;
  doc.language = lang;
  atomicWrite(FACTS_PATH, doc);
  let state = fresh ? {} : readJsonOr(STATE_PATH, {});
  if (typeof banner === "string" && banner.trim()) state.banner = banner.trim();
  atomicWrite(STATE_PATH, state);
  const shown = rotate();
  console.log(`ok pool=${doc.facts.length} added=${added.length} live_in_spinner=${shown} settings=${SETTINGS_PATH}`);
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
  const backup = readJsonOr(BACKUP_PATH, {});
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

const cmd = process.argv[2] || "rotate";
if (cmd === "add") {
  try {
    add(process.argv[3] || "mixed", process.argv[4] || "en", process.argv[5]);
  } catch (e) {
    console.log(`error: ${e.constructor.name}: ${e.message}`);
    process.exit(1);
  }
} else if (cmd === "count") {
  try {
    console.log(loadFacts().length);
  } catch {
    console.log(0);
  }
} else {
  try {
    if (cmd === "off") off();
    else rotate();
  } catch {
    // A broken spinner toy must never break the user's session.
  }
}
