# 망토 장비 시스템 (Cloak Equipment) — Spec v1

## 배경
- 캐릭터 고정 장착 망토 신설. 모든 캐릭(기존 + 신규)이 영구 장착.
- 추후 레이드 보스(발라카스/아트라스/카르나스)에서 드롭되는 **정수**로 망토 스탯을 영구 강화.
- 망토 자체는 거래/이동/해제 불가 — 캐릭터에 묶임.

## 인터뷰 결정 (사용자 확정)

| 항목 | 결정 |
|---|---|
| 슬롯 | 신규 `cloak` 슬롯 신설 (UI/DB enum 모두 추가) |
| 이동/거래 | 완전 고정 — soulbound + locked, 해제·판매·우편·창고·거래 모두 불가 |
| 기본 망토 | grade=common, name='낡은 망토', defense=10, soulbound=true, locked=true |
| 기존 캐릭 백필 | 마이그레이션 1회로 모든 기존 캐릭에 INSERT (즉시 일괄) |
| 강화 메커니즘 | 정수 사용 시 **7효과 중 1개 랜덤** 으로 결정 → 그 효과 단계 상승 |
| 정수별 상승 폭 | 발라카스 +1 / 아트라스 +2 / 카르나스 +3 단계 |
| 강화 단계 cap | **없음** — 정수 수급량으로 자연 제한 |

## DB 변경

### 마이그레이션: `045_cloak_equipment.sql`
1. `items` 에 슬롯값 'cloak' 추가 (CHECK 제약 갱신, 또는 enum 사용 시 ADD VALUE)
2. `character_equipped` 의 slot 컬럼 enum/CHECK 에 'cloak' 추가
3. `items` 에 기본 망토 INSERT — id 351, name='낡은 망토', type='armor', grade='common', slot='cloak', stats={"def": 10}, soulbound=true (description에 명시)
4. `character_equipped` 백필:
   ```sql
   INSERT INTO character_equipped (character_id, slot, item_id, soulbound, locked)
     SELECT id, 'cloak', 351, TRUE, TRUE FROM characters
     ON CONFLICT (character_id, slot) DO NOTHING;
   ```
5. `character_cloak_levels` 신규 테이블 — 7효과별 누적 단계
   ```sql
   CREATE TABLE character_cloak_levels (
     character_id INT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
     atk_lv INT NOT NULL DEFAULT 0,
     matk_lv INT NOT NULL DEFAULT 0,
     speed_lv INT NOT NULL DEFAULT 0,
     hp_pct_lv INT NOT NULL DEFAULT 0,
     def_pct_lv INT NOT NULL DEFAULT 0,
     crit_lv INT NOT NULL DEFAULT 0,
     crit_dmg_lv INT NOT NULL DEFAULT 0,
     total_essences_used INT NOT NULL DEFAULT 0,
     last_used_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```
6. `character_cloak_levels` 백필: 모든 캐릭 0×7 행 생성

## 강화 메커니즘 (확정)

### 정수 사용 시 흐름
1. 캐릭터가 정수 N개 일괄 사용 (또는 1개씩)
2. **정수 1개당** 7효과 중 1개를 균등 확률(1/7)로 랜덤 선택
3. 선택된 효과의 단계를 정수 종류에 따라 상승:
   - 발라카스의 정수 → **+1 단계**
   - 아트라스의 정수 → **+2 단계**
   - 카르나스의 정수 → **+3 단계**
4. 단계 cap 없음 — 무한 누적 가능

### 7효과 · 단계당 증가량 (확정)

| # | 효과 키 | 단계당 증가량 | 비고 |
|---|---|---|---|
| 1 | `atk` | **+25** | 공격력 (flat) |
| 2 | `matk` | **+25** | 마법공격력 (flat) |
| 3 | `speed` | **+2** | 스피드 (flat) |
| 4 | `hp_pct` | **+0.5%** | 체력 % |
| 5 | `def_pct` | **+0.5%** | 방어력 % |
| 6 | `crit` | **+0.5%** | 크리티컬 확률 |
| 7 | `crit_dmg` | **+0.5%** | 크리티컬 데미지 |

