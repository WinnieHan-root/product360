import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient, ScopeType, UserRole } from "@prisma/client";
import { hashSync } from "bcryptjs";

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
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

loadEnv(resolve(process.cwd(), "../../.env"));

const prisma = new PrismaClient();
const PASSWORD = "product360";

/**
 * 只写账号与权限范围，不写任何业务数据。
 * 业务数据一律来自 docs/sample_exports，通过 `pnpm db:sync` 加载。
 */
const ACCOUNTS: Array<{
  email: string;
  name: string;
  role: UserRole;
  canViewCommercial: boolean;
  scopes: Array<{ scopeType: ScopeType; scopeCode: string }>;
}> = [
  {
    email: "admin@product360.dev",
    name: "平台管理员",
    role: UserRole.platform_admin,
    canViewCommercial: true,
    scopes: [],
  },
  {
    email: "data@product360.dev",
    name: "数据管理员（服纺）",
    role: UserRole.data_admin,
    canViewCommercial: true,
    scopes: [{ scopeType: ScopeType.category, scopeCode: "CA002" }],
  },
  {
    email: "operator@product360.dev",
    name: "运营（Momcozy）",
    role: UserRole.operator,
    canViewCommercial: true,
    scopes: [{ scopeType: ScopeType.brand, scopeCode: "Momcozy" }],
  },
  {
    email: "employee@product360.dev",
    name: "普通员工（Momcozy）",
    role: UserRole.employee,
    canViewCommercial: false,
    scopes: [{ scopeType: ScopeType.brand, scopeCode: "Momcozy" }],
  },
];

async function main() {
  const passwordHash = hashSync(PASSWORD, 10);

  // 账号是唯一的重置范围：业务表由 db:sync 自己 TRUNCATE，这里不碰。
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "user_scopes", "users" RESTART IDENTITY CASCADE');

  for (const account of ACCOUNTS) {
    await prisma.user.create({
      data: {
        email: account.email,
        name: account.name,
        passwordHash,
        role: account.role,
        canViewCommercial: account.canViewCommercial,
        scopes: { create: account.scopes },
      },
    });
  }

  const users = await prisma.user.count();
  console.log(`✓ 账号 ${users} 个（密码统一为 ${PASSWORD}）：`);
  for (const account of ACCOUNTS) {
    const scope = account.scopes.map((s) => `${s.scopeType}:${s.scopeCode}`).join(",") || "全量";
    console.log(
      `  ${account.email.padEnd(26)} ${account.role.padEnd(15)} 商业字段=${
        account.canViewCommercial ? "是" : "否"
      } 范围=${scope}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());