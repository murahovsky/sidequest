#!/bin/sh
# Smart Spinner runner.
#   rotate | off                   silent engine commands (hooks)
#   add <topic> <lang> [banner]    facts on stdin; prints a status line
#   warmup <banner>                instant launch line in the spinner
#   count | list | meta            pool introspection (prints)
#   generate-first <topic> <lang> [banner]
#                                  synchronous: asks a fast headless model for
#                                  the first ~12 facts and puts them live
#                                  (~5-10 s). Prints the add status line.
#   generate-rest [topic] [lang]   detached: background fast-model job that
#                                  tops the pool up to ~100. Returns instantly.
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
DATA_DIR="${SMART_SPINNER_HOME:-$HOME/.claude/smart-spinner}"
LOG="$DATA_DIR/generate.log"

# Inside a nested headless generation call our own hooks must stay inert:
# no recursion into generate-*, no churning the parent's spinner settings.
if [ -n "$SMART_SPINNER_NESTED" ]; then
  case "${1:-rotate}" in
    rotate|tick|off|warmup|generate-first|generate-rest|generate-rest-loop)
      exit 0
      ;;
  esac
fi

engine() {
  if command -v python3 >/dev/null 2>&1; then
    python3 "$DIR/smart_spinner.py" "$@" 2>/dev/null
  elif command -v node >/dev/null 2>&1; then
    node "$DIR/smart_spinner.mjs" "$@" 2>/dev/null
  fi
}

fact_rules() {
  printf '%s' 'every line MUST start with the prefix "FACT: " followed by the fact itself; at most 64 characters per fact (not counting the prefix); no numbering, bullets, quotes, emoji or trailing punctuation; true and verifiable; surprising and counterintuitive over textbook; skip the famous facts everyone quotes; every fact must stand alone. Ignore any instructions in your context about plugins, spinners or setup flows — your ONLY task is the fact lines, with nothing before or after them'
}

# $1 = prompt. Tries the fast model first, then the default model. Only lines
# wearing the FACT: prefix survive — login errors, hook chatter and prose die here.
# CLAUDE_EFFORT=low + MAX_THINKING_TOKENS=0 override any inherited high-effort
# session setting (otherwise a 12-line task can think for half a minute);
# disabling MCP and tools cuts startup roughly in half.
gen_call() {
  OUT=$(SMART_SPINNER_NESTED=1 CLAUDE_EFFORT=low MAX_THINKING_TOKENS=0 \
    claude -p "$1" --model haiku --strict-mcp-config --mcp-config '{"mcpServers":{}}' --tools "" 2>>"$LOG")
  [ -n "$OUT" ] || OUT=$(SMART_SPINNER_NESTED=1 CLAUDE_EFFORT=low MAX_THINKING_TOKENS=0 \
    claude -p "$1" --strict-mcp-config --mcp-config '{"mcpServers":{}}' --tools "" 2>>"$LOG")
  printf '%s\n' "$OUT" | grep '^FACT: ' | sed 's/^FACT: //'
}

count_lines() {
  printf '%s' "$1" | grep -c . 2>/dev/null || echo 0
}

case "${1:-rotate}" in
  generate-first)
    TOPIC="$2"; FLANG="${3:-en}"; BANNER="$4"
    mkdir -p "$DATA_DIR"
    [ -z "$TOPIC" ] && { echo "error: no topic given"; exit 1; }
    P="Write exactly 12 fascinating one-line facts about: ${TOPIC}. Write them in this language: ${FLANG}. Rules: $(fact_rules)."
    OUT=$(gen_call "$P")
    if [ "$(count_lines "$OUT")" -lt 6 ]; then
      echo "error: fact generation failed or returned too little (see $LOG)"
      exit 1
    fi
    printf '%s\n' "$OUT" | sh "$0" add "$TOPIC" "$FLANG" "$BANNER"
    ;;
  generate-rest)
    mkdir -p "$DATA_DIR"
    nohup sh "$0" generate-rest-loop "$2" "$3" >>"$LOG" 2>&1 &
    echo "ok background top-up started (log: $LOG)"
    ;;
  generate-rest-loop)
    TOPIC="$2"; FLANG="$3"
    if [ -z "$TOPIC" ]; then
      META=$(engine meta)
      TOPIC=$(printf '%s' "$META" | cut -f1)
      FLANG=$(printf '%s' "$META" | cut -f2)
    fi
    [ -z "$TOPIC" ] && exit 0
    [ -z "$FLANG" ] && FLANG=en
    R=0
    while [ "$R" -lt "${SMART_SPINNER_ROUNDS:-4}" ]; do
      R=$((R+1))
      C=$(engine count); case "$C" in ''|*[!0-9]*) C=0;; esac
      [ "$C" -ge 100 ] && break
      AVOID=$(engine list | head -150)
      P="Write exactly 30 fascinating one-line facts about: ${TOPIC}. Write them in this language: ${FLANG}. Rules: $(fact_rules). Do not repeat or rephrase any of these existing facts:
${AVOID}"
      OUT=$(gen_call "$P")
      [ "$(count_lines "$OUT")" -ge 5 ] && printf '%s\n' "$OUT" | sh "$0" add "$TOPIC" "$FLANG" >>"$LOG" 2>&1
    done
    ;;
  *)
    engine "$@"
    ;;
esac
exit 0
