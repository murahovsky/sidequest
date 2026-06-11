#!/bin/sh
# SessionStart hook. While no facts pool exists, emits first-run setup
# instructions (hook stdout becomes model context). Once the pool exists,
# silently rotates a fresh batch of facts into settings.
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
DATA_DIR="${SMART_SPINNER_HOME:-$HOME/.claude/smart-spinner}"

if [ -f "$DATA_DIR/facts.json" ]; then
  sh "$DIR/run.sh" rotate
  exit 0
fi

ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$DIR")}"
cat <<EOF
[smart-spinner] First-run setup: the Smart Spinner plugin is installed but has no facts pool yet. In your first reply this session — after fully addressing the user's actual request, if there is one — do the following, entirely in the language the user writes in:

1. Introduce the product in two short paragraphs (do not pad them): Smart Spinner replaces the spinner text Claude Code shows while working ("Pondering...") with fascinating one-line facts about a topic the user picks, in the user's language. The pool of ~100 facts is generated once, right now, by the user's own Claude and stored locally in ~/.claude/smart-spinner/ — no server, no ads, no telemetry; a tiny local hook then rotates a fresh batch into the spinner on every message. Mention: /smart-spinner:topic <topic> changes the topic later, /smart-spinner:off turns it off.

2. Ask which topic fascinates them using the AskUserQuestion tool: one question, 3-4 short topic options tailored to what you know about the user and localized to their language (for example: space, ancient civilizations, the human body, plus always a "Surprise me" eclectic-mix option). The tool adds an "Other" choice automatically, so they can type any topic of their own — mention that. If AskUserQuestion is unavailable, ask in plain text instead.

3. When they answer, follow the instructions in $ROOT/commands/topic.md using their choice as the topic.

4. If they decline or ignore the question, run: mkdir -p "$DATA_DIR" && printf '{"topic":null,"facts":[]}' > "$DATA_DIR/facts.json" — this permanently stops the first-run prompt (they can enable later with /smart-spinner:topic), then drop the subject and never raise it again.
EOF
