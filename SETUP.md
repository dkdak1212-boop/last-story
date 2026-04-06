# 마지막이야기 — 로컬 실행 가이드

## 1. PostgreSQL 설치

**Windows:** https://www.postgresql.org/download/windows/ → 설치 중 비밀번호는 `postgres` 권장

**Docker 대안:**
```bash
docker run -d --name laststory-db -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=laststory \
  postgres:16
```

## 2. DB 생성 & 스키마 적용

```bash
# 데이터베이스 생성
psql -U postgres -c "CREATE DATABASE laststory;"

# 스키마 적용
psql -U postgres -d laststory -f db/schema.sql

# 초기 데이터 seed
psql -U postgres -d laststory -f db/seed.sql
```

## 3. 환경 변수

```bash
cd server
cp .env.example .env
```

`.env` 파일 편집:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/laststory
JWT_SECRET=<랜덤 32자 이상 문자열>
```

## 4. 실행

터미널 2개 열기:

**서버 (터미널 1)**
```bash
cd server
npm run dev
# [server] listening on :4000
```

**클라이언트 (터미널 2)**
```bash
cd client
npm run dev
# → http://localhost:5173
```

## 5. 플레이

1. 브라우저에서 http://localhost:5173 접속
2. 회원가입 → 캐릭터 생성 → 마을 → 지도 → 필드 입장
3. 자동 전투 시작, 전투 화면에서 1.5초마다 틱 진행
4. 로그아웃 → 다시 접속 시 오프라인 보상 리포트 표시 (1분 이상 경과 시)

## 주요 API

| 메서드 | 경로 | 설명 |
|-------|------|-----|
| POST | /api/auth/register | 회원가입 |
| POST | /api/auth/login | 로그인 |
| GET | /api/characters | 내 캐릭터 목록 |
| POST | /api/characters | 캐릭터 생성 |
| POST | /api/characters/:id/resume | 오프라인 정산 (캐릭터 선택 시) |
| POST | /api/characters/:id/enter-field | 필드 진입 |
| POST | /api/characters/:id/leave-field | 마을 귀환 |
| POST | /api/characters/:id/combat/tick | 전투 틱 진행 |
| GET | /api/characters/:id/inventory | 인벤 + 장착 |
| POST | /api/characters/:id/equip | 장착 |
| POST | /api/characters/:id/unequip | 해제 |
| GET | /api/characters/:id/skills | 스킬 목록 |
| POST | /api/characters/:id/skills/:sid/toggle-auto | 자동 토글 |
| POST | /api/characters/:id/shop/buy | 상점 구매 |
| GET | /api/fields | 필드 목록 |
| GET | /api/shop | 상점 아이템 |

## 트러블슈팅

- **psql 못 찾음** → PostgreSQL 설치 후 `C:\Program Files\PostgreSQL\16\bin`을 PATH에 추가
- **DB 연결 실패** → `.env`의 DATABASE_URL 확인, PostgreSQL 서비스 시작됐는지 확인
- **404 /api/** → 서버가 4000번 포트에서 실행 중인지 확인
