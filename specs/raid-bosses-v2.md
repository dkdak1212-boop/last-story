# 레이드 보스 재설정 v2 — Spec

## 배경
- 2026-05-17: 발라카스/아트라스/카르나스 + 관련 제작 아이템 모두 DB에서 삭제 (사용자 요청).
- 망토 시스템 (`cloak-equipment-system.md`) 완료 후 보스 재설정 단계.
- 새 디자인: **보스 HP 무한** → 시간 만료 시점 누적 dmg 순위 기반 정수 분배.

## 인터뷰 확정 (2026-05-17 사용자 결정 반영)

| 항목 | 결정 |
|---|---|
| 보스 HP | **무한대** (10^12) — 처치 불가 |
| **체력비례 데미지** | **차단** — 보스에 HP% 비례 데미지 효과 무효 (0 데미지) |
| **CC기** | **차단** — 스턴/슬로우/침묵/공포/도발 등 상태이상 보스에 미적용 |
| 스케줄 | **KST 17:00 ~ 02:00 (9시간)** 발라카스만 1회/일 spawn |
| 활성 보스 | **발라카스만** — 아트라스/카르나스는 등장 보류 (DB 정의는 유지) |
| 시간 제한 | **9시간** (32400초) — 단일 인스턴스 |
| min_level | 발 L30 (유지) |
| 등급 보상 (S/A/B/C 골드·EXP) | **모두 제거** — 정수만 지급 |
| **보스 스피드** | **1000** (게이지 매우 빠름) |
| **공격 데미지** | **플레이어 최대 HP × 10%** — 어떤 캐릭이든 약 10번 맞으면 사망 |
| **광폭화** | 30초마다 누적 ×2 — t초 후 데미지 멀티 = `2^floor(t/30)` (무한 누적) |
| **사망 쿨다운** | **5분** (DEATH_COOLDOWN_MS = 300_000) |
| **일일 입장 제한** | **최대 10번** (캐릭당) |
| 보스 스킬 시스템 | **길드보스 시스템 이식** — 스킬/시그니처/페이즈 통째로 가져옴 |
| 시그니처 + 패턴 | **풍부한 패턴** (시그니처 1 + 부가 패턴 다수 — guild-boss 의 패턴풀 활용) |

## 보스 정의

| id | name | level | min_level | max_hp | duration | 활성 |
|---|---|---|---|---|---|---|
| 1 | 태고의 용왕 발라카스 | 80 | 30 | 10^12 (무한) | 9시간 | ✅ |
| 2 | 천공의 거인 아트라스 | 90 | 60 | 10^12 | 9시간 | ⏸ (보류) |
| 3 | 심연의 군주 카르나스 | 100 | 80 | 10^12 | 9시간 | ⏸ (보류) |

`max_hp = 10^12` (1조) — 실질 처치 불가, 시간 만료만 발생.
2/3번은 DB에 정의는 유지하지만 스케줄에서 제외 (cron 미스폰).

## 정수 아이템 (3종, items 테이블 신규)

| name | grade | type | stack | soulbound | 효과 |
|---|---|---|---|---|---|
| 발라카스의 정수 | legendary | etc | 99 | false | 망토 +1단계 |
| 아트라스의 정수 | legendary | etc | 99 | false | 망토 +2단계 |
| 카르나스의 정수 | legendary | etc | 99 | false | 망토 +3단계 |

`type=etc` — 인벤토리 UI에서 정수 클릭 시 "사용" 버튼 (cloak 시스템 이미 구현됨, 이름 기반 lookup).

## 스케줄

매일 **KST 17:00** spawn → **9시간 진행** → KST 02:00 만료 결산.
보스는 발라카스 1종만 (아트라스/카르나스는 보류).

| 시각 (KST) | 동작 |
|---|---|
| 17:00 | 발라카스 spawn (`world_event_active` INSERT) |
| 17:00 ~ 02:00 | 누적 dmg 진행, 참여자 자유 입장 |
| 02:00 | `checkExpiredWorldEvents` 가 status='expired' 로 결산 + 정수 분배 |

