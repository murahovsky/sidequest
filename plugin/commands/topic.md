---
description: Pick a topic and generate a fresh pool of spinner facts
argument-hint: "[topic, e.g. space, ancient Rome, octopuses — omit to be asked]"
---

# Smart Spinner — generate the facts pool

Topic requested: $ARGUMENTS

Follow these steps exactly:

1. If the topic above is empty, ask the user with the AskUserQuestion tool — one question in the language they converse in, 3-4 short topic options tailored to them, always including a "Surprise me" eclectic-mix option (science, history, nature, language, art). The tool adds an "Other" choice automatically so they can type their own; mention that. If AskUserQuestion is unavailable, ask in plain text. Wait for the answer.
2. Output language for facts = the language the user converses in, unless they explicitly asked for another.
3. Create the data directory: `mkdir -p ~/.claude/smart-spinner`.
4. Write the pool to `~/.claude/smart-spinner/facts.json` in a SINGLE Write tool call. Generate the facts directly inside that call — do NOT list, draft, or echo them in your visible reply, and do not deliberate fact-by-fact; this step should be one fast pass. File format:

   ```json
   {
     "topic": "<topic as the user phrased it>",
     "language": "<BCP-47 code, e.g. ru, en>",
     "generated_at": "<ISO 8601 date>",
     "facts": ["fact one", "fact two", "..."]
   }
   ```

   Hard rules for the 100 facts:
   - Exactly 100 facts, one line each: aim for ≤ 64 characters, NEVER exceed 80 — the rotator silently drops longer lines.
   - No numbering, no quotes, no emoji, no trailing punctuation.
   - True and verifiable. Never invent: if unsure about one, replace it with one you are sure of.
   - Surprising and counterintuitive beats textbook. Skip the famous facts everyone already quotes.
   - Each line must be punchy and stand entirely on its own, with zero surrounding context.
   - Cover diverse subtopics; no near-duplicates or rephrasings of the same fact.

5. Activate immediately by running:

   ```
   sh "${CLAUDE_PLUGIN_ROOT}/scripts/run.sh" rotate
   ```

   If the `${CLAUDE_PLUGIN_ROOT}` placeholder above was not expanded to a real path, locate the script with `ls -d ~/.claude/plugins/cache/*/smart-spinner/*/scripts/run.sh 2>/dev/null | head -1` and run that.

6. Keep your visible reply to a short confirmation (in the user's language): the facts are live in the spinner and refresh on every message; `/smart-spinner:topic <new topic>` switches topics, `/smart-spinner:off` turns it off.
