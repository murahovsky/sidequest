#!/bin/sh
# Smart Spinner runner: picks an available interpreter and executes the
# requested engine command (rotate | add <topic> <lang> [banner] | count | off).
# rotate/off print nothing (hook stdout is injected into the model's context);
# add/count print status for the Bash-tool path. Facts for `add` come on stdin.
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
[ $# -eq 0 ] && set -- rotate

if command -v python3 >/dev/null 2>&1; then
  exec python3 "$DIR/smart_spinner.py" "$@" 2>/dev/null
elif command -v node >/dev/null 2>&1; then
  exec node "$DIR/smart_spinner.mjs" "$@" 2>/dev/null
fi
exit 0
