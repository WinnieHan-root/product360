#!/usr/bin/env bash
# 在阿里云 ECS（Ubuntu 22.04 / Alibaba Cloud Linux 3）上执行一次：装 Docker + 建目录
# 用法：bash server-bootstrap.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "请用 root 或 sudo 执行：sudo bash $0" >&2
  exit 1
fi

APP_DIR=/opt/product360

echo "==> 1/5 安装基础工具"
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg tar
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y ca-certificates curl tar
fi

echo "==> 2/5 安装 Docker（若已安装则跳过）"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  # 国内机器如果拉取慢，改用阿里云镜像脚本：
  # curl -fsSL https://get.docker.com | sh -s -- --mirror Aliyun
fi
systemctl enable --now docker

echo "==> 3/5 配置 Docker 镜像加速（阿里云内网 registry-mirror 可显著提速）"
mkdir -p /etc/docker
if [ ! -f /etc/docker/daemon.json ]; then
  cat >/etc/docker/daemon.json <<'JSON'
{
  "registry-mirrors": ["https://docker.mirrors.ustc.edu.cn"],
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "3" }
}
JSON
  systemctl restart docker
fi

echo "==> 4/5 创建部署目录"
mkdir -p "$APP_DIR"

echo "==> 5/5 完成检查"
docker --version
docker compose version
echo
echo "✓ 环境就绪。接下来把部署包上传到 $APP_DIR 并解压，见 docs/deploy-aliyun.md §3"
