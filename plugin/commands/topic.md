---
description: Pick a topic and generate a fresh pool of spinner facts
argument-hint: "[topic, e.g. space, ancient Rome, octopuses — omit to be asked]"
---

# Smart Spinner — generate the facts pool

Topic requested: $ARGUMENTS

Follow these steps exactly:

1. If the topic above is empty, ask the user — in the language they are conversing in — what topic fascinates them. Mention that "surprise me" gives an eclectic mix across science, history, nature, language and art. Wait for the answer.
2. Output language for facts = the language the user converses in, unless they explicitly asked for another.
3. Generate exactly 150 facts about the topic in that language. Hard rules:
   - One line each, aim for ≤ 64 characters, NEVER exceed 80 — the rotator silently drops longer lines.
   - No numbering, no quotes, no emoji, no trailing punctuation.
   - True and verifiable. Never invent: if unsure about one, replace it with one you are sure of.
   - Surprising and counterintuitive beats textbook. Skip the famous facts everyone already quotes.
   - Each line must be punchy and stand entirely on its own, with zero surrounding context.
   - Cover diverse subtopics; no near-duplicates or rephrasings of the same fact.
4. Save the pool to `~/.claude/smart-spinner/facts.json` (create the directory first with `mkdir -p ~/.claude/smart-spinner`). File format:

   ```json
   {
     "topic": "<topic as the user phrased it>",
     "language": "<BCP-47 code, e.g. ru, en>",
     "generated_at": "<ISO 8601 date>",
     "facts": ["fact one", "fact two", "..."]
   }
   ```

5. Activate immediately by running:

   ```
   sh "${CLAUDE_PLUGIN_ROOT}/scripts/run.sh" rotate
   ```

   If the `${CLAUDE_PLUGIN_ROOT}` placeholder above was not expanded to a real path, locate the script with `ls -d ~/.claude/plugins/cache/*/smart-spinner/*/scripts/run.sh 2>/dev/null | head -1` and run that.

6. Confirm to the user (in their language) that the facts are now live in the spinner — they will see them while Claude works, refreshed on every message. Mention `/smart-spinner:topic <new topic>` to switch topics and `/smart-spinner:off` to turn it off.