KST 17:00 = UTC 08:00. cron 매 1분 호출 → `checkAndSpawnWorldEvent` 가 `hour === 8` 시 1회 spawn.
1시간 내 active 가드 그대로 유지 — 9시간 진행 중에는 새 spawn 안 됨.

## 보상 분배 — finishEvent('expired') 호출 시점

### 등급 보상 (S/A/B/C 골드·EXP) — **폐기**
- 이전 reward_table 분배 로직(`distributeRewards`) 호출 제거.
- DB의 `reward_table` 컬럼은 그대로 두되 (빈 배열로 세팅) 분배 함수가 작동 안 함.
- 모든 참여자는 정수만 받음.

### 정수 분배 (cloak spec 참조)
**라인 A** — 모든 참여자 각자 25% 굴림 → 정수 1개
**라인 B** — 누적 dmg rank:
- 1~20위 100%
- 21~40위 75%
- 41~100위 50%
- 101위~ 0%

두 라인 독립, 중복 가능 (최대 2개/참여자).

### 분배 처리
```ts
async function distributeRaidRewards(eventId, bossKind): Promise<void> {
  const participants = await query(
    `SELECT p.character_id, p.total_damage, c.name,
            ROW_NUMBER() OVER (ORDER BY p.total_damage DESC) AS rank
       FROM world_event_participants p
       JOIN characters c ON c.id = p.character_id
      WHERE p.event_id = $1`, [eventId]
  );
  const essenceItemId = await getEssenceItemId(bossKind); // 이름 기반 lookup
  for (const p of participants.rows) {
    let gained = 0;
    // 라인 A
    if (Math.random() < 0.25) gained++;
    // 라인 B
    const rank = Number(p.rank);
    let bChance = 0;
    if (rank <= 20) bChance = 1.0;
    else if (rank <= 40) bChance = 0.75;
    else if (rank <= 100) bChance = 0.5;
    if (bChance > 0 && Math.random() < bChance) gained++;
    if (gained > 0) {
      const { overflow } = await addItemToInventory(p.character_id, essenceItemId, gained);
      if (overflow > 0) await deliverToMailbox(p.character_id, `${bossName} 정수 보상`, '', essenceItemId, overflow);
    }
  }
}
```

`finishEvent(eventId, 'expired')` 흐름:
1. 기존 reward_table 분배 (등급 골드·EXP) — 변경 없음
2. **신규**: `distributeRaidRewards(eventId, bossId)` 호출
3. `UPDATE world_event_active SET status='expired'`
4. socket emit

## DB 변경 (runLateMigrations 신규 블록 `raid_bosses_v2`)

1. **021_raid_phase 컬럼 추가** (기존 미적용 마이그):
   ```sql
   ALTER TABLE world_event_active
     ADD COLUMN IF NOT EXISTS current_phase INT DEFAULT 1,
     ADD COLUMN IF NOT EXISTS phase_pattern TEXT DEFAULT 'normal',
     ADD COLUMN IF NOT EXISTS phase_changed_at TIMESTAMPTZ DEFAULT NOW();
   ```
   (코드 `getActiveEvent` 가 이 컬럼들 SELECT 함 — 미적용 시 cron 차단)

2. **정수 아이템 3종 INSERT** (idempotent — 이름 lookup):
   ```sql
   INSERT INTO items (name, type, grade, stack_size, sell_price, required_level, description)
   VALUES
     ('발라카스의 정수', 'etc', 'legendary', 99, 0, 1, '망토 강화 — 사용 시 7효과 중 1개 +1단계'),
     ('아트라스의 정수', 'etc', 'legendary', 99, 0, 1, '망토 강화 — 사용 시 7효과 중 1개 +2단계'),
     ('카르나스의 정수', 'etc', 'legendary', 99, 0, 1, '망토 강화 — 사용 시 7효과 중 1개 +3단계')
   ON CONFLICT DO NOTHING;
   ```

