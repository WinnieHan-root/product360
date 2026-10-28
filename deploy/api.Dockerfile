# 商品中心 API 镜像（NestJS + Prisma）
# 单机 Compose 方案：同一个镜像既跑 API，也用于一次性初始化（db push / sync / seed），
# 因此保留 devDependencies（prisma CLI、tsx）。体积换省心，单机 4C8G 完全够用。
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# 国内服务器构建建议走镜像源，可在构建时用 --build-arg NPM_REGISTRY=https://registry.npmmirror.com
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate \
 && pnpm config set registry "$NPM_REGISTRY" --global

# Prisma 在 debian-slim 上需要 openssl
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先只拷清单，最大化利用镜像层缓存
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @product360/api...

COPY . .
# 必须先 prisma generate，nest build 才有 Prisma 的类型（容器里没有本地已生成的 client）
RUN cd apps/api && ./node_modules/.bin/prisma generate
RUN pnpm --filter @product360/shared build \
 && pnpm --filter @product360/api build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
