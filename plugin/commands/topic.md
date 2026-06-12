---
description: Pick a topic and generate a fresh pool of spinner facts
argument-hint: "[topic, e.g. space, ancient Rome, octopuses — omit to be asked]"
---

# Smart Spinner — set the topic

Topic requested: $ARGUMENTS

This flow is mechanical: a fast headless model produces the facts, NOT you. Do not compose facts, do not deliberate — execute the steps immediately.

Script: `sh "${CLAUDE_PLUGIN_ROOT}/scripts/run.sh"`. If that placeholder is not expanded to a real path, use `sh "$(cat ~/.claude/smart-spinner/plugin-root)/scripts/run.sh"` instead.

1. If the topic above is empty, ask with the AskUserQuestion tool — one question in the user's language, 3-4 short topic options tailored to them plus a "Surprise me" eclectic-mix option; mention they can type anything via the built-in "Other". Wait for the answer.

2. Set `<lang>` = the language the user converses in (BCP-47, e.g. `ru`); `<banner>` = a short launch line in that language, ≤ 50 chars, no emoji, e.g. "Smart Spinner включён: факты о космосе".

3. Run as two separate Bash calls, no commentary in between — first instant launch feedback, then generation (~10 s, prints `ok ...`):

   ```sh
   sh "${CLAUDE_PLUGIN_ROOT}/scripts/run.sh" warmup "<banner>"
   sh "${CLAUDE_PLUGIN_ROOT}/scripts/run.sh" generate-first "<topic>" "<lang>" "<banner>"
   ```

4. If it printed a line starting with `ok`: run `sh "${CLAUDE_PLUGIN_ROOT}/scripts/run.sh" generate-rest` (returns instantly; a background job tops the pool up to ~100). Then reply with ONE short sentence in the user's language: facts are already live in the spinner and will quietly grow to ~100; `/smart-spinner:topic <new topic>` switches, `/smart-spinner:off` turns off. Done — nothing else.

5. Fallback, ONLY if step 3 printed `error` or timed out: write 10 facts yourself in one pass —

   ```sh
   sh "${CLAUDE_PLUGIN_ROOT}/scripts/run.sh" add "<topic>" "<lang>" "<banner>" <<'FACTS'
   one fact per line, 10 lines
   FACTS
   ```

   Rules: ≤ 64 chars per line (hard max 80), true and verifiable, surprising over textbook, standalone, no numbering/quotes/emoji/trailing punctuation, no near-duplicates. Verify the `ok` status, then still run `generate-rest`. If `add` also errors: as a last resort set `spinnerVerbs: {"mode": "replace", "verbs": [facts ≤ 60 chars]}` via the Edit tool in `~/.claude/settings.json` (preserving all other keys, not touching `spinnerTipsOverride`) and Write the pool to `~/.claude/smart-spinner/facts.json` (`{"topic", "language", "facts"}`).
