#!/bin/sh
# Smart Spinner runner.
#   rotate | tick | off          silent engine commands (hooks / daemon)
#   add <topic> <lang> [banner]  facts on stdin; prints a status line
#   count                        prints pool size
#   tick-start                   spawn the background ticker (one per machine;
#                                a new start displaces the previous loop)
#   tick-stop                    stop the ticker
#   tick-loop                    internal: the daemon loop itself
# The ticker swaps the spinner fact every SMART_SPINNER_INTERVAL (default 5)
# seconds while Claude works, relying on settings hot-reload.
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
DATA_DIR="${SMART_SPINNER_HOME:-$HOME/.claude/smart-spinner}"
PIDFILE="$DATA_DIR/tick.pid"
MAX_TICKS="${SMART_SPINNER_MAX_TICKS:-360}"

engine() {
  if command -v python3 >/dev/null 2>&1; then
    python3 "$DIR/smart_spinner.py" "$@" 2>/dev/null
  elif command -v node >/dev/null 2>&1; then
    node "$DIR/smart_spinner.mjs" "$@" 2>/dev/null
  fi
}

case "${1:-rotate}" in
  tick-start)
    mkdir -p "$DATA_DIR"
    nohup sh "$0" tick-loop >/dev/null 2>&1 &
    printf '%s' "$!" > "$PIDFILE"
    ;;
  tick-stop)
    # No kill: the loop notices the missing pidfile within one interval and
    # exits on its own — avoids any pid-reuse hazard.
    rm -f "$PIDFILE"
    ;;
  tick-loop)
    ME=$$
    N=0
    while [ "$N" -lt "$MAX_TICKS" ]; do
      [ "$(cat "$PIDFILE" 2>/dev/null)" = "$ME" ] || exit 0
      engine tick
      sleep "${SMART_SPINNER_INTERVAL:-5}"
      N=$((N+1))
    done
    [ "$(cat "$PIDFILE" 2>/dev/null)" = "$ME" ] && rm -f "$PIDFILE"
    ;;
  *)
    engine "$@"
    ;;
esac
exit 0
