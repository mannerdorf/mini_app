# Multi-stage: сборка Vite + nginx. В панели Timeweb Apps включите использование Dockerfile из репозитория.
#
# Финал: статика в /usr/share/nginx/html и дубль /app/dist (часть пайплайнов забирает только /app/dist).

FROM node:24-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS production

COPY deploy/nginx.miniapp-static.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY --from=build /app/dist/ /app/dist/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