3. **보스 3종 INSERT** (idempotent — 이름 lookup):
   ```sql
   INSERT INTO world_event_bosses (id, name, max_hp, level, time_limit_sec, min_level, reward_table)
   VALUES
     (1, '태고의 용왕 발라카스',   1000000000000, 80, 1800, 30, '<reward_json>'::jsonb),
     (2, '천공의 거인 아트라스',   1000000000000, 90, 1800, 60, '<reward_json>'::jsonb),
     (3, '심연의 군주 카르나스',  1000000000000, 100, 1800, 80, '<reward_json>'::jsonb)
   ON CONFLICT (id) DO UPDATE SET
     name = EXCLUDED.name, max_hp = EXCLUDED.max_hp, level = EXCLUDED.level,
     time_limit_sec = EXCLUDED.time_limit_sec, min_level = EXCLUDED.min_level,
     reward_table = EXCLUDED.reward_table;
   ```

4. **schedule INSERT** — schedule 테이블 자체는 동일 (hour_utc, boss_id, enabled).
   요일별 분기는 코드에서 처리. schedule 에는 UTC 03:00 / 11:00 각각 boss_id=1,2,3 모두 등록 → 코드가 요일×시간 매트릭스로 1보스 선택.

   ```sql
   INSERT INTO world_event_schedule (hour_utc, boss_id, enabled) VALUES
     (3, 1, TRUE), (3, 2, TRUE), (3, 3, TRUE),
     (11, 1, TRUE), (11, 2, TRUE), (11, 3, TRUE)
   ON CONFLICT DO NOTHING;
   ```

## 코드 변경

### `server/src/game/worldEvent.ts`

#### `checkAndSpawnWorldEvent` — 요일 매트릭스로 보스 1종 선정
```ts
// 일단위 순환 매트릭스
// KST [day][hourSlot] = bossId
const ROTATION: number[][] = [
  // 일 월 화 수 목 금 토
  [1, 1, 2, 3, 1, 2, 3], // KST 12:00 (UTC 03:00)
  [2, 2, 3, 1, 2, 3, 1], // KST 20:00 (UTC 11:00)
];
function pickBossForSlot(kstDay: number, hourUtc: number): number | null {
  const hourSlot = hourUtc === 3 ? 0 : hourUtc === 11 ? 1 : -1;
  if (hourSlot < 0) return null;
  return ROTATION[hourSlot][kstDay] ?? null;
}
```

기존 `checkAndSpawnWorldEvent` 의 candidate 선정 로직 교체:
- `pickBossForSlot(kstDay, hour)` 결과를 `chosenBossId` 로
- 1시간 내 active 가드 그대로 유지

#### `finishEvent('expired')` — 정수 분배 추가
```ts
async function finishEvent(eventId: number, status: 'defeated' | 'expired', io?: Server) {
  // ... 기존 reward_table 분배 ...
  if (status === 'expired') {
    // 정수 분배 (라인 A + B)
    const bossR = await query<{ name: string; boss_id: number }>(
      `SELECT b.name, e.boss_id AS boss_id FROM world_event_active e JOIN world_event_bosses b ON b.id = e.boss_id WHERE e.id = $1`, [eventId]
    );
    if (bossR.rowCount) {
      const bossId = bossR.rows[0].boss_id;
      const essenceName = ESSENCE_NAME_BY_BOSS[bossId];
      if (essenceName) await distributeEssence(eventId, essenceName, bossR.rows[0].name);
    }
  }
  // ... 기존 status update + socket emit ...
}

const ESSENCE_NAME_BY_BOSS: Record<number, string> = {
  1: '발라카스의 정수',
  2: '아트라스의 정수',
  3: '카르나스의 정수',
};

async function distributeEssence(eventId: number, essenceName: string, bossName: string) {
  const essR = await query<{ id: number }>(`SELECT id FROM items WHERE name = $1 LIMIT 1`, [essenceName]);
  if (!essR.rowCount) return;
  const essenceItemId = essR.rows[0].id;
  const participants = await query<{ character_id: number; total_damage: number; rank: string }>(
    `SELECT character_id, total_damage,
            ROW_NUMBER() OVER (ORDER BY total_damage DESC)::text AS rank
       FROM world_event_participants WHERE event_id = $1`, [eventId]
  );
  for (const p of participants.rows) {
    let gained = 0;
    if (Math.random() < 0.25) gained++;
    const rank = Number(p.rank);
    let bChance = 0;
    if (rank <= 20) bChance = 1.0;
    else if (rank <= 40) bChance = 0.75;
    else if (rank <= 100) bChance = 0.5;
    if (bChance > 0 && Math.random() < bChance) gained++;
    if (gained > 0) {
      try {
        const { overflow } = await addItemToInventory(p.character_id, essenceItemId, gained);
        if (overflow > 0) await deliverToMailbox(p.character_id, `${bossName} 정수`, `랭크 ${rank}위 보상`, essenceItemId, overflow);
      } catch (e) { console.error('[raid] essence give fail', p.character_id, e); }
    }
  }
}
```

