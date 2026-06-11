---
description: Turn off Smart Spinner facts and restore the default spinner
---

# Smart Spinner — turn off

Run:

```
sh "${CLAUDE_PLUGIN_ROOT}/scripts/run.sh" off
```

If the `${CLAUDE_PLUGIN_ROOT}` placeholder above was not expanded to a real path, the plugin root is stored in `~/.claude/smart-spinner/plugin-root` — use `sh "$(cat ~/.claude/smart-spinner/plugin-root)/scripts/run.sh" off`.

This removes the `spinnerTipsOverride` and `spinnerVerbs` keys that Smart Spinner manages in `~/.claude/settings.json`, restoring any pre-install values from its backup. The facts pool stays at `~/.claude/smart-spinner/` untouched.

Then tell the user (in their language): facts are off; `/smart-spinner:topic <topic>` re-enables them with a fresh pool, and uninstalling the plugin entirely is `/plugin uninstall smart-spinner`.