### 예시
- 카르나스 정수 1개 사용 → 랜덤 굴림 결과 `crit` 선택 → 크리율 단계 +3 → 크리율 +1.5% 누적
- 발라카스 정수 5개 일괄 사용 → 5번 굴림, 각자 1/7 확률로 효과 분산 → 각 +1 단계씩 합산

### 정수 아이템 정의 (보스 재설정 시 함께 등록 예정 — 이번 spec 범위 외)
- 발라카스의 정수 (item_id 352, grade=legendary, stack=99)
- 아트라스의 정수 (item_id 353)
- 카르나스의 정수 (item_id 354)

## 보스·정수 드롭 규칙 (확정)

### 보스 체력 — 무한
- 보스 `max_hp` 는 **사실상 처치 불가능한 큰 값** (예: 10^12 / 999_999_999_999).
- 시간 만료(expired) 가 정상 결산 흐름. defeated 발생 X.
- 코드 상 `current_hp` 는 0 으로 떨어지지 않으므로 `checkExpiredWorldEvents` 의 defeated 분기 자연 미발동.

### 결산 시점
- **시간 만료 시점**에 누적 dmg 기준 순위 결정 → 정수 분배.
- expired 가 곧 결산 (이전 spec 의 "처치에만 지급" 폐기).

### 정수 분배 — 2 라인 독립 굴림 (중복 가능)

보스가 자기 이름의 정수 (발라카스 → 발라카스의 정수 등) 를 분배.
한 캐릭이 두 라인 모두 받을 수 있음 (예: 1위 = 최대 2개).

#### 라인 A — 참여 랜덤 (모든 참여자)
- **모든 참여자 각자 25% 확률** 개별 굴림 (순위 무관).
- 성공 시 정수 1개.
- 101위 밖도 동일 적용.

#### 라인 B — 순위 보상 (누적 dmg rank)
| 순위 | 확률 |
|---|---|
| 1~20위 | 100% 확정 |
| 21~40위 | 75% 확률 |
| 41~100위 | 50% 확률 |
| 101위~ | 0% (라인 A만) |

### 예시
- 1위: 라인 B 확정 1개 + 라인 A 25% 굴림 → 1~2개
- 50위: 라인 B 50% 굴림 + 라인 A 25% 굴림 → 0~2개
- 150위: 라인 A 25% 굴림만 → 0~1개

### 적용 시점·전달
- `finishEvent(eventId, 'expired')` 시 정수 분배 함수 호출
- 정수는 **인벤토리에 직접 추가**, 빈 칸 없으면 **우편함 발송**
- 결산 알림: 기존 `world_event_end` socket emit + 메일 본문에 굴림 결과 명시

### 정수 아이템 속성
- **soulbound = false** — 거래·우편·창고 자유 (사용자 확정)
- stack_size = 99
- grade = legendary
- type = consumable (또는 etc; 사용은 InventoryScreen "사용" 버튼이 처리하므로 무관)
- 이름 기반 lookup (`발라카스의 정수` 등) — item_id 변경에도 안전

## 코드 변경

### server
1. `character.ts` 의 캐릭 생성 함수 (`createCharacter` 또는 `signupCreateChar`) 마지막에:
   - INSERT INTO character_equipped (...'cloak', 351, soulbound=true, locked=true)
   - INSERT INTO character_cloak_essence (character_id) VALUES ($1)
2. `getEffectiveStats(char)`:
   - 기존 장비 스탯 합산 시 cloak slot 도 포함 (slot 목록에 'cloak' 추가)
   - 망토 효과 합산: `SELECT * FROM character_cloak_levels WHERE character_id=$1`
   - 단계 → 효과 변환:
     ```ts
     eff.atk      += lv.atk_lv * 25;
     eff.matk     += lv.matk_lv * 25;
     eff.speed    += lv.speed_lv * 2;
     eff.hpPct    += lv.hp_pct_lv * 0.5;    // %
     eff.defPct   += lv.def_pct_lv * 0.5;   // %
     eff.crit     += lv.crit_lv * 0.5;      // %
     eff.critDmg  += lv.crit_dmg_lv * 0.5;  // %
     ```