### `server/src/game/worldEvent.ts` - `attackBoss` 가드 완화
- 보스 HP 무한 → defeated 안 발생, but `current_hp <= 0` 체크는 그대로 유지 (방어적).
- player.level >= min_level 가드 그대로.

### 미적용 컬럼 처리
- `getActiveEvent` 의 `e.current_phase, phase_pattern, phase_changed_at` SELECT — 마이그 적용 후 정상 동작.
- 만약 phase 로직 안 쓰면 컬럼 SELECT 만 유지하고 application 측에서 무시.

## 광폭화 시스템

| 시간 경과 | 광폭화 단계 | 데미지 멀티 |
|---|---|---|
| 0 ~ 30초 | 0단계 | ×1 (기본 10%) |
| 30 ~ 60초 | 1단계 | ×2 (20%) |
| 60 ~ 90초 | 2단계 | ×4 (40%) |
| 90 ~ 120초 | 3단계 | ×8 (80%) |
| 120 ~ 150초 | 4단계 | ×16 (160% — 1방 사망) |
| n분 후 | floor(t/30) 단계 | ×2^floor(t/30) (무한) |

- 9시간 = 32400초 → 1080단계 → 데미지 거의 무한 — 결국 모든 참여자 사망
- 디자인 의도: 시간이 갈수록 빠르게 회전, 누가 더 오래·많이 누적 dmg 만드는지 경쟁
- 광폭화는 보스 spawn 시점 기준 (`world_event_active.started_at`) 부터 계산
- 보스 행동 시 `Math.floor((now - started_at) / 30000)` 으로 단계 계산

## 데미지 공식

```
공격 데미지 = floor(target.max_hp × 0.10 × 2^floor(elapsed_sec / 30))
```

- 광폭화 단계 무관하게 데미지 = max_hp × 10%×멀티
- 방어력/회피 등 일반 감산 적용? — **미적용 (고정 비례)** — 길드보스 회피 적용 여부 확인 후 정렬
- 1회 피격 = floor 0단계 시 max_hp 10% 손실
- 광폭 4단계 (120s) 부터는 1방에 풀피 깎임

## 입장 제한 / 사망 쿨다운

- **일일 입장 최대 10회/캐릭** — `world_event_participants.attack_count` 가 10 이상이면 거부
- **사망 시 5분 쿨다운** — 부활 후 5분 후 재참여 (DEATH_COOLDOWN_MS = 300_000)
- 일반 행동 쿨다운 10초 유지 (ATTACK_COOLDOWN_MS)

## 보스 스킬 — 길드보스 시스템 이식

### Step 1 (이번 적용): 길드보스 컬럼 메커닉 가져오기

`world_event_bosses` 에 다음 컬럼 추가 (마이그):
- `element_immune` TEXT — 면역 원소 (해당 원소 데미지 0)
- `element_weak` TEXT — 약점 원소
- `weak_amp_pct` INT — 약점 데미지 가산 (예: +30)
- `dot_immune` BOOLEAN — 도트 면역 (raid-v2 결정: 도트는 차단 안 함 — 컬럼만 추가, 발라카스 false)
- `hp_recover_pct` INT — HP 회복 (HP 무한이라 의미 없음, 0으로 고정)
- `hp_recover_interval_sec` INT — 회복 주기 (위와 동일)
- `random_weakness` BOOLEAN — 매 spawn 랜덤 약점 원소
- `alternating_immune` BOOLEAN — 30초 단위 ATK/MATK 교대 면역
- `signature_skill` TEXT — 시그니처 스킬 키 (예: 'fire_breath')

