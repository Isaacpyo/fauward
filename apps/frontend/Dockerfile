FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY apps/frontend/package*.json apps/frontend/
COPY apps/backend/package*.json apps/backend/
COPY apps/tenant-portal/package*.json apps/tenant-portal/
COPY apps/super-admin/package*.json apps/super-admin/
COPY apps/agents/package*.json apps/agents/
COPY packages/*/package*.json packages/

RUN npm ci

COPY . .
RUN npm run build --workspace=apps/frontend

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/frontend ./apps/frontend

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=apps/frontend", "--", "-p", "3000", "-H", "0.0.0.0"]
