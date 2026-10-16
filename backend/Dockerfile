FROM node:22.23-alpine AS base
RUN apk add --no-cache tzdata
ENV TZ=America/Guatemala
WORKDIR /app
RUN chown node:node /app

# Desarrollo: todas las dependencias, recarga en caliente
FROM base AS desarrollo
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node src ./src
# dist se usa para migrar y sembrar; el servidor en desarrollo corre con tsx
RUN npm run build
# Migraciones y seeds (contexto adicional "db")
COPY --from=db --chown=node:node . /app/db
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM desarrollo AS compilacion

# Producción: solo dependencias necesarias y código compilado
FROM base AS produccion
ENV NODE_ENV=production
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=compilacion --chown=node:node /app/dist ./dist
COPY --from=db --chown=node:node . /app/db
EXPOSE 3000
CMD ["node", "dist/index.js"]
