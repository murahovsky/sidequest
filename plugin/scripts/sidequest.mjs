#!/usr/bin/env node
// Sidequest engine — Node mirror of sidequest.py, used when python3
// is unavailable. Commands: rotate | tick | add <topic> <lang> [banner] |
// count | off. rotate/tick/off stay silent (hook stdout is injected into
// model context); add/count print so the model can verify success.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = os.homedir();
const DATA_DIR = process.env.SIDEQUEST_HOME || path.join(HOME, ".claude", "sidequest");
const SETTINGS_PATH = process.env.SIDEQUEST_SETTINGS || path.join(HOME, ".claude", "settings.json");
const FACTS_PATH = path.join(DATA_DIR, "facts.json");
const STATE_PATH = path.join(DATA_DIR, "state.json");
const BACKUP_PATH = path.join(DATA_DIR, "settings.backup.json");

const TIPS_PER_BATCH = 30;
const TICK_TIPS = 3;
const MAX_TIP_LEN = 80;
const MAX_VERB_LEN = 60;
const MAX_POOL = 300;
const SPARKLE_TICKS = 24;
const MANAGED_KEYS = ["spinnerTipsOverride", "spinnerVerbs"];
const SPARK = "✨";
const VERB_MARK = "│"; // end-of-fact separator: Claude Code appends its own "…" to verbs
// Inside a sidequest pty session the wrapper substitutes this token in the
// output stream, so the verb slot must hold the token — not actual facts.
const SENTINEL = "SIDEQUESTFACT".repeat(5).slice(0, 64);
const PTY_MODE = Boolean(process.env.SIDEQUEST_PTY);

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
  const tmp = path.join(dir, `.sidequest-${process.pid}-${Math.random().toString(36).slice(2)}`);
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

function ensureBackup(existed) {
  if (!existed || fs.existsSync(BACKUP_PATH)) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.copyFileSync(SETTINGS_PATH, BACKUP_PATH);
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

function takeBatch(facts, state, n) {
  let order = Array.isArray(state.order) ? state.order : null;
  let pos = Number.isInteger(state.pos) && state.pos >= 0 ? state.pos : 0;
  const expected = Array.from({ length: facts.length }, (_, i) => i);
  if (!order || [...order].sort((a, b) => a - b).join(",") !== expected.join(",")) {
    order = shuffle(expected.slice());
    pos = 0;
  }
  if (pos > order.length) pos = 0;
  const batch = [];
  for (let k = 0; k < Math.min(n, facts.length); k++) {
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

const sparkleLine = (f) => (f.length <= MAX_TIP_LEN - 2 ? `${SPARK} ${f}` : f);

// We no longer touch the tips line; clean up what older versions set.
function restoreTips(settings) {
  const backup = readJsonOr(BACKUP_PATH, {});
  if ("spinnerTipsOverride" in backup) settings.spinnerTipsOverride = backup.spinnerTipsOverride;
  else delete settings.spinnerTipsOverride;
}

function writeDisplay(settings, state, verbs) {
  restoreTips(settings);
  if (PTY_MODE) settings.spinnerVerbs = { mode: "replace", verbs: [SENTINEL] };
  else if (verbs) settings.spinnerVerbs = { mode: "replace", verbs };
  atomicWrite(SETTINGS_PATH, settings);
  atomicWrite(STATE_PATH, state);
}

function rotate() {
  const facts = loadFacts();
  if (!facts.length) return 0;
  const { settings, existed } = loadSettings();
  ensureBackup(existed);
  const state = readJsonOr(STATE_PATH, {});
  const batch = takeBatch(facts, state, TIPS_PER_BATCH);
  // In pty mode the wrapper itself shows and consumes the launch banner.
  const banner = !PTY_MODE && typeof state.banner === "string" && state.banner.trim() ? state.banner.trim() : null;
  if (!PTY_MODE) delete state.banner;
  let display;
  if (banner) {
    display = [`${SPARK} ${banner.slice(0, 54)} ${SPARK}`, ...batch.map(sparkleLine)];
  } else if (Number.isInteger(state.sparkle_left) && state.sparkle_left > 0) {
    display = batch.map(sparkleLine);
    state.sparkle_left -= 1;
  } else {
    display = batch;
  }
  const verbs = display.filter((f) => f.length <= MAX_VERB_LEN).map((f) => `${f} ${VERB_MARK}`);
  writeDisplay(settings, state, verbs.length >= 5 ? verbs : null);
  return verbs.length;
}

function tick() {
  const facts = loadFacts();
  if (!facts.length) return;
  const state = readJsonOr(STATE_PATH, {});
  if (state.banner) {
    rotate(); // launch moment pending — show the full banner batch first
    return;
  }
  const { settings, existed } = loadSettings();
  ensureBackup(existed);
  let batch = takeBatch(facts, state, TICK_TIPS);
  if (Number.isInteger(state.sparkle_left) && state.sparkle_left > 0) {
    batch = batch.map(sparkleLine);
    state.sparkle_left -= 1;
  }
  const verb = batch.find((f) => f.length <= MAX_VERB_LEN);
  writeDisplay(settings, state, verb ? [`${verb} ${VERB_MARK}`] : null);
}

// Instant launch feedback: a banner in the spinner before any facts exist.
function warmup(banner) {
  const { settings, existed } = loadSettings();
  ensureBackup(existed);
  const state = readJsonOr(STATE_PATH, {});
  state.banner = banner.trim(); // the pty wrapper picks this up immediately
  writeDisplay(settings, state, [`${SPARK} ${banner.trim().slice(0, 54)} ${SPARK} ${VERB_MARK}`]);
  console.log("ok warming");
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
  const state = fresh ? {} : readJsonOr(STATE_PATH, {});
  if (typeof banner === "string" && banner.trim()) {
    state.banner = banner.trim();
    state.sparkle_left = SPARKLE_TICKS;
  }
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
if (cmd === "warmup") {
  try {
    warmup(process.argv[3] || "Sidequest");
  } catch (e) {
    console.log(`error: ${e.constructor.name}: ${e.message}`);
    process.exit(1);
  }
} else if (cmd === "add") {
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
} else if (cmd === "list") {
  try {
    for (const f of loadFacts()) console.log(f);
  } catch {}
} else if (cmd === "meta") {
  try {
    const doc = readJsonOr(FACTS_PATH, {});
    console.log(`${doc.topic || ""}\t${doc.language || "en"}`);
  } catch {
    console.log("\ten");
  }
} else {
  try {
    if (cmd === "off") off();
    else if (cmd === "tick") tick();
    else rotate();
  } catch {
    // A broken spinner toy must never break the user's session.
  }
}
