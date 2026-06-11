#!/usr/bin/env python3
"""Smart Spinner engine.

Commands:
  rotate  Write the next batch of facts into Claude Code settings
          (spinnerTipsOverride + spinnerVerbs). Hot-reload makes them
          appear in the running session immediately.
  off     Remove the keys Smart Spinner manages, restoring pre-install
          values from the first-write backup when available.

Never prints to stdout: hook stdout is injected into the model context.
Never writes settings if the existing file fails to parse.
"""
import json
import os
import random
import sys
import tempfile

HOME = os.path.expanduser("~")
DATA_DIR = os.environ.get("SMART_SPINNER_HOME", os.path.join(HOME, ".claude", "smart-spinner"))
SETTINGS_PATH = os.environ.get("SMART_SPINNER_SETTINGS", os.path.join(HOME, ".claude", "settings.json"))
FACTS_PATH = os.path.join(DATA_DIR, "facts.json")
STATE_PATH = os.path.join(DATA_DIR, "state.json")
BACKUP_PATH = os.path.join(DATA_DIR, "settings.backup.json")

TIPS_PER_BATCH = 30
MAX_TIP_LEN = 80   # facts longer than this are dropped entirely
MAX_VERB_LEN = 60  # only facts this short go into the verb slot
MANAGED_KEYS = ("spinnerTipsOverride", "spinnerVerbs")


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def atomic_write(path, obj):
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".smart-spinner-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def load_settings():
    """Returns (settings_dict, existed). Raises on unparseable file."""
    if not os.path.exists(SETTINGS_PATH):
        return {}, False
    settings = read_json(SETTINGS_PATH)
    if not isinstance(settings, dict):
        raise ValueError("settings root is not an object")
    return settings, True


def load_facts():
    try:
        doc = read_json(FACTS_PATH)
    except (OSError, ValueError):
        return []
    raw = doc.get("facts") if isinstance(doc, dict) else None
    if not isinstance(raw, list):
        return []
    facts = []
    for item in raw:
        if not isinstance(item, str):
            continue
        line = " ".join(item.split()).strip()
        if line and len(line) <= MAX_TIP_LEN:
            facts.append(line)
    return facts


def next_batch(facts):
    """Cycle through a persisted shuffle so facts repeat as rarely as possible."""
    try:
        state = read_json(STATE_PATH)
    except (OSError, ValueError):
        state = {}
    order = state.get("order") if isinstance(state, dict) else None
    pos = state.get("pos", 0) if isinstance(state, dict) else 0
    if not isinstance(order, list) or sorted(order) != list(range(len(facts))):
        order = list(range(len(facts)))
        random.shuffle(order)
        pos = 0
    if not isinstance(pos, int) or pos < 0 or pos > len(order):
        pos = 0
    batch = []
    for _ in range(min(TIPS_PER_BATCH, len(facts))):
        if pos >= len(order):
            random.shuffle(order)
            pos = 0
        batch.append(facts[order[pos]])
        pos += 1
    atomic_write(STATE_PATH, {"order": order, "pos": pos})
    return batch


def rotate():
    facts = load_facts()
    if not facts:
        return
    settings, existed = load_settings()
    if existed and not os.path.exists(BACKUP_PATH):
        with open(SETTINGS_PATH, "rb") as src:
            raw = src.read()
        os.makedirs(DATA_DIR, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=DATA_DIR, prefix=".smart-spinner-")
        with os.fdopen(fd, "wb") as f:
            f.write(raw)
        os.replace(tmp, BACKUP_PATH)
    batch = next_batch(facts)
    settings["spinnerTipsOverride"] = {"tips": batch, "excludeDefault": True}
    verbs = [f for f in batch if len(f) <= MAX_VERB_LEN]
    if len(verbs) >= 5:
        settings["spinnerVerbs"] = {"mode": "replace", "verbs": verbs}
    atomic_write(SETTINGS_PATH, settings)


def off():
    settings, existed = load_settings()
    if not existed:
        return
    try:
        backup = read_json(BACKUP_PATH)
        if not isinstance(backup, dict):
            backup = {}
    except (OSError, ValueError):
        backup = {}
    changed = False
    for key in MANAGED_KEYS:
        if key in backup:
            if settings.get(key) != backup[key]:
                settings[key] = backup[key]
                changed = True
        elif key in settings:
            del settings[key]
            changed = True
    if changed:
        atomic_write(SETTINGS_PATH, settings)


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "rotate"
    try:
        if cmd == "off":
            off()
        else:
            rotate()
    except Exception:
        # A broken spinner toy must never break the user's session.
        pass


if __name__ == "__main__":
    main()
