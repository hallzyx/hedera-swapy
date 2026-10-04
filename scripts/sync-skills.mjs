/**
 * Keeps the project skills readable by every coding agent.
 *
 * Source of truth: .agents/skills (Cursor, Codex, OpenCode read it).
 * Mirror:          .claude/skills (Claude Code reads it).
 *
 * yarn skills:sync    copy .agents/skills into .claude/skills
 * yarn skills:check   exit 1 when the mirror is out of date (used in CI)
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const SOURCE = ".agents/skills";
const MIRROR = ".claude/skills";
const check = process.argv.includes("--check");

/** Relative file path -> contents for every file under `dir`. */
function snapshot(dir, prefix = "") {
  const files = new Map();
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = join(prefix, entry);
    if (statSync(full).isDirectory()) {
      for (const [path, contents] of snapshot(full, rel)) files.set(path, contents);
    } else {
      files.set(rel, readFileSync(full, "utf8"));
    }
  }
  return files;
}

if (!existsSync(SOURCE)) {
  console.error(`${SOURCE} not found. Run this from the repository root.`);
  process.exit(1);
}

const source = snapshot(SOURCE);
const mirror = snapshot(MIRROR);
const differences = [...source.keys()].filter(path => mirror.get(path) !== source.get(path));
const extras = [...mirror.keys()].filter(path => !source.has(path));

if (check) {
  if (differences.length === 0 && extras.length === 0) {
    console.log(`${MIRROR} matches ${SOURCE}.`);
    process.exit(0);
  }
  console.error(`${MIRROR} is out of date (${differences.length} changed, ${extras.length} extra). Run: yarn skills:sync`);
  process.exit(1);
}

rmSync(MIRROR, { recursive: true, force: true });
mkdirSync(MIRROR, { recursive: true });
cpSync(SOURCE, MIRROR, { recursive: true });
console.log(`Copied ${source.size} file(s) from ${SOURCE} to ${MIRROR}.`);