3. 신규 헬퍼 `applyEssence(charId, kind, count)`:
   - kind: `'balacas'` | `'atras'` | `'carnas'`
   - stepGain = `{ balacas: 1, atras: 2, carnas: 3 }[kind]`
   - count 번 반복:
     - 7효과 중 무작위 1개 (균등 1/7)
     - 해당 컬럼 += stepGain
   - 결과 log 배열 반환 (`['crit +3', 'atk +2', ...]`)
4. 신규 라우트 `POST /me/cloak/apply-essence`:
   - body: `{ kind: 'balacas'|'atras'|'carnas', count: number }`
   - 트랜잭션: 인벤토리 정수 N개 차감 → `applyEssence` 호출 → `total_essences_used += count`
   - 응답: 갱신된 단계값 + 굴림 로그
5. 신규 라우트 `GET /me/cloak`:
   - 망토 정보 + 7효과 현재 단계 + 효과 환산 수치 + 누적 사용 정수 수 반환

### 장비 해제 차단
- `unequipItem` / `equipItem` / `sellItem` / `moveToStorage` / `sendByMail` 등 모든 아이템 이동 함수에서:
  - locked=true 인 아이템 차단 (이미 있을 가능성 — 검증 필요)
  - 추가로 slot='cloak' 인 row 명시 차단 (방어적)

### client
1. `EquipmentScreen` / 캐릭 시트 — 망토 슬롯 칸 추가 (방어구 슬롯 옆)
2. `InventoryScreen` — 망토는 아이템으로 노출 안 함 (or 회색 ✕ 표시)
3. 신규 `CloakScreen.tsx` — 정수 적용 UI:
   - 망토 7효과 현재 단계 + 환산 수치 표시 (테이블)
   - 인벤토리의 정수 3종 보유량 + "1개 사용 / 전체 사용" 버튼
   - 정수별 상승 폭 안내 (발라카스 +1 / 아트라스 +2 / 카르나스 +3)
   - 적용 후 굴림 결과 토스트 (예: "🎲 카르나스 정수 사용 → 크리율 +3 단계!")
   - 다중 굴림 시 결과 요약 (각 효과별 +N)

## 검증
1. tsc 통과
2. 신규 캐릭 생성 → cloak 자동 장착 확인
3. 기존 캐릭 백필 → 마이그 1회 후 SELECT 로 모든 캐릭 cloak row 존재 확인
4. unequipCloak 시도 → 거부 응답 (lock/soulbound)
5. 정수 적용 → effectiveStats 에 반영, 영구 누적

## 비목표 (이번 범위 아님)
- 정수 아이템 자체 (352/353/354) 등록 — 보스 재설정 spec 에서
- 레이드 보스 재등록 (발라카스 등) — 별도 작업
- 망토 외관/스킨 시각 효과
- 강화 실패/주문서/리셋 메커니즘

## 리스크 & 완화
| 리스크 | 완화 |
|---|---|
| 단계 cap 없음 → 누적 무제한 | 정수는 레이드 보스 드롭 한정, 수급 자연 제한. 카르나스 +3/개로도 유의미한 단계 도달에 다수 필요 |
| 7효과 랜덤 → 원하는 효과 안 나오는 좌절 | UX: 굴림 로그를 토스트로 명확히 노출, 다중 사용 시 결과 요약 표시 |
| 백필 마이그 도중 신규 캐릭 생성 race | 마이그는 단일 트랜잭션, ON CONFLICT DO NOTHING |
| 코드 effectiveStats 에 cloak 누락 시 효과 0 | 마이그 후 한 캐릭 수동 검증 |
| 망토 삭제(잘못된 admin action) | character_equipped FK CASCADE 안 됨, locked=true 기본 차단 |
| 크리율/크리뎀 등 % 효과가 너무 강해질 가능성 | 단계당 0.5%로 보수적. 30단계여도 +15% 수준 |

## 배포
- 로컬에서 tsc 통과 + 수동 검증 → 커밋 → main push → Railway 자동 배포
- 패치노트: 사용자 명시 요청 후 작성 ([[feedback_patch_notes]])
