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
[smart-spinner] The Smart Spinner plugin is installed but has no facts pool yet. In your first reply this session — after fully addressing the user's actual request, if there is one — briefly ask the user, in the same language they write in, what topic fascinates them (examples: space, ancient Rome, octopuses, jazz). Mention they can answer "surprise me" for an eclectic mix across science, history, nature and art. Keep the question to 1-2 sentences. When they answer, follow the instructions in $ROOT/commands/topic.md, using their answer as the topic. If they decline or ignore the question, drop the subject and do not ask again.
EOF
