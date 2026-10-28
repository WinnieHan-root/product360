#!/usr/bin/env bash
# 在 ECS 上、仓库目录内执行：拉取最新代码 → 发版（构建/重启/验收）
# 用法：
#   bash scripts/release-git.sh                    # 拉 main 最新提交后发版
#   VERSION=2026.11.03 bash scripts/release-git.sh # 同时更新镜像 tag（便于回滚）
#   INIT_DB=1 bash scripts/release-git.sh          # 首次部署 / 重建库
# 说明：本脚本不会碰数据库，除非显式传 INIT_DB=1。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -d .git ]; then
  echo "当前目录不是 git 仓库（tar 包交付场景），请直接用：bash scripts/release.sh" >&2
  exit 1
fi

echo "==> 1/3 检查工作区"
if [ -n "$(git status --porcelain)" ]; then
  echo "工作区有未提交改动，先处理再发版：" >&2
  git status --short >&2
  echo "  丢弃改动：git checkout -- .   或暂存：git stash" >&2
  exit 1
fi

echo "==> 2/3 拉取代码"
BEFORE=$(git rev-parse --short HEAD)
git fetch --prune origin
git pull --ff-only
AFTER=$(git rev-parse --short HEAD)
if [ "$BEFORE" = "$AFTER" ]; then
  echo "代码无变化（${AFTER}），仍继续重新构建以应用 .env 变更"
else
  echo "代码 $BEFORE → $AFTER"
  git --no-pager log --oneline "$BEFORE..$AFTER" | head -10
fi

if [ -n "${VERSION:-}" ]; then
  echo "==> 更新镜像 tag：APP_VERSION=$VERSION"
  if grep -q '^APP_VERSION=' deploy/.env; then
    sed -i.bak "s|^APP_VERSION=.*|APP_VERSION=$VERSION|" deploy/.env && rm -f deploy/.env.bak
  else
    echo "APP_VERSION=$VERSION" >> deploy/.env
  fi
fi

echo "==> 3/3 发版"
bash scripts/release.sh
