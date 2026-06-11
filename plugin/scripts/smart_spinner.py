#!/usr/bin/env python3
"""Smart Spinner engine.

Commands:
  rotate              Write the next batch of facts into Claude Code settings
                      (spinnerTipsOverride + spinnerVerbs). Silent: meant for
                      hooks, whose stdout is injected into model context.
  add <topic> <lang> [banner]
                      Read facts from stdin (one per line) and append them to
                      the pool — or start a fresh pool if the topic changed.
                      Then rotates. Prints a one-line status so the model can
                      verify success; meant to be run via the Bash tool.
  count               Print the pool size.
  off                 Remove the managed keys, restoring pre-install values
                      from the first-write backup when available.

Settings are never written if the existing file fails to parse.
"""
import json
import os
import random
import re
import sys
import tempfile
from datetime import date

HOME = os.path.expanduser("~")
DATA_DIR = os.environ.get("SMART_SPINNER_HOME", os.path.join(HOME, ".claude", "smart-spinner"))
SETTINGS_PATH = os.environ.get("SMART_SPINNER_SETTINGS", os.path.join(HOME, ".claude", "settings.json"))
FACTS_PATH = os.path.join(DATA_DIR, "facts.json")
STATE_PATH = os.path.join(DATA_DIR, "state.json")
BACKUP_PATH = os.path.join(DATA_DIR, "settings.backup.json")

TIPS_PER_BATCH = 30
MAX_TIP_LEN = 80   # facts longer than this are dropped entirely
MAX_VERB_LEN = 60  # only facts this short go into the verb slot
MAX_POOL = 300
MANAGED_KEYS = ("spinnerTipsOverride", "spinnerVerbs")
SPARK = "✨"   # ✨ — launch-effect decoration


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def read_json_or(path, default):
    try:
        doc = read_json(path)
    except (OSError, ValueError):
        return default
    return doc if isinstance(doc, dict) else default


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


def clean_lines(lines):
    out = []
    for item in lines:
        if not isinstance(item, str):
            continue
        line = " ".join(item.split()).strip()
        line = re.sub(r"^[-*•]\s+", "", line)
        line = re.sub(r"^\d{1,3}[.)]\s+", "", line)
        if line and len(line) <= MAX_TIP_LEN:
            out.append(line)
    return out


def load_facts():
    doc = read_json_or(FACTS_PATH, {})
    raw = doc.get("facts")
    return clean_lines(raw) if isinstance(raw, list) else []


def take_batch(facts, state):
    """Advance a persisted shuffle so facts repeat as rarely as possible."""
    order = state.get("order")
    pos = state.get("pos", 0)
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
    state["order"] = order
    state["pos"] = pos
    return batch


def decorate(batch, banner):
    """Launch effect: a banner line plus sparkles, shown for one rotation only."""
    lines = [f"{SPARK} {banner[:72]} {SPARK}"]
    for f in batch:
        lines.append(f"{SPARK} {f}" if len(f) <= MAX_TIP_LEN - 2 else f)
    return lines


def rotate():
    """Returns the number of lines now live in the spinner."""
    facts = load_facts()
    if not facts:
        return 0
    settings, existed = load_settings()
    if existed and not os.path.exists(BACKUP_PATH):
        with open(SETTINGS_PATH, "rb") as src:
            raw = src.read()
        os.makedirs(DATA_DIR, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=DATA_DIR, prefix=".smart-spinner-")
        with os.fdopen(fd, "wb") as f:
            f.write(raw)
        os.replace(tmp, BACKUP_PATH)
    state = read_json_or(STATE_PATH, {})
    batch = take_batch(facts, state)
    banner = state.pop("banner", None)
    display = decorate(batch, banner) if isinstance(banner, str) and banner.strip() else batch
    settings["spinnerTipsOverride"] = {"tips": display, "excludeDefault": True}
    verbs = [f for f in display if len(f) <= MAX_VERB_LEN]
    if len(verbs) >= 5:
        settings["spinnerVerbs"] = {"mode": "replace", "verbs": verbs}
    atomic_write(SETTINGS_PATH, settings)
    atomic_write(STATE_PATH, state)
    return len(display)


def add(topic, lang, banner=None):
    new = clean_lines(sys.stdin.read().splitlines())
    doc = read_json_or(FACTS_PATH, None)
    fresh = doc is None or doc.get("topic") != topic
    if fresh:
        doc = {"topic": topic, "language": lang, "generated_at": date.today().isoformat(), "facts": []}
    existing = clean_lines(doc.get("facts", [])) if isinstance(doc.get("facts"), list) else []
    seen = {f.casefold() for f in existing}
    added = []
    for f in new:
        key = f.casefold()
        if key not in seen:
            seen.add(key)
            added.append(f)
    doc["facts"] = (existing + added)[:MAX_POOL]
    doc["topic"] = topic
    doc["language"] = lang
    atomic_write(FACTS_PATH, doc)
    state = {} if fresh else read_json_or(STATE_PATH, {})
    if fresh:
        state.pop("order", None)
        state.pop("pos", None)
    if isinstance(banner, str) and banner.strip():
        state["banner"] = banner.strip()
    atomic_write(STATE_PATH, state)
    shown = rotate()
    print(f"ok pool={len(doc['facts'])} added={len(added)} live_in_spinner={shown} settings={SETTINGS_PATH}")


def off():
    settings, existed = load_settings()
    if not existed:
        return
    backup = read_json_or(BACKUP_PATH, {})
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
    if cmd == "add":
        # Verbose on purpose: run via the Bash tool, so the model must see
        # success or the exact failure (e.g. a sandbox blocking the write).
        try:
            topic = sys.argv[2] if len(sys.argv) > 2 else "mixed"
            lang = sys.argv[3] if len(sys.argv) > 3 else "en"
            banner = sys.argv[4] if len(sys.argv) > 4 else None
            add(topic, lang, banner)
        except Exception as e:  # noqa: BLE001
            print(f"error: {type(e).__name__}: {e}")
            sys.exit(1)
    elif cmd == "count":
        try:
            print(len(load_facts()))
        except Exception:  # noqa: BLE001
            print(0)
    else:
        # Hook paths (rotate/off) must stay silent and never break a session.
        try:
            if cmd == "off":
                off()
            else:
                rotate()
        except Exception:  # noqa: BLE001
            pass


if __name__ == "__main__":
    main()
