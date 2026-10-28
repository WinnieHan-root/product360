#!/usr/bin/env bash
# 在 ECS 上、解压后的仓库根目录执行：构建 + 初始化数据库 + 启动 + 验收
# 用法：
#   bash scripts/release.sh              # 常规发版（不重置数据库）
#   INIT_DB=1 bash scripts/release.sh    # 首次部署：建表 + 灌样例数据 + 写账号
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/deploy"

COMPOSE="docker compose -f docker-compose.prod.yml"
# 对外端口从 deploy/.env 读，避免 HTTP_PORT 不是 80 时验收命令打偏
PORT=$(grep -E '^HTTP_PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '"')
BASE="http://127.0.0.1:${PORT:-80}"

if [ ! -f .env ]; then
  echo "缺少 deploy/.env，请先：cp .env.production.example .env && chmod 600 .env 并填好密码" >&2
  exit 1
fi

echo "==> 1/5 构建镜像（首次会装依赖，约 3-6 分钟）"
$COMPOSE build

if [ "${INIT_DB:-0}" = "1" ]; then
  echo "==> 2/5 初始化数据库：prisma db push → 同步样例 CSV → 写账号"
  $COMPOSE --profile init run --rm db-init
else
  echo "==> 2/5 跳过数据库初始化（需要重建请用 INIT_DB=1）"
fi

echo "==> 3/5 启动服务"
$COMPOSE up -d --remove-orphans

echo "==> 4/5 等待健康检查"
for i in $(seq 1 40); do
  if curl -fsS "$BASE"/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 3
done
curl -fsS "$BASE"/api/health || {
  echo "健康检查失败，查看日志：$COMPOSE logs --tail=80 api" >&2
  exit 1
}
echo

echo "==> 5/5 冒烟：登录 + 列表首屏"
TOKEN=$(curl -fsS -X POST "$BASE"/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@product360.dev","password":"product360"}' \
  | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')

if [ -n "$TOKEN" ]; then
  curl -fsS "$BASE/api/products?pageSize=1" -H "authorization: Bearer $TOKEN" \
    | head -c 300
  echo
  echo "✓ 发版完成"
else
  echo "! 登录接口未返回 token，请手动检查（默认账号可能已被改密码）" >&2
fi
