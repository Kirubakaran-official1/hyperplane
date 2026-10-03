# Build the dashboard, then serve it with Caddy (which also proxies /api and handles HTTPS).
FROM node:20-alpine AS build
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js vite.app.config.js ./
COPY public ./public
COPY app ./app
COPY src ./src
COPY shared ./shared
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /web/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
