# Build Stage
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production Stage
FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server.ts ./
# We use tsx to run the server in production as well, or you could compile to CJS/ESM
RUN npm install --omit=dev && npm install -g tsx

EXPOSE 3000
CMD ["tsx", "server.ts"]
