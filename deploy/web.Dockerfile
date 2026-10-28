# 商品中心 Web 镜像：Vite 构建产物 + Nginx（同时承担 /api 反代）
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ARG NPM_REGISTRY=https://registry.npmjs.org
ARG APT_MIRROR=deb.debian.org
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate \
 && pnpm config set registry "$NPM_REGISTRY" --global

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @product360/web...

COPY . .
# vite alias 指向 packages/shared/src（运行时无需 dist），但 tsc 类型检查走 shared 的 dist 声明，
# 所以仍要先 build shared。
RUN pnpm --filter @product360/shared build \
 && pnpm --filter @product360/web build

FROM nginx:1.27-alpine AS runtime
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx/default.conf /etc/nginx/conf.d/product360.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
