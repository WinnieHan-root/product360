import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const CANDIDATES = ["../../.env", ".env"];

/** 读取仓库根 .env（tsx 直跑不走 Nest 的配置加载），已存在的 process.env 优先。 */
export function loadEnv(): void {
  for (const candidate of CANDIDATES) {
    const file = resolve(process.cwd(), candidate);
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
}
