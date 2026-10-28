#!/usr/bin/env bash
# 在阿里云 ECS（Ubuntu 22.04 / Alibaba Cloud Linux 3）上执行一次：装 Docker + 规划目录
# 用法：
#   bash server-bootstrap.sh                              # 自动判断数据盘
#   DOCKER_ROOT=/data/docker APP_DIR=/data/product360 bash server-bootstrap.sh
#   走不通官方源时：DOCKER_MIRROR=https://docker.m.daocloud.io bash server-bootstrap.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "请用 root 或 sudo 执行：sudo bash $0" >&2
  exit 1
fi

# ---------- 磁盘规划：优先用挂载的数据盘，别把 20G 系统盘写满 ----------
BIG_MOUNT=$(df -BG --output=target,avail 2>/dev/null | awk '$1 ~ /^\/(data|opt|mnt)/ && $2+0 >= 50 {print $1; exit}')
if [ -n "$BIG_MOUNT" ]; then
  DEFAULT_DOCKER_ROOT="${BIG_MOUNT%/}/docker"
  DEFAULT_APP_DIR="${BIG_MOUNT%/}/product360"
else
  DEFAULT_DOCKER_ROOT=/var/lib/docker
  DEFAULT_APP_DIR=/opt/product360
fi
DOCKER_ROOT="${DOCKER_ROOT:-$DEFAULT_DOCKER_ROOT}"
APP_DIR="${APP_DIR:-$DEFAULT_APP_DIR}"

echo "==> 规划"
echo "    Docker 数据目录：$DOCKER_ROOT"
echo "    代码目录：      $APP_DIR"
df -h "$(dirname "$DOCKER_ROOT")" | tail -1

echo "==> 1/6 安装基础工具"
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg tar git
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y ca-certificates curl tar git
fi

echo "==> 2/6 安装 Docker（若已安装则跳过）"
if ! command -v docker >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    # 走阿里云镜像站，不依赖 download.docker.com
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      >/etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else
    curl -fsSL https://get.docker.com | sh
  fi
fi
systemctl enable docker

echo "==> 3/6 探测可用的镜像加速器（国内直连 Docker Hub 基本不可用）"
# 按优先级探测；DOCKER_MIRROR 显式指定时不再探测
CANDIDATES="${DOCKER_MIRROR:-https://docker.m.daocloud.io https://docker.1ms.run https://docker.xuanyuan.me https://docker.1panel.live}"
MIRRORS=""
for m in $CANDIDATES; do
  if curl -sI -m 6 "$m/v2/" 2>/dev/null | grep -qE "^HTTP/[0-9.]+ (200|401)"; then
    echo "    ✓ $m"
    MIRRORS="$MIRRORS\"$m\","
  else
    echo "    ✗ $m"
  fi
done
MIRRORS="[${MIRRORS%,}]"

echo "==> 4/6 配置 daemon（数据目录 + 日志轮转 + 镜像加速）"
mkdir -p "$DOCKER_ROOT" /etc/docker
if [ -f /etc/docker/daemon.json ]; then
  echo "    /etc/docker/daemon.json 已存在，仅补充缺失字段"
  python3 - "$DOCKER_ROOT" "$MIRRORS" <<'PY'
import json, sys
path = "/etc/docker/daemon.json"
root, mirrors = sys.argv[1], json.loads(sys.argv[2])
d = json.load(open(path))
d.setdefault("data-root", root)
d.setdefault("log-driver", "json-file")
d.setdefault("log-opts", {"max-size": "50m", "max-file": "3"})
if mirrors and not d.get("registry-mirrors"):
    d["registry-mirrors"] = mirrors
json.dump(d, open(path, "w"), indent=2)
print(open(path).read())
PY
else
  cat >/etc/docker/daemon.json <<JSON
{
  "data-root": "${DOCKER_ROOT}",
  "registry-mirrors": ${MIRRORS},
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "3" }
}
JSON
  cat /etc/docker/daemon.json
fi
systemctl restart docker
docker info >/dev/null 2>&1 || { echo "docker 启动失败，检查 /etc/docker/daemon.json" >&2; exit 1; }
if [ "$(docker info --format '{{.DockerRootDir}}')" != "$DOCKER_ROOT" ]; then
  echo "    ! data-root 未生效（期望 $DOCKER_ROOT），检查是否被其它配置文件覆盖" >&2
fi

echo "==> 5/6 创建代码目录并放行 git 属主检查"
mkdir -p "$APP_DIR"
git config --system --add safe.directory "$APP_DIR" 2>/dev/null || true

echo "==> 6/6 完成检查"
docker --version
docker compose version
git --version
echo "Docker Root Dir: $(docker info --format '{{.DockerRootDir}}')"

echo "==> 7/7 拉镜像自检（nginx:1.27-alpine，约 20MB）"
if docker pull nginx:1.27-alpine >/dev/null 2>&1; then
  echo "    ✓ 镜像可正常拉取"
else
  echo "    ✗ 镜像拉取失败 —— 无法构建，请先解决这一步" >&2
  cat <<'TIP' >&2

    最可靠的做法：用你阿里云账号的专用加速器
      控制台 → 容器镜像服务 ACR → 镜像工具 → 镜像加速器 → 复制 https://xxxxxx.mirror.aliyuncs.com
    然后重跑：
      DOCKER_MIRROR=https://xxxxxx.mirror.aliyuncs.com bash scripts/server-bootstrap.sh
      systemctl restart docker && docker pull nginx:1.27-alpine

TIP
  exit 2
fi

echo
echo "✓ 环境就绪。接下来：cd $APP_DIR && git clone https://github.com/WinnieHan-root/product360.git ."
echo "  详见 docs/deploy-runbook.md §1"