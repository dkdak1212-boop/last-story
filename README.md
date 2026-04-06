# 마지막이야기 (The Last Story)

서양 중세 판타지 MMO 텍스트 RPG · 틱 기반 자동전투 · 오프라인 진행 보상

> 스펙: `C:\Users\tizlf\fantasy-mmo-spec.md`

## 구조

```
last-story/
├── client/    React + TypeScript + Vite + Zustand + Framer Motion
├── server/    Node + Express + Socket.io + PostgreSQL
├── shared/    공유 타입
├── db/        PostgreSQL 스키마/마이그레이션
└── docs/      밸런스/기획 문서
```

## 사전 요구사항

- Node.js 20+
- PostgreSQL 15+ (로컬 설치 또는 Docker)

## 개발 환경 셋업

```bash
# 1. 의존성 설치
cd client && npm install
cd ../server && npm install

# 2. DB 생성
psql -U postgres -c "CREATE DATABASE laststory;"
psql -U postgres -d laststory -f db/schema.sql

# 3. 환경 변수
cp server/.env.example server/.env
# DATABASE_URL, JWT_SECRET 등 채우기

# 4. 실행
cd server && npm run dev   # :4000
cd client && npm run dev   # :5173
```
