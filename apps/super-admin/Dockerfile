FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY apps/super-admin/package*.json apps/super-admin/
COPY apps/backend/package*.json apps/backend/
COPY apps/frontend/package*.json apps/frontend/
COPY apps/tenant-portal/package*.json apps/tenant-portal/
COPY apps/driver/package*.json apps/driver/
COPY packages/*/package*.json packages/

RUN npm ci

COPY . .
RUN npm run build --workspace=apps/super-admin

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/super-admin ./apps/super-admin

EXPOSE 4174
CMD ["npm", "run", "preview", "--workspace=apps/super-admin", "--", "--host", "0.0.0.0", "--port", "4174"]
