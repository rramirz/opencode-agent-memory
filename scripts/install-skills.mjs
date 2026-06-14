#!/usr/bin/env node
// Install bundled skills into ~/.config/opencode/skill/.
// Idempotent. Safe to re-run. Skip via OPENCODE_AGENT_MEMORY_SKIP_SKILLS=1.
//
// Used two ways:
//   1. CLI/manual: `node scripts/install-skills.mjs` (verbose, stdout)
//   2. Imported by index.mjs on MCP server startup (silent on no-op)

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const SKIP_ENV = "OPENCODE_AGENT_MEMORY_SKIP_SKILLS";

export function installSkills({ silent = false } = {}) {
  const log = silent
    ? () => {}
    : (msg) => process.stdout.write(`[opencode-agent-memory] ${msg}\n`);

  if (process.env[SKIP_ENV] === "1") {
    log(`skip skill install (${SKIP_ENV}=1)`);
    return { skipped: true };
  }

  const opencodeDir = path.join(os.homedir(), ".config", "opencode");
  if (!fs.existsSync(opencodeDir)) {
    log(`~/.config/opencode not found, skipping skill install`);
    return { skipped: true };
  }

  // Resolve package root relative to this file: scripts/install-skills.mjs → ..
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgRoot = path.resolve(here, "..");
  const srcSkillsDir = path.join(pkgRoot, "skill");
  if (!fs.existsSync(srcSkillsDir)) {
    log(`no bundled skills found at ${srcSkillsDir}, skipping`);
    return { skipped: true };
  }

  const destSkillsDir = path.join(opencodeDir, "skill");
  fs.mkdirSync(destSkillsDir, { recursive: true });

  const skills = fs
    .readdirSync(srcSkillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let installed = 0;
  let updated = 0;
  let unchanged = 0;

  for (const skill of skills) {
    const srcFile = path.join(srcSkillsDir, skill, "SKILL.md");
    if (!fs.existsSync(srcFile)) continue;

    const destDir = path.join(destSkillsDir, skill);
    const destFile = path.join(destDir, "SKILL.md");
    fs.mkdirSync(destDir, { recursive: true });

    const newContent = fs.readFileSync(srcFile, "utf8");
    if (fs.existsSync(destFile)) {
      const oldContent = fs.readFileSync(destFile, "utf8");
      if (oldContent === newContent) {
        unchanged++;
        continue;
      }
      fs.writeFileSync(destFile, newContent);
      updated++;
      log(`updated skill: ${skill}`);
    } else {
      fs.writeFileSync(destFile, newContent);
      installed++;
      log(`installed skill: ${skill}`);
    }
  }

  log(
    `skills: ${installed} new, ${updated} updated, ${unchanged} unchanged (at ${destSkillsDir})`,
  );

  return { installed, updated, unchanged, skipped: false };
}

// Run as CLI when invoked directly (manual install path).
const invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : "";
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath === thisPath) {
  try {
    installSkills({ silent: false });
  } catch (e) {
    // Never fail npm install over a skill-copy error.
    process.stdout.write(
      `[opencode-agent-memory] skill install failed (non-fatal): ${e.message}\n`,
    );
  }
}