### 발라카스 default 값 (2026-05-17 사용자 결정 반영 — ATK/MATK·도트 면역 취소)
| 컬럼 | 값 | 이유 |
|---|---|---|
| element_immune | `'fire'` | 용왕 — 화염 면역 |
| element_weak | `'frost'` | 얼음에 취약 |
| weak_amp_pct | 30 | 얼음 스킬 +30% |
| dot_immune | **false** | 도트 정상 적용 (취소) |
| hp_recover_pct | 0 | HP 무한 (의미 없음) |
| random_weakness | false | |
| alternating_immune | **false** | ATK/MATK 교대 면역 취소 |
| signature_skill | `'fire_breath'` | 화염 브레스 광역 (능동 공격) |

메커니즘 코드(`alternating_immune` / `dot_immune` 분기) 는 향후 다른 보스용으로 보존.

### Step 2 (적용): 발라카스 시그니처 스킬 풀

attackBoss 시뮬(10초/100틱) 안의 보스 행동 시점에 가중 랜덤으로 1개 패턴 발동.
모든 데미지는 광폭 멀티 (`enrageMulNow`) 곱이 추가로 적용 — 시간 갈수록 자연 증폭.

| # | 이름 | 가중 | 효과 | 회피 |
|---|---|---|---|---|
| 1 | 기본 공격 | 60% | max_hp × 10% × enrage | O |
| 2 | 화염 브레스 (`fire_breath`) | 15% | max_hp × 30% × enrage | **X** (회피 무시) |
| 3 | 꼬리치기 (`tail_swipe`) | 10% | max_hp × 50% × enrage | O |
| 4 | 포효 (`roar`) | 10% | max_hp × 10% × enrage + 다음 본인 회피 -50% 1턴 | O |
| 5 | 융화 (`inferno`) | 5% | max_hp × 100% × enrage (사실상 1방 사망) | **X** (회피 무시) |

### 가중 발동 알고리즘
```ts
function pickPattern(): Pattern {
  const r = Math.random() * 100;
  if (r < 60) return 'basic';
  if (r < 75) return 'fire_breath';
  if (r < 85) return 'tail_swipe';
  if (r < 95) return 'roar';
  return 'inferno';
}
```

### 콤보 로그
- 모든 패턴: combatLog 에 `[발라카스 패턴이름] N피해` 표시
- enrage 단계 0인 시점에는 fire_breath/inferno 도 견딜 만함, 시간 갈수록 위협 증가

### 비목표 (이번 단계 외)
- 광역 효과 — Step 3에서 다룸
- 도트 부여 (보스 → 플레이어) — Step 3
- 보스 스킬 외부 알림 (월드 채널) — Step 3
- skills.element 컬럼 → 원소 면역/약점 정밀 매칭 — 별도 spec

## Step 3 — 길드보스 실시간 전투 세션 이식 (이번 단계)

### 배경
- Step 2 까지는 `attackBoss` 10초 시뮬 — 캐릭이 버튼 한 번 → 10초 후 결과 반환. 사용자 의도("길드보스처럼 똑같이 구현")와 불일치.
- 길드보스는 `startCombatSession` 으로 WebSocket 실시간 전투 (`combat/engine.ts` 의 `GUILD_BOSS_FIELD_ID = 999`).
- 레이드도 동일 구조 — 단, 보스 인스턴스는 캐릭별이 아니라 **공유** (모든 참여자가 같은 보스에 누적 dmg).

### 디자인
1. **가상 필드 RAID_FIELD_ID = 998** — 길드보스 999 와 분리
2. `routes/worldEvent.ts` 에 `/enter/:characterId` 추가 — startCombatSession 호출
3. `combat/engine.ts` 에 RAID 분기:
   - `raidEventId: number | null` 필드 ActiveSession 에 추가
   - 보스 행동: 광폭 단계 + 5종 시그니처 패턴 (Step 2 PATTERN_INFO 통째 이식)
   - 보스 HP 무한 → 사망/처치 안 됨, 캐릭 사망 시만 세션 종료
   - 캐릭이 보스에 데미지 입힐 때 → `world_event_participants.total_damage` 동시 update
