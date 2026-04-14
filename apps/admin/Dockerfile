FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY apps/admin/package*.json apps/admin/
COPY apps/backend/package*.json apps/backend/
COPY apps/frontend/package*.json apps/frontend/
COPY apps/tenant-portal/package*.json apps/tenant-portal/
COPY apps/super-admin/package*.json apps/super-admin/
COPY apps/driver/package*.json apps/driver/
COPY packages/*/package*.json packages/

RUN npm ci

COPY . .
RUN npm run build --workspace=apps/admin

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/admin ./apps/admin

EXPOSE 4175
CMD ["npm", "run", "preview", "--workspace=apps/admin", "--", "--host", "0.0.0.0", "--port", "4175"]
