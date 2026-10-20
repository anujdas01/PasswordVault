FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY server/package.json server/package-lock.json ./server/
COPY web/package.json web/package-lock.json ./web/
RUN cd server && npm ci --omit=dev
RUN cd web && npm ci --omit=dev

FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY server/package.json server/package-lock.json ./server/
COPY web/package.json web/package-lock.json ./web/
RUN cd server && npm ci
RUN cd web && npm ci
COPY . .
RUN cd web && npm run build

FROM node:24-alpine AS runner
WORKDIR /app
RUN apk add --no-cache ca-certificates
ENV NODE_ENV=production
ENV PASSWORDVAULT_HOST=0.0.0.0
ENV PASSWORDVAULT_PORT=8080
ENV PASSWORDVAULT_DB=/data/vault.db
ENV PASSWORDVAULT_UPLOAD_DIR=/data/uploads
ENV PASSWORDVAULT_COOKIE_SECURE=true
ENV PASSWORDVAULT_ENFORCE_HTTPS=false
COPY --from=build /app/server ./server
COPY --from=build /app/web/dist ./web/dist
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=deps /app/web/node_modules ./web/node_modules
RUN mkdir -p /data && chown -R node:node /data /app/server /app/web/dist
USER node
EXPOSE 8080
CMD ["node", "server/src/index.js"]
