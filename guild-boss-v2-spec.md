# 길드 보스 v2 — 스펙 정비 / 기능 확장

> 작성일: 2026-04-18
> 참조: `guild-boss-spec.md` (v1 원본)
> 목적: 이미 구현된 v1 골격 위에 (1) 요일 배치 오류 교정, (2) 일부 메커니즘 제거,
>       (3) 주간 결산·메달 상점 신규 구현

---

## 변경 요약

### 교정
- **요일 배치**: DB `weekday=4` / `weekday=5` 가 스펙과 뒤바뀜 — 정상화

### 제거 (기존 구현/상수/UI 전부 삭제)
- **약점 시간대** (매 30분마다 30초 ×3) — `isWeakpointActive`, `WEAKPOINT_*` 삭제
- **누적 디버프** (길드 타격 누적 → 보스 방어 감소) — `DEBUFF_*` 및 total_hits 증폭 로직 삭제
- **임계값 첫 통과 보너스** (1억/5억/10억 달성 메달 +5/+15/+30) — `FIRST_PASS_MEDALS_*` 삭제 + 클라이언트 표기 제거
- **보스 도감** — 아직 미구현, 신규 추가하지 않음

### 유지
- **부활 1회 + 무적 1분** — 운영 조정으로 도입됨, 스펙 "부활 없음"을 오버라이드
- **광분 타이머** — 1분마다 보스 데미지 ×2 누적. 유지
- **현재 보스 수치** — c35087b 이후 DB 수치 유지 (base_def/mdef/dodge 등)
- **보스 특수 효과** — 원소 면역/약점, 도트 면역, HP 회복, 랜덤 약점, 교대 면역 모두 유지

### 신규
- **주간 결산** — 일요일 22:00 KST. 상위 3길드에 메달 보상 + 1위 길드 "왕좌" 호칭 7일 + 서버 전광판 공지
- **메달 상점** — 스펙 7.1 전체 (대형/중형/소형/길드 단위 4섹션)

---

## Phase 실행 순서

| Phase | 내용 | 위험도 | 비고 |
|---|---|---|---|
| 1 | 요일 배치 정상화 (Railway DB UPDATE) | 낮음 | 2행 UPDATE, 즉시 반영 |
| 2 | 약점/누적디버프/임계값 첫 통과 보너스 제거 (코드) | 중간 | 상수/로직/UI 동기 제거 |
| 3 | 주간 결산 구현 (cron + 호칭 + 전광판) | 중간 | 기존 cron 방식 확인 후 |
| 4 | 메달 상점 구현 (DB + 서버 + 클라이언트) | 큼 | 별도 섹션 |

---

## Phase 1 — 요일 배치 정상화

현재 배치 (확인됨):
- weekday=4 → 천공의 용 (스펙상 토요일)
- weekday=5 → 시계태엽 거인 (스펙상 금요일)

목표:
- weekday=4 → 시계태엽 거인 (금요일)
- weekday=5 → 천공의 용 (토요일)

실행:
```sql
UPDATE guild_bosses SET weekday = 999 WHERE name IN ('시계태엽 거인', '천공의 용');
UPDATE guild_bosses SET weekday = 4 WHERE name = '시계태엽 거인';
UPDATE guild_bosses SET weekday = 5 WHERE name = '천공의 용';
```
(UNIQUE 제약 피하려 임시로 999로 돌렸다가 재배치)

---

## Phase 2 — 메커니즘 제거

### 약점 시간대 제거
파일: `server/src/combat/guildBossHelpers.ts`
- 상수: `WEAKPOINT_PERIOD_SEC`, `WEAKPOINT_WINDOW_SEC`, `WEAKPOINT_MULT` 삭제
- 함수: `isWeakpointActive()` 삭제
- `applyDamageToRun` 내부:
  - "5) 약점 시간대 ×3" 블록 삭제
  - "3) 차원 지배자" 에서 `!weakpointActive` 조건 제거 (상시 교대 면역)
  - "6) HP 회복" 에서 `!weakpointActive` 조건 제거 (상시 회복)
- 반환 타입에서 `weakpointActive: boolean` 제거
- `applied` 로그에서 "약점 시간대" 항목 사라짐

### 누적 디버프 제거
- 상수: `DEBUFF_HITS_PER_PERCENT`, `DEBUFF_CAP_PCT` 삭제
- `applyDamageToRun` 내부:
  - "4) 누적 디버프" 블록 전체 삭제 (total_hits 조회 + 증폭 모두 제거)
- `debuffPct` 반환 필드 제거
- **total_hits 컬럼은 유지** — 통계/랭킹용으로 남겨둠 (증가는 계속 발생하지만 데미지에 영향 X)
- 클라이언트: 누적 디버프 표시 UI 있으면 제거 (뒤에서 grep)

### 임계값 첫 통과 보너스 제거
파일: `server/src/routes/guildBoss.ts` + `guildBossHelpers.ts`
- 상수: `FIRST_PASS_MEDALS_COPPER/SILVER/GOLD` (양쪽 파일) 삭제
- `exit` 엔드포인트의 `firstPassBonus` 계산 + DB UPDATE + 응답 필드 삭제
- `guild_boss_runs.thresholds_passed` 컬럼은 유지 (통계·감사 용도) — 값 기록만 지속
- 클라이언트 `GuildBossScreen.tsx`: `firstPassBonus` 타입 필드 + 결과 화면 표시 제거

