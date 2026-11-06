# syntax=docker/dockerfile:1
#
# Render (and any Docker host) image for the AI Square platform.
# Two stages: build the single-file client bundle, then run the Express API
# with production dependencies only.

# ---------- build ----------
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:24-alpine AS runtime
WORKDIR /app

# Render injects PORT at runtime; 10000 is its default container port.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

# the SQLite demo database and uploads live here — writable by the node user
RUN mkdir -p data storage/resumes storage/guidelines \
    && chown -R node:node /app

USER node
EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||10000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
