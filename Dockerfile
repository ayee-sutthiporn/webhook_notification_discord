# ใช้ Node 20 แบบบาง
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
# ถ้าใช้ ESM แล้วมี "type":"module" ใน package.json ก็โอเค
ENV NODE_ENV=production
EXPOSE 8080

# Healthcheck (ปรับ path ได้)
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://localhost:8080/ || exit 1

CMD ["node", "server.js"]
