# PvP 리얼타임 전투 시스템 — 설계 스펙

> 작성일: 2026-04-18
> 참조: 기존 server/src/pvp/simulator.ts, routes/pvp.ts, schema pvp_stats/pvp_battles/pvp_cooldowns

## 1. 목표

- PvE 전투화면처럼 **실시간 게이지 기반**의 PvP 구현
- 방어자는 **독립된 방어 세팅**(장비 + 스킬 슬롯 + 스탯 스냅샷)을 저장
- 공격자 입장: 기존 PvE 전투 UX (수동/자동 토글 가능)
- 방어자는 AI 로 대체 — 슬롯 순서 + 상황 판단 가미

## 2. 방어 세팅 (Pre-combat 저장)

### 2.1 저장 방식 — 스냅샷
- 방어자가 PvP 화면 "방어 설정" 탭에서 **"현재 상태로 방어 세팅 저장"** 버튼 클릭
- 저장 시점의 **effective stats / 장비 / 스킬 / 노드 패시브 / 접두사 효과** 를 JSONB 로 복사
- 복사된 스냅샷은 이후 PvE 에서 자유롭게 장비 바꿔도 영향 없음 (완전 분리)
- 세팅은 언제든 재저장 가능 (덮어쓰기)

### 2.2 DB 스키마 — 신규 테이블
```sql
CREATE TABLE pvp_defense_loadouts (
  character_id INT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  effective_stats JSONB NOT NULL,     -- {atk, matk, def, mdef, maxHp, spd, cri, dodge, accuracy, ...}
  equip_prefixes JSONB NOT NULL,      -- {atk_pct:5, hp_regen:10, ...}
  passives JSONB NOT NULL,            -- {war_god:10, counter_incarnation:5, ...}
  skill_slots INT[] NOT NULL,         -- skill_id 배열 (사용 순서)
  skills JSONB NOT NULL,              -- 스킬 상세 스냅샷 [{id, damage_mult, kind, effect_type, ...}]
  equipment_summary JSONB NOT NULL,   -- 표시용 요약 [{slot, itemId, name, grade, enhanceLevel, prefixName, ...}]
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.3 저장 시 검증
- 장비 슬롯 최소 1개 (무기 장착 필수) — 아니면 방어력 의미 없음
- 스킬 슬롯 최소 1개
- 어느 것도 없으면 저장 거부 + 에러 메시지

### 2.4 방어 세팅 미설정 시
- PvP 목록에 "⚠️ 방어 세팅 미설정" 배지 표시
- **공격 버튼 비활성화** — 방어자 본인이 세팅해야 공격 당할 수 있음
- 기존 미설정 유저는 PvP 풀에서 자연스럽게 제외

## 3. 실시간 전투 엔진 (신규 `server/src/pvp/realtimeEngine.ts`)

### 3.1 아키텍처
- PvE engine.ts 와 **독립**. PvP 전용 세션 관리 + 틱 루프.
- 100ms setInterval, 양측 게이지 1000 MAX, speed 로 충전 (PvE와 동일 공식).
- WebSocket 채널: `pvp:{battleId}` — 양측 클라이언트에 스냅샷 push

### 3.2 PvP 세션 구조
```typescript
interface PvPSession {
  battleId: string;
  attackerId: number;
  defenderId: number;
  attacker: FighterState;  // 실제 스탯, 스킬, 패시브
  defender: FighterState;  // 스냅샷 로드
  turn: number;
  startedAt: number;
  attackerAuto: boolean;
  attackerWaitingInput: boolean;
  attackerWaitingSince: number;
  log: string[];
  ...
}
```

### 3.3 공격자 UX
- 기존 CombatScreen 과 동일하게 게이지 차오르면
  - 자동 모드: 슬롯 순서대로 자동 발동
  - 수동 모드: 3초 타임아웃, 스킬 버튼 클릭
- 공격자는 캐릭터 현재 HP/스탯/장비/스킬 그대로 사용 (PvE와 같은 상태)

### 3.4 방어 AI — "좀 똑똑한" 로직
기본은 슬롯 순서지만 상황 판단 로직 추가:
1. **치명 상황**: 내 HP ≤ 20% → heal / shield 계열 최우선
2. **상대 방어 빌드**: 상대가 shield active 면 shield_break 스킬 우선
3. **버프 누락**: stat_buff / atk_buff 계열 중 아직 활성화 안된 게 있으면 우선
4. **중복 회피**: 동일 스킬 직전 사용했고 다른 가용 스킬 있으면 로테이션
5. **위 조건 해당 없음**: 슬롯 순서대로 가용한 첫 스킬
- 모든 스킬이 쿨타임 → 기본 공격(스킬 없이) 발동

### 3.5 제한 / 종료 조건
- **타임아웃**: **3분 (180초)** — 게이지 기준 대략 50~80 턴 분량
- **승부 판정**:
  - 한쪽 HP ≤ 0 → 즉시 승부 결정
  - 3분 경과 → HP 퍼센트 높은 쪽 승. 동률(±1%p) → 무승부
  - 공격자 연결 끊김 / 화면 이탈 (WS close 30초 감지) → 공격자 패배
- **무승부 시**: ELO 변동 없음, 일일 공격 횟수는 소모 (일일 트롤 방지)

### 3.6 보상 / 기록
- 기존 pvp_stats.daily_attacks · pvp_cooldowns · elo · pvp_battles 로그 — **전부 유지**
- simulate 방식의 simulator.ts 는 **비활성** (legacy 는 코드 남겨두되 라우트만 새 엔진으로 교체)
- pvp_battles.log 에는 실시간 전투 로그 저장

## 4. 라우트 변경

### 4.1 기존
- `GET  /pvp/list` — 방어 가능한 상대 목록 (세팅 배지 추가)
- `POST /pvp/attack/:defenderId` — 기존: 시뮬 즉시 결과 반환
  - **신규**: battleId 발급 + PvP 세션 시작, 클라는 CombatScreen 재활용 전투화면 진입

### 4.2 신규
- `GET  /pvp/defense/:characterId` — 저장된 방어 세팅 + 메타 조회
- `POST /pvp/defense/:characterId/save` — 현재 상태로 스냅샷 저장
- `POST /pvp/defense/:characterId/clear` — 방어 세팅 삭제 (공격 불가화)
- `POST /pvp/:battleId/use-skill`  — 수동 스킬 발동 (공격자)
- `POST /pvp/:battleId/toggle-auto` — 자동/수동 모드 토글
- `POST /pvp/:battleId/forfeit` — 공격자 기권 (패배 처리)

## 5. 클라이언트

### 5.1 PvPScreen 탭 구성
- 기존: 상대 목록 / 내 기록
- 신규 탭: **"방어 설정"** — 현재 장비·스킬 미리보기 + "저장" / "삭제" 버튼
  - 저장된 세팅이 있으면: 요약 카드 표시 + "다시 저장" 버튼
  - 미저장: "현재 상태로 저장" CTA + 안내

### 5.2 전투 화면 — CombatScreen 재활용 / 확장
- PvE CombatScreen 을 PvP 모드로 재사용: `<CombatScreen mode="pvp" battleId=... />`
- PvP 전용 UI 추가:
  - 상대 닉네임 / 레벨 / 클래스 / 승패 표기
  - 남은 시간 카운트다운 (3분)
  - 기권 버튼
- WS 이벤트 채널만 `pvp:{battleId}` 로 교체

## 6. Phase 실행 순서

| Phase | 내용 | 위험도 |
|---|---|---|
| 1 | 방어 세팅 저장/조회 API + DB 테이블 + 기본 UI 탭 | 낮음 |
| 2 | 방어 세팅 설정 UI 완성 + PvP 목록에 세팅 배지 | 낮음 |
| 3 | PvP 실시간 엔진 (tick 루프, AI, WebSocket) | 큼 — 신규 엔진 |
| 4 | 클라 전투 화면 연결 (기존 CombatScreen 재사용) | 중간 |
| 5 | 기존 simulator 엔드포인트 교체 + simulator 비활성 | 중간 |

## 7. 마이그레이션 키
- `pvp_defense_loadouts_v1`: 신규 테이블 추가

## 8. 남은 쟁점 (본 구현 중 결정)

- 방어 AI 가 스킬 사용 시 **게이지 제어 효율** 노드/버프 적용은? → 스냅샷에 포함되어 있으면 그대로 반영
- 도적 독 전이 / 전사 분노 게이지 등 PvE 전용 보조 메커닉 → PvP 에서도 동작 (엔진이 대응)
- 소환사 소환수 → 방어자가 소환한 경우 복원? → MVP 에서는 **소환수 미복원** (공격 시점에 AI 가 소환 스킬 사용하면 새로 소환)
