#!/bin/sh
# Smart Spinner runner: picks an available interpreter and executes the
# requested command (rotate | off). Must never print to stdout — hook stdout
# is injected into the model's context.
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
CMD="${1:-rotate}"

if command -v python3 >/dev/null 2>&1; then
  exec python3 "$DIR/smart_spinner.py" "$CMD" 2>/dev/null
elif command -v node >/dev/null 2>&1; then
  exec node "$DIR/smart_spinner.mjs" "$CMD" 2>/dev/null
fi
exit 0
