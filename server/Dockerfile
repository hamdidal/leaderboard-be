FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY server ./server
RUN npm install -w packages/shared -w server
RUN npm run build -w packages/shared
RUN npm run prisma:generate -w server
RUN npm run build -w server

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/package.json ./
COPY --from=builder /app/server/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ../packages/shared/dist
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
