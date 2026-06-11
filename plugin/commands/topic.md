---
description: Pick a topic and generate a fresh pool of spinner facts
argument-hint: "[topic, e.g. space, ancient Rome, octopuses — omit to be asked]"
---

# Smart Spinner — generate the facts pool

Topic requested: $ARGUMENTS

The goal: facts appear in the user's spinner within seconds, then the pool quietly grows to 100 in the same turn. Follow these steps exactly.

1. If the topic above is empty, ask the user with the AskUserQuestion tool — one question in the language they converse in, 3-4 short topic options tailored to them, always including a "Surprise me" eclectic-mix option (science, history, nature, language, art). The tool adds an "Other" choice automatically so they can type their own; mention that. If AskUserQuestion is unavailable, ask in plain text. Wait for the answer.

2. Facts language = the language the user converses in, unless they explicitly asked for another. Use it for the banner too.

**Fact rules** (apply to every batch below): one line each, aim ≤ 64 characters, hard max 80 (longer lines are silently dropped); no numbering, quotes, emoji or trailing punctuation; true and verifiable — never invent, swap anything uncertain for something certain without deliberating; surprising and counterintuitive over textbook, skip the famous facts everyone quotes; each line stands alone with zero context; diverse subtopics, no near-duplicates. Compose facts directly inside the commands — do not list, draft or echo them anywhere else, and do not reason fact-by-fact.

3. **Go live in seconds** — run ONE Bash command with your 10 best facts, where the last argument is a launch banner in the user's language (≤ 50 chars, e.g. "Smart Spinner включён: факты о космосе"):

   ```sh
   sh "${CLAUDE_PLUGIN_ROOT}/scripts/run.sh" add "<topic>" "<lang>" "<banner>" <<'FACTS'
   fact one
   fact two
   ...ten facts total...
   FACTS
   ```

   If `${CLAUDE_PLUGIN_ROOT}` was not expanded to a real path, the plugin root is stored in `~/.claude/smart-spinner/plugin-root` — use `sh "$(cat ~/.claude/smart-spinner/plugin-root)/scripts/run.sh"`. Last resort: `find ~/.claude/plugins -name run.sh -path '*smart-spinner*' 2>/dev/null | head -1` (never use a bare glob — zsh aborts on no match).

   The script prints a status line. **Verify it**: it must start with `ok` and show `live_in_spinner` > 0.

4. **If the status starts with `error` or nothing was printed** (e.g. a sandbox blocked the write), activate manually: read `~/.claude/settings.json`, then use the Edit tool to set exactly these two keys, preserving every other key: `"spinnerTipsOverride": {"tips": [<banner>, ...the 10 facts], "excludeDefault": true}` and `"spinnerVerbs": {"mode": "replace", "verbs": [<the facts ≤ 60 chars>]}`. Also ensure the pool file `~/.claude/smart-spinner/facts.json` exists (create with the Write tool): `{"topic": "<topic>", "language": "<lang>", "facts": [<the 10 facts>]}`.

5. Tell the user in ONE short sentence (their language) that facts are already live in the spinner and the pool is topping up to 100 — they can watch it happen on this very message.

6. **Top up to 100, same turn** — run the same `add` command three more times with 30 NEW facts each (no banner argument, no commentary in between, no duplicates of anything already added). If `add` reports an error, append the new facts into the `"facts"` array of `~/.claude/smart-spinner/facts.json` with the Edit tool instead — hooks will pick them up automatically.

7. Finish with a one-line confirmation (their language): pool is at 100; `/smart-spinner:topic <new topic>` switches topics, `/smart-spinner:off` turns it off.
