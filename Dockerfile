# Multi-stage: сборка Vite + nginx. В панели Timeweb Apps включите использование Dockerfile из репозитория.
#
# Финал: статика в /usr/share/nginx/html и дубль /app/dist (часть пайплайнов забирает только /app/dist).

FROM node:24-slim AS build

WORKDIR /app

# Vite minify после transform требует нативный esbuild; npm 11+ блокирует postinstall без allowScripts.
ENV NODE_OPTIONS=--max-old-space-size=4096
ENV CI=1

COPY package.json package-lock.json ./
RUN npm ci \
  && node -e "require('esbuild').buildSync({write:false,stdin:'',loader:'js'})"

COPY . .
# Веб (Docker/App Platform): VITE_API_ORIGIN не задаём — same-origin /api через nginx.
# Capacitor: docker build --build-arg VITE_API_ORIGIN=https://api.haulz.space
ARG VITE_API_ORIGIN=
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN
RUN npm run build

FROM nginx:1.27-alpine AS production

COPY deploy/nginx.miniapp-static.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY --from=build /app/dist/ /app/dist/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
