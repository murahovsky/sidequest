---
description: Turn off Sidequest facts and restore the default spinner
---

# Sidequest — turn off

Run:

```
sh "${CLAUDE_PLUGIN_ROOT}/scripts/run.sh" off
```

If the `${CLAUDE_PLUGIN_ROOT}` placeholder above was not expanded to a real path, the plugin root is stored in `${CLAUDE_CONFIG_DIR:-~/.claude}/sidequest/plugin-root` — use `sh "$(cat "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidequest/plugin-root")/scripts/run.sh" off`.

This removes the `spinnerTipsOverride` and `spinnerVerbs` keys that Sidequest manages in `~/.claude/settings.json`, restoring any pre-install values from its backup. The facts pool stays at `${CLAUDE_CONFIG_DIR:-~/.claude}/sidequest/` untouched.

Then tell the user (in their language): facts are off; `/sidequest:topic <topic>` re-enables them with a fresh pool, and uninstalling the plugin entirely is `/plugin uninstall sidequest`.