4. 캐릭 사망 시:
   - `world_event_participants.last_attack_at` 업데이트 (5분 쿨다운 계산)
   - 세션 종료, HP 1 로 retreat
5. 어드민 가드 — 입장 시 is_admin 체크 (이미 attackBoss 에 적용된 가드를 enter 로 이동)

### 데이터 흐름
```
[클라] POST /api/world-event/enter/:charId
      ↓
[서버] 가드 체크 (admin, attack_count<10, cooldown 종료)
      ↓
[서버] startCombatSession(charId, RAID_FIELD_ID, { raidEventId, raidBoss })
      ↓
[engine] 실시간 ticker — 매 50ms 게이지 + 보스 행동 + 캐릭 자동/수동 스킬
      ↓
[engine] 데미지 입힐 때: UPDATE world_event_participants SET total_damage += dmg
      ↓
[engine] 캐릭 사망 → markRaidSessionEnded(charId, runId)
      ↓
[클라] WebSocket combat-state 수신, 5분 쿨다운 시작
```

### 클라 변경
- `WorldEventScreen` → 폐기 또는 entry-only (입장 버튼)
- 진입 후 `CombatScreen` 활용 (재사용) — 기존 길드보스/필드 전투 UI 와 동일
- 입장 잠금/쿨다운/입장 횟수 표시는 entry 화면에서

### 비목표 (Step 3 에서도 제외)
- 광역 효과 (다른 참여자에 동시 영향) — Step 4
- 보스 페이즈 (광폭 단계 외) — Step 4
- 보스→플레이어 도트 — Step 4

### 리스크
| 리스크 | 완화 |
|---|---|
| engine.ts 에 raid 분기 추가 — 길드보스/필드 전투 회귀 | startCombatSession 인자 명시적 분기 (raidOpts 옵션) |
| dmg 누적 시 매 hit DB UPDATE = 부하 | 50ms 누적 후 1회 flush, 또는 actionCount 기반 throttle |
| 어드민 가드 attackBoss 에서 enter 로 이동 | attackBoss 자체 폐기 → 가드 자동 보존 |
| 클라 UI — WorldEventScreen 폐기 시 기존 사용자 혼란 | entry-only 화면으로 단순화, 입장 버튼만 |

## 보스 면역 — 체력비례/CC

### HP% 비례 데미지 차단
`attackBoss()` 내 스킬·도트 처리 시:
- `effect_type` 가 `hp_percent` / `boss_hp_percent` 류 — 0 데미지 처리 (보스에는 무효)
- damage 계산식이 `boss.max_hp * pct` 또는 `boss.current_hp * pct` 인 항목 — 0 데미지
- 일반 ATK/MATK 기반 데미지는 정상 적용

### CC기 차단
보스에게 부착하려는 상태이상 무시 (stun, slow, silence, fear, taunt, freeze 등):
- `calcStatusEffectsFromSkill` 결과 중 CC 류는 `bossEffects` 에 push 안 함
- 도트(poison/bleed/burn)는 정상 적용 — CC 가 아닌 데미지 라인

## 비목표
- 보스 페이즈 메커닉 (HP%별 패턴) — 무한 HP 라 의미 없음. 컬럼만 존재.
- 보스 BGM/스킨/이펙트 변경
- 정수 거래소 가격 가이드
- 페이즈 시그니처 기술
- **보스의 능동 공격/스킬** — 다음 spec 으로 분리

## 리스크
| 리스크 | 완화 |
|---|---|
| 무한 HP → 데미지 누적 끝없이 (오버플로우?) | total_damage BIGINT 가정. 만료 30분에 모든 유저 합 10^9 이내 — 안전 |
| 라인 A/B 만료 시 모든 참여자 굴림 = N×2 randoms | N < 수천이라 cost 무시 |
| 인벤 가득 + 우편함 가득 | deliverToMailbox 가 폴백 처리 (기존 케이스 동일) |
| 보스 1~3 schedule 충돌 (다른 보스 active 중) | 1시간 내 active 가드 유지 |

## 배포
- 로컬 tsc 통과 → 커밋 → main push → Railway 자동
- 패치노트는 사용자 확인 후 ([[feedback_patch_notes]])
