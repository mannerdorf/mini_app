# Multi-stage: сборка Vite + nginx. В панели Timeweb Apps включите использование Dockerfile из репозитория.
#
# Финал: статика в /usr/share/nginx/html и дубль /app/dist (часть пайплайнов забирает только /app/dist).

FROM node:22-bookworm-slim AS build

WORKDIR /app

# node:24 + npm 11+ блокирует postinstall esbuild; pdf.js после iOS release сильно утяжеляет minify.
# 2048 MB — безопаснее для Timeweb, чем 4096 (OOM → «Остановка»).
ENV NODE_OPTIONS=--max-old-space-size=2048
ENV CI=1

COPY package.json package-lock.json .npmrc ./
RUN npm ci \
  && node -e "require('esbuild').buildSync({stdin:{contents:'console.log(1)',loader:'js'},write:false})"

COPY . .
# Веб (Docker/App Platform): VITE_API_ORIGIN не задаём — same-origin /api через nginx.
# Capacitor: docker build --build-arg VITE_API_ORIGIN=https://api.haulz.space
ARG VITE_API_ORIGIN=
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN
RUN echo "==> vite build (CI)" && npm run build && echo "==> vite build OK"

FROM nginx:1.27-alpine AS production

COPY deploy/nginx.miniapp-static.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY --from=build /app/dist/ /app/dist/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
