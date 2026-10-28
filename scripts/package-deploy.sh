#!/usr/bin/env bash
# 在本地（macOS）打部署包：只包含构建所需源文件，排除 node_modules / dist / .env / .git
# 用法：scripts/package-deploy.sh
# 产物：dist-deploy/product360-deploy-<时间戳>.tar.gz（含 sha256 校验文件）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$ROOT/dist-deploy"
NAME="product360-deploy-$STAMP"

mkdir -p "$OUT_DIR"

tar -czf "$OUT_DIR/$NAME.tar.gz" \
  -C "$ROOT" \
  --exclude='./node_modules' \
  --exclude='*/node_modules' \
  --exclude='./apps/web/dist' \
  --exclude='./apps/api/dist' \
  --exclude='./packages/shared/dist' \
  --exclude='./dist-deploy' \
  --exclude='./.git' \
  --exclude='./.turbo' \
  --exclude='*.log' \
  --exclude='./.env' \
  --exclude='./deploy/.env' \
  --exclude='./.DS_Store' \
  .

( cd "$OUT_DIR" && shasum -a 256 "$NAME.tar.gz" > "$NAME.tar.gz.sha256" )

SIZE=$(du -h "$OUT_DIR/$NAME.tar.gz" | cut -f1)
echo "✓ 打包完成：${OUT_DIR}/${NAME}.tar.gz（${SIZE}）"
echo "  校验：$OUT_DIR/$NAME.tar.gz.sha256"
echo
echo "下一步（在本地执行）："
echo "  scp $OUT_DIR/$NAME.tar.gz* root@<ECS公网IP>:/opt/product360/"