---

## Phase 3 — 주간 결산

### 동작
- **트리거**: 매주 일요일 22:00 KST
- **집계 기준**: 최근 7일간 `guild_boss_guild_daily.total_damage` 합계 per guild
- **보상**:
  - 1위: 전 길드원에게 메달 200 + **"왕좌"** 호칭 7일간
  - 2위: 전 길드원에게 메달 100
  - 3위: 전 길드원에게 메달 50
  - 지급 방식: 우편함 자동 발송 (기존 `deliverToMailbox` 재사용)
- **공지**: 전광판에 1시간 노출 ("🏆 이번 주 길드보스 1위: XXX 길드! 왕좌 호칭 7일 지급")

### 구현 포인트
- 스케줄러: 기존에 있는 cron/interval 스캔 후 같은 방식 재사용
- 새 테이블:
  ```sql
  CREATE TABLE guild_boss_weekly_settlements (
    id SERIAL PRIMARY KEY,
    week_ending DATE NOT NULL UNIQUE,  -- 그 주 일요일(KST) 날짜
    rankings JSONB NOT NULL,           -- [{guild_id, name, total_damage, rank}, ...]
    settled_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```
- "왕좌" 호칭: 기존 title 시스템 재사용 (`characters.title_expires_at` 같은 컬럼 또는 임시 buff) — 기존 스키마 확인 후 결정
- 중복 정산 방지: `week_ending` UNIQUE + 이미 정산된 주면 skip

---

## Phase 4 — 메달 상점

### DB 스키마 (신규)
```sql
CREATE TABLE guild_boss_shop_items (
  id SERIAL PRIMARY KEY,
  section VARCHAR(20) NOT NULL,   -- 'large' | 'medium' | 'small' | 'guild'
  name VARCHAR(80) NOT NULL,
  description TEXT,
  price INT NOT NULL,              -- 메달 가격
  limit_scope VARCHAR(20),         -- 'daily' | 'weekly' | 'monthly' | 'account_total' | null
  limit_count INT DEFAULT 0,       -- 구매 제한 회수 (0=무제한)
  reward_type VARCHAR(30) NOT NULL,-- 'item' | 'gold' | 'stat_permanent' | 'title' | 'guild_slot' | 'guild_buff'...
  reward_payload JSONB NOT NULL,   -- {itemId: 999, qty: 1} / {gold: 1000000} / ...
  sort_order INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE guild_boss_shop_purchases (
  id BIGSERIAL PRIMARY KEY,
  character_id INT REFERENCES characters(id) ON DELETE CASCADE,
  shop_item_id INT REFERENCES guild_boss_shop_items(id),
  scope_key VARCHAR(40),  -- 'daily:2026-04-18' / 'weekly:2026-W16' / 'monthly:2026-04' / 'total'
  purchased_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shop_purchases_char_scope ON guild_boss_shop_purchases(character_id, shop_item_id, scope_key);
```

### 상품 카탈로그 (시드)
스펙 7.1 표 그대로 DB 시드:
- **대형** 6종: 유니크 무작위 추첨권(8000/주1), T3 보장 추첨권(15000/월1), 영구 스탯 묘약 세트(12000/월1), 창고 슬롯 +3(10000/계정5), "길드영웅" 호칭(7000/계정1), 3옵 보장 굴림권(15000/월1)
- **중형** 4종: 접두사 수치 재굴림권(1200/주3), 강화 성공 스크롤(800/주5), 유니크 조각(2000/주3), 부스터 6시간 패키지(3000/주5)
- **소형** 6종: 골드 묶음(100/일3), 고급 포션 10개(50/일5), 부스터 1시간 택1(150/일3), EXP 두루마리(200/일2), PvP 공격권 +1(100/일2), 일일임무 즉시 완료권(250/일1)
- **길드 단위** 4종 (길드장만): 길드 전체 +25% 24시간 버프(5000/주1), 디버프 캡 상향(3000/일1 — 누적 디버프 제거했으니 **스펙에서 삭제**), 길드 창고 슬롯 +1(8000/월2 — 길드 창고 미구현 시 **스펙에서 삭제**), 길드 명성 +1000 즉시(2000/주2)

### 서버 라우트
- `GET /guild-boss-shop/:characterId/list` — 섹션별 상품 + 현재 구매 가능 수량 + 캐릭터 보유 메달
- `POST /guild-boss-shop/:characterId/buy` — body: `{itemId, qty?}`, 구매 제한 체크 → 메달 차감 → 보상 지급

### 클라이언트 UI
- 새 탭 또는 패널: 기존 길드 보스 화면에 "메달 상점" 버튼 추가
- 4섹션 탭: 대형 / 중형 / 소형 / 길드 단위
- 카드 UI: 이름 / 설명 / 가격 / 남은 구매 가능 횟수 / 구매 버튼
