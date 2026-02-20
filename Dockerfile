# ---- Build stage ----
FROM node:20-alpine AS builder

# Install OpenSSL - required by Prisma
RUN apk add --no-cache openssl openssl-dev

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Production stage ----
FROM node:20-alpine AS production

# Install OpenSSL - required by Prisma at runtime
RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output and Prisma files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Generate Prisma client inside container
RUN npx prisma generate

EXPOSE 3000

CMD ["node", "dist/index.js"]