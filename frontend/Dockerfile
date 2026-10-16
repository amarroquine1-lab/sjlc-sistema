# Contexto de construcción: raíz del repositorio (necesita ./nginx y ./frontend)
FROM node:22.23-alpine AS base
RUN apk add --no-cache tzdata
ENV TZ=America/Guatemala
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Desarrollo: servidor de Vite con recarga en caliente
FROM base AS desarrollo
COPY --chown=node:node frontend/tsconfig.json frontend/vite.config.ts frontend/index.html ./
COPY --chown=node:node frontend/src ./src
EXPOSE 5173
CMD ["npm", "run", "dev"]

FROM desarrollo AS compilacion
RUN npm run build

# Producción: Nginx sin privilegios sirviendo el frontend compilado
FROM nginxinc/nginx-unprivileged:1.30-alpine AS produccion
USER root
RUN apk add --no-cache tzdata
ENV TZ=America/Guatemala
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/snippets /etc/nginx/snippets
COPY nginx/sitios /etc/nginx/sitios
COPY nginx/cloudflare /etc/nginx/cloudflare
COPY --chmod=755 nginx/40-elegir-sitio.sh /docker-entrypoint.d/40-elegir-sitio.sh
COPY --from=compilacion /app/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080 8443
