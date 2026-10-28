/**
 * CSV 加载器入口：docs/sample_exports/*.csv → PostgreSQL 底表。
 * 用法：pnpm db:sync
 */
import { loadEnv } from "./env";

loadEnv();

async function main() {
  // 动态导入：确保 DATABASE_URL 在 PrismaClient 构造前已就位
  const { disconnect, runSync } = await import("./loader");
  try {
    const results = await runSync();
    const width = Math.max(...results.map((item) => item.target.length));
    for (const item of results) {
      console.log(
        `  ${item.target.padEnd(width)}  ${String(item.written).padStart(6)} 行  ← ${item.source}（读入 ${item.read}）`,
      );
    }
    const total = results.reduce((sum, item) => sum + item.written, 0);
    console.log(`✓ 同步完成，共写入 ${total} 行`);
  } finally {
    await disconnect();
  }
}

main().catch((error) => {
  console.error("✗ 同步失败：", error);
  process.exitCode = 1;
});