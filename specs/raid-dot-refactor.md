# 레이드 보스 DOT/스킬 효과 리팩터 스펙

## 배경
- 현재 레이드 보스(`server/src/game/worldEvent.ts`의 `attackBoss()`)는 10초 고정 시뮬레이션으로 돌아감.
- 스킬의 `effect_type`(poison/bleed/burn 등)을 **완전히 무시** → 도트 스킬이 보스 상대로 0 데미지.
- 일반 전투(`combat/engine.ts`)는 `statusEffects` 추적 + `processDots()`로 정상 작동.
- 두 시스템이 전혀 다른 구조라 로직이 중복/분기됨.

## 목표
1. 레이드에서 DOT 스킬이 **정상 데미지**로 보스 HP에 반영되도록 수정.
2. 데미지 계산/상태이상 로직을 **공용 헬퍼**(`combat/shared.ts`)로 추출해 양쪽이 공유. 향후 신규 이펙트 추가 시 한 곳만 수정.
3. 일반 필드 전투 동작은 **일체 변경 없음** (behavior parity) — 리팩터만, 기능 변경 금지.

## 비목표 (이번 범위 아님)
- 스턴/침묵/반사/부활/속도 디버프 등 DOT 외 상태이상 레이드 이식 (향후 확장)
- 보스 → 플레이어 도트 공격 패턴 신설
- 세션 간 도트 유지 (이번 `attackBoss` 10초 내에서만 유지, 다음 호출 시 초기화)
- 레이드 보스 전투를 `ActiveSession`으로 통합 (옵션 B — 위험 대비 이득 적음)

## 설계 결정 (기본값)

| 항목 | 결정 |
|---|---|
| 리팩터 깊이 | (A) 공용 헬퍼 추출 |
| DOT tick 단위 | **action 단위** (플레이어 행동 시마다 tick) — 일반 전투와 수치 일치 |
| 지속시간 | 스킬 DB `duration` 그대로 사용, 10초 시뮬 내에서만 유효 |
| 보스→플레이어 DOT | 없음 (단방향, 플레이어→보스만) |
| 대상 이펙트 타입 | `poison`, `poison_burst`, `bleed_on_hit`, `burn`, `dot` (필드 전투 `processDots`가 처리하는 것과 동일) |

## 추출 대상 함수

`server/src/combat/shared.ts` 신규 파일:

### 1) `calcSkillDamage(ctx, skill)` — 순수 함수
입력: 공격자 스탯(atk/matk/cri/cri dmg bonus), 방어자 방어력(def/mdef/pierce 적용 후), 스킬(`damage_mult`, `flat_damage`, `kind`), RNG seed
출력: `{ damage: number, isCrit: boolean }`

엔진 파일 `executeSkill` 내부의 현재 계산식과 **수치 동일**해야 함 — 단순 발췌.

### 2) `calcStatusEffectsFromSkill(skill, attackerLevel)` — 순수 함수
입력: 스킬 row (effect_type, effect_value, duration 등)
출력: `StatusEffect[]` (도트 엔트리 리스트, 없으면 빈 배열)

현재 `combat/engine.ts`의 스킬 실행 중 도트 부여 로직을 그대로 이식.

### 3) `tickDots(effects, target, attackerStatsSnapshot)` — 순수 함수
입력: 대상에게 걸린 도트 배열, 대상 정보(hp/maxHp/def), 도트 시전자 스탯 스냅샷
출력: `{ totalDamage: number, remaining: StatusEffect[], logs: string[] }`

현재 `processDots()`의 계산식을 그대로 이식. `remaining`은 남은 턴 1씩 감소시킨 결과.

## 변경 파일

### 신규
- `server/src/combat/shared.ts` — 위 3개 헬퍼 + 공용 타입 export

### 수정
- `server/src/combat/engine.ts` — `executeSkill`/`processDots` 내부 계산을 `shared.ts` 호출로 치환. **외부 동작 불변**.
- `server/src/game/worldEvent.ts` — `attackBoss()` 10초 루프에:
  - 보스에게 걸린 `bossEffects: StatusEffect[]` 배열 신설
  - 스킬 발동 시 `calcStatusEffectsFromSkill()` 호출 → `bossEffects`에 push
  - 플레이어 행동 직후 `tickDots(bossEffects, ...)` 호출 → 데미지를 `totalDmgDealt`에 누적
  - 로그에도 도트 데미지 기록 (상위 20개 제한 유지)

## 리스크

| 리스크 | 대응 |
|---|---|
| 필드 전투 데미지 수치 변동 (리팩터 실수) | 추출 전후 `engine.ts` 동작 **완전 동일** — 주석으로 "변경 금지" 명시. 타입 체크 + 수동 테스트. |
| 레이드 데미지 과다 (도트 추가로 밸런스 깨짐) | 현재 도트 수치가 필드 전투에서 이미 검증됨. 필요 시 `worldEvent.ts` 내에서 `dotScale` 배수 도입 가능 (기본 1.0). |
| DB 없이 로컬 테스트 어려움 | 유저가 스테이징(또는 테스트 계정)에서 독/출혈 스킬 장착 후 레이드 한 번 때려 확인. |

## 검증 계획
1. 타입 체크 통과 (`tsc --noEmit`)
2. 일반 필드 전투에서 기존 스킬/도트 동작 수동 테스트 — 데미지 수치가 이전과 동일해야 함
3. 레이드 보스에 도트 스킬(예: 독주입) 장착 후 공격 → 로그에 `[독] 데미지` 항목이 나오고 `damageDealt`에 반영되는지 확인
4. 기여도 랭킹이 정상 집계되는지 확인

## 배포
- 로컬에서 타입 체크 + 핵심 수동 검증 → 커밋 → main push → Railway 자동 배포
- 패치노트 작성 여부는 배포 직전 사용자 확인
