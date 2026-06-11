#!/usr/bin/env node
// One-command installer: npx github:murahovsky/smart-spinner
// Registers the marketplace and installs the plugin via the claude CLI.
import { execFileSync } from "node:child_process";

const REPO = "murahovsky/smart-spinner";
const MARKETPLACE = "smart-spinner";
const PLUGIN = "smart-spinner";

function claude(args) {
  return execFileSync("claude", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

console.log("Smart Spinner installer\n");

try {
  claude(["--version"]);
} catch {
  fail("Claude Code CLI not found. Install it first: https://code.claude.com — then re-run this command.");
}

try {
  claude(["plugin", "marketplace", "add", REPO]);
  console.log(`✓ Marketplace added (${REPO})`);
} catch (err) {
  const out = `${err.stdout || ""}${err.stderr || ""}`;
  if (/already/i.test(out)) {
    console.log("✓ Marketplace already registered");
  } else {
    fail(`Could not add marketplace:\n${out.trim()}`);
  }
}

try {
  claude(["plugin", "install", `${PLUGIN}@${MARKETPLACE}`]);
  console.log("✓ Plugin installed");
} catch (err) {
  const out = `${err.stdout || ""}${err.stderr || ""}`;
  if (/already/i.test(out)) {
    console.log("✓ Plugin already installed");
  } else {
    fail(`Could not install plugin:\n${out.trim()}`);
  }
}

console.log(`
Done! Start a new "claude" session — it will ask what topic fascinates you,
then fill your spinner with facts about it, in your language.

Commands inside Claude Code:
  /smart-spinner:topic <topic>   pick or change the topic
  /smart-spinner:off             turn facts off
`);
