/**
 * 让 Prisma CLI 也能读到仓库根的 .env（Prisma 只自动加载 cwd 与 schema 目录下的 .env）。
 * 用法：node scripts/with-env.mjs prisma db push
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // apps/api/scripts
const apiRoot = resolve(here, "..");

for (const file of [resolve(apiRoot, "../../.env"), resolve(apiRoot, ".env")]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("用法：node scripts/with-env.mjs <command> [...args]");
  process.exit(2);
}

const result = spawnSync(command, args, { stdio: "inherit", cwd: apiRoot, env: process.env });
process.exit(result.status ?? 1);