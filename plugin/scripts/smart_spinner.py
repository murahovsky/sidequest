#!/usr/bin/env python3
"""Smart Spinner engine.

Commands:
  rotate              Write the next 30-fact batch into Claude Code settings
                      (spinnerTipsOverride + spinnerVerbs). Silent: meant for
                      hooks, whose stdout is injected into model context.
  tick                One micro-rotation: the next single fact into the verb
                      slot (plus 3 tips). Driven every few seconds by run.sh's
                      tick-loop while Claude works, so the visible fact keeps
                      changing via settings hot-reload. Silent.
  add <topic> <lang> [banner]
                      Read facts from stdin (one per line) and append them to
                      the pool — or start a fresh pool if the topic changed.
                      Then rotates. Prints a one-line status so the model can
                      verify success; meant to be run via the Bash tool.
  count               Print the pool size.
  off                 Remove the managed keys, restoring pre-install values
                      from the first-write backup when available.

Settings are never written if the existing file fails to parse. Writes are
atomic; a rare lost-update race with Claude Code's own settings writes is
accepted (next tick repairs it).
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
TICK_TIPS = 3
MAX_TIP_LEN = 80    # facts longer than this are dropped entirely
MAX_VERB_LEN = 60   # only facts this short go into the verb slot
MAX_POOL = 300
SPARKLE_TICKS = 24  # ~2 minutes of launch sparkles at one tick per 5s
MANAGED_KEYS = ("spinnerTipsOverride", "spinnerVerbs")
SPARK = "✨"
VERB_MARK = "│"  # end-of-fact separator: Claude Code appends its own "…" to verbs


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


def ensure_backup(settings_existed):
    if not settings_existed or os.path.exists(BACKUP_PATH):
        return
    with open(SETTINGS_PATH, "rb") as src:
        raw = src.read()
    os.makedirs(DATA_DIR, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=DATA_DIR, prefix=".smart-spinner-")
    with os.fdopen(fd, "wb") as f:
        f.write(raw)
    os.replace(tmp, BACKUP_PATH)


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


def take_batch(facts, state, n):
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
    for _ in range(min(n, len(facts))):
        if pos >= len(order):
            random.shuffle(order)
            pos = 0
        batch.append(facts[order[pos]])
        pos += 1
    state["order"] = order
    state["pos"] = pos
    return batch


def sparkle(line):
    return f"{SPARK} {line}" if len(line) <= MAX_TIP_LEN - 2 else line


def restore_tips(settings):
    """We no longer touch the tips line; clean up what older versions set."""
    backup = read_json_or(BACKUP_PATH, {})
    if "spinnerTipsOverride" in backup:
        settings["spinnerTipsOverride"] = backup["spinnerTipsOverride"]
    else:
        settings.pop("spinnerTipsOverride", None)


def write_display(settings, state, verbs):
    restore_tips(settings)
    if verbs:
        settings["spinnerVerbs"] = {"mode": "replace", "verbs": verbs}
    atomic_write(SETTINGS_PATH, settings)
    atomic_write(STATE_PATH, state)


def rotate():
    """Full batch refresh. Returns the number of lines now live."""
    facts = load_facts()
    if not facts:
        return 0
    settings, existed = load_settings()
    ensure_backup(existed)
    state = read_json_or(STATE_PATH, {})
    batch = take_batch(facts, state, TIPS_PER_BATCH)
    banner = state.pop("banner", None)
    sparkles = state.get("sparkle_left", 0)
    if isinstance(banner, str) and banner.strip():
        display = [f"{SPARK} {banner.strip()[:54]} {SPARK}"] + [sparkle(f) for f in batch]
    elif isinstance(sparkles, int) and sparkles > 0:
        display = [sparkle(f) for f in batch]
        state["sparkle_left"] = sparkles - 1
    else:
        display = batch
    verbs = [f"{f} {VERB_MARK}" for f in display if len(f) <= MAX_VERB_LEN]
    write_display(settings, state, verbs if len(verbs) >= 5 else None)
    return len(verbs)


def tick():
    """Micro-rotation: force the next fact into the verb slot."""
    facts = load_facts()
    if not facts:
        return
    state = read_json_or(STATE_PATH, {})
    if state.get("banner"):
        rotate()  # launch moment pending — show the full banner batch first
        return
    settings, existed = load_settings()
    ensure_backup(existed)
    batch = take_batch(facts, state, TICK_TIPS)
    sparkles = state.get("sparkle_left", 0)
    if isinstance(sparkles, int) and sparkles > 0:
        batch = [sparkle(f) for f in batch]
        state["sparkle_left"] = sparkles - 1
    verb = next((f for f in batch if len(f) <= MAX_VERB_LEN), None)
    write_display(settings, state, [f"{verb} {VERB_MARK}"] if verb else None)


def warmup(banner):
    """Instant launch feedback: put a banner into the spinner before any
    facts exist, so the generation phase itself already looks alive."""
    settings, existed = load_settings()
    ensure_backup(existed)
    line = f"{SPARK} {banner.strip()[:54]} {SPARK} {VERB_MARK}"
    state = read_json_or(STATE_PATH, {})
    write_display(settings, state, [line])
    print("ok warming")


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
        state["sparkle_left"] = SPARKLE_TICKS
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
    if cmd == "warmup":
        try:
            warmup(sys.argv[2] if len(sys.argv) > 2 else "Smart Spinner")
        except Exception as e:  # noqa: BLE001
            print(f"error: {type(e).__name__}: {e}")
            sys.exit(1)
    elif cmd == "add":
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
    elif cmd == "list":
        try:
            for f in load_facts():
                print(f)
        except Exception:  # noqa: BLE001
            pass
    elif cmd == "meta":
        try:
            doc = read_json_or(FACTS_PATH, {})
            print(f"{doc.get('topic') or ''}\t{doc.get('language') or 'en'}")
        except Exception:  # noqa: BLE001
            print("\ten")
    else:
        # Hook/daemon paths (rotate/tick/off) stay silent, never break a session.
        try:
            if cmd == "off":
                off()
            elif cmd == "tick":
                tick()
            else:
                rotate()
        except Exception:  # noqa: BLE001
            pass


if __name__ == "__main__":
    main()
