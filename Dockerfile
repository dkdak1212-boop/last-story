FROM node:18-slim

WORKDIR /app

# 소스 전체 복사 (캐시 무시)
COPY . .

# 클라이언트 빌드
WORKDIR /app/client
RUN npm install && npm run build

# 서버 빌드
WORKDIR /app/server
RUN npm install && npm run build

# 실행
WORKDIR /app/server
CMD ["node", "dist/index.js"]
