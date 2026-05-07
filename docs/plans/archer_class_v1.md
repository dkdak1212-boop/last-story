# 궁수 (Archer) — 신규 직업 v1 spec

작성: 2026-05-07 / 사용자 인터뷰 답변 10/10 반영 / **어드민 전용 출시**

---

## 1. 정체성

> "거리를 미세하게 벌리며 정밀 다타로 보스 1마리를 녹이는 카이팅 저격수"

- **Stat 베이스**: DEX 주력 → DEX×1.0 = ATK (cri 자동 보너스)
- **시그니처**: 명중/치명 강화 — 적이 회피·무빙 상태일 때 보너스
- **거리 메커닉 (가상)**: 적 처치 수 비례 `archerRange` 스택 (0~20)
- **컨텐츠 적합**: 단일 보스 폭딜 (마법사·전사 보강)
- **PVP**: 카이팅형 — high SPD / low HP / high dmg

---

## 2. 어드민 전용 게이팅 (1차 핵심)

### 2.1 데이터 차원
- 캐릭 생성 화면 — 비-어드민에겐 "궁수" 옵션 미노출
- 서버 검증 — `POST /characters/create` 에서 class=archer 인 경우 `req.userId` 의 `is_admin` 검증, false 면 400

### 2.2 표시 차원
- 클라 클래스 목록 API `/characters/options` — `archer` 정의 포함하되 `adminOnly: true` 플래그
- 클라 UI — `adminOnly === true && !user.isAdmin` 인 옵션은 hide

### 2.3 효과 차원
- 채팅·랭킹·길드 등에 archer 캐릭 표시되는 건 OK (다른 어드민이 사용 시)
- 일반 유저 프리뷰 시 클래스 라벨만 노출

---

## 3. Stat / 데미지 공식

### 3.1 베이스 ATK
```
playerStats.atk = base.dex × 1.0 + level × LEVELUP_ATK_GAIN + eq.atk
```
- 도적/전사: STR 베이스 → 동일 수식, stat key 만 다름
- 마법사/성직자: INT×1.5

### 3.2 cri 자동 보너스
- 베이스 cri = 25 (높은 시작) — 마법사 5, 도적 15
- DEX → cri 추가: `cri += dex × 0.05` (정수 반올림)
- L100 기준 DEX 200 → cri +10 추가

### 3.3 archerRange 스택 시스템
- 처치마다 `archerRange += 1`, 사망 시 0, max 20
- 모든 데미지 ×`(1 + archerRange × 1%)` (max +20%)
- 클라 표시: 화면 상단 "🎯 사거리 N/20"

### 3.4 명중/치명 강화 (시그니처)
- 적이 dodge_pct > 0 인 경우 (회피 보유 적): 데미지 +25%
- 적에게 `accuracy_debuff` 또는 `confuse` 상태이상 시: 데미지 +20%
- crit_chance += 5 (베이스, archerRange 와 별개)

---

## 4. 스킬 21종 (L1~L100)

| Lv | 이름 | 종류 | atk_mult | hits | cd | 효과 |
|---|---|---|---|---|---|---|
| 1 | 정조준 | damage | 2.5 | 1 | 0 | 기본기, 첫 공격 시 +30% (한 번/적) |
| 5 | 다중 사격 | damage | 1.6 | 3 | 3 | 3타, multi_hit |
| 10 | 백스텝 | buff | 0 | 0 | 5 | 자기 SPD +30% 3행동 + 게이지 +500 |
| 15 | 약점 표시 | debuff | 1.4 | 1 | 4 | mark — 5행동, 표시 적에게 데미지 +20% |
| 20 | 분산 사격 | damage | 1.2 | 4 | 5 | 4타 광역 (3마리까지) |
| 25 | 폭발 화살 | damage | 3.5 | 1 | 6 | dot 3행동 (atk×1.0/턴) |
| 30 | 회피 사격 | damage | 4.5 | 1 | 6 | 자기 dodge +30% 1행동 |
| 35 | 정밀 저격 | damage | 5.0 | 1 | 5 | crit_bonus +30% |
| 40 | 화살 비 | damage | 1.4 | 6 | 7 | 6타, 광역 |
| 45 | 추적 표식 | debuff | 1.8 | 1 | 5 | mark 강화 — 6행동, +30% |
| 50 | 관통 사격 | damage | 6.5 | 1 | 7 | 적 방어 50% 무시 |
| 55 | 침묵 화살 | debuff | 2.5 | 1 | 6 | 적 스킬 봉인 2행동 (스킬 cd 즉시 +5) |
| 60 | 폭격 모드 | buff | 0 | 0 | 8 | 5행동 atk +50% (자유행동) |
| 65 | 그림자 사격 | damage | 7.5 | 1 | 6 | dodge_chance +20% 다음 적 공격 |
| 70 | 화살 폭풍 | damage | 1.6 | 8 | 7 | 8타, 광역 |
| 75 | 마비 화살 | debuff | 3.0 | 1 | 8 | stun 1행동 + 데미지 |
| 80 | 절대 정밀 | buff | 0 | 0 | 9 | 5행동 crit_chance +50% |
| 85 | 사신의 화살 | damage | 9.0 | 1 | 6 | hp_pct_damage 12% |
| 90 | 천공 강타 | damage | 1.7 | 10 | 8 | 10타, 광역 |
| 95 | 일격필살 | damage | 18.0 | 1 | 8 | crit_bonus +50% / 단일 |
| 100 | 운명의 화살 | damage | 35.0 | 1 | 9 | hp_pct_damage 30% (보스 제외) + dot 5행동 |

**수식 검증**: 도적 평균 atk_mult 4.05 / mage 7.5 / 궁수 평균 ~5.5 — 사이 위치, 단일 보스 폭딜 컨셉.

---

## 5. 직업 노드 트리 (~95개)

### 5.1 코어 트리 구성 (도적 north_rogue 와 유사 layout)

| 영역 | 노드 수 | 주제 |
|---|---|---|
| Tsmall (작은 노드) | 27 | DEX/cri/spd 분산 1pt 각 |
| Tmedium (중간) | 35 | atk_pct, crit_dmg, multi_hit_amp, mark_amp 등 |
| Tlarge (큰) | 18 | 정확도/저격 강화, 콤보 |
| Thuge (시너지 keystone) | 8 | "끝없는 사거리", "관통의 화신", "절대정밀" 등 |
| 분기 (branch) | 7 | 카이팅·저격·다타 빌드 분기 |

### 5.2 신규 패시브 키 (archer 전용)
- `archer_range_per_kill` — 처치당 추가 스택 +N (기본 1)
- `archer_range_max` — max stack +N (기본 20)
- `archer_range_amp` — 스택당 데미지 추가 % (기본 1)
- `marked_damage_amp` — mark 적에 추가 +%
- `mark_extend` — mark 지속 +N행동
- `kite_speed` — 자기 SPD +N (cooldown 시 추가)
- `precise_chain` — 연속 처치당 cri +N (재사용)
- `arrow_pierce` — 다타 시 방어 +N% 무시

기존 키 재사용: `armor_pierce`, `crit_damage`, `dot_amp`, `multi_hit_amp_pct`, `lifesteal_pct`

### 5.3 키스톤 (Thuge) 8종
1. **끝없는 사거리** — archer_range_max +20 (max 40)
2. **표적의 별** — mark 자동 발동 (모든 공격 30% 확률 mark)
3. **관통의 화신** — 모든 공격 방어 30% 무시
4. **절대 정밀** — cri 30% 추가 / crit_dmg +50%
5. **저격수의 호흡** — 매 5번째 공격 ×3
6. **연쇄 살인** — 처치당 다음 스킬 cd −1 (max 5)
7. **그림자 본능** — HP 50% 이하 시 dodge +30% / atk +30%
8. **화살의 거장** — 모든 다타 스킬 +1 hit

---

## 6. 작업 항목 (5일 분량)

### Day 1 — 핵심 stat·class 정의
- DB: `classes.ts` archer 추가 (or items table archer 키)
- formulas.ts: DEX 주력 ATK 계산 분기
- 어드민 게이팅: `/characters/create` archer admin 체크
- 클라 클래스 옵션 API + UI hide

### Day 2 — 21 스킬 + DB 등록
- 마이그: skills 테이블에 archer 21개 INSERT
- engine.ts: 신규 effect_type 처리 (mark, archer_range, precise 등)
- 클라 스킬 트리 표시

### Day 3 — 95 노드 트리
- 마이그: node_definitions 에 archer 95개 INSERT
- 신규 패시브 키 effects 처리 (combat/engine.ts)
- 클라 노드 트리 화면 archer 분기

### Day 4 — archerRange 스택 시스템
- ActiveSession 에 `archerRange?: number`, `archerRangeMax?: number`
- onKill: 스택 +1 / 사망: 0
- 데미지 boost: applyDamagePrefixes 에 archer_range_amp 적용
- 클라 HUD: 사거리 스택 표시

### Day 5 — 시그니처 (mark + 명중/치명) + QA
- mark 효과 처리 (status_effects 'mark' kind)
- dodge·confuse 적에 추가 데미지
- 통합 테스트 (어드민 캐릭 생성 → 솔로 균열 → DPS 확인)

---

## 7. 마이그레이션 / DB 변경

```sql
-- 직업 마이그 X (classes.ts 코드 정의)
-- skills 테이블 INSERT 21개 (class_name='archer')
-- node_definitions INSERT 95개 (class_exclusive='archer')
-- monsters/items 변경 X
-- characters 테이블에 archer_range 등 컬럼 X (in-memory 세션 상태로 관리)
```

---

## 8. 어드민 게이팅 구현 세부

### 8.1 서버
- `/characters/create` — request body 의 class_name 이 archer 면 `await isAdmin(req.userId!)` 체크, false 면 403
- `/characters/options` — 모든 클래스 정보 반환하되 archer 에 `adminOnly: true` 추가
- 어드민이 만든 archer 캐릭이 게임 내에서 동작하는 건 OK

### 8.2 클라
- `CharSelectScreen` (캐릭 선택) — archer 캐릭 보임 (어드민이라면)
- 신규 캐릭 생성 모달 — `if (cls.adminOnly && !user.isAdmin) hide`
- 일반 유저: archer 옵션 자체가 안 보임

### 8.3 안전망
- 누군가 API 직접 호출해 archer 캐릭 생성 시도 → 서버 검증 거부

---

## 9. 리스크 / 트레이드오프

| 리스크 | 영향 | 완화 |
|---|---|---|
| 5일 분량 → 다른 작업과 병행 시 일정 압박 | 중 | 매일 commit 단위 분할, 끝까지 끝내려 X |
| 신규 effect_type 다수 (mark, archer_range) | 중 | 기존 dot/poison 패턴 모방, 안정적 도입 |
| 95 노드 만들기 작업량 | 큼 | 도적 north_rogue 트리 복사 + 재배치 |
| 어드민 검증 누락 시 일반 유저 archer 생성 | 작 | 서버 가드 + 클라 hide 이중 |
| DPS 너프/버프 필요 (런칭 후) | 중 | atk_mult 표를 단순화해 패치 한 줄로 조정 가능 |

---

## 10. 출시 후 확장 (out of v1 scope)

- 클래스 마스터리 archer rank
- 각성 archer (awakened_class='archer_master' 등)
- archer 전용 유니크 무기·방어구
- 일반 유저 공개 — 베타 → 정식

---

## 승인 체크리스트

- [ ] Stat 공식 (DEX 주력 + cri 추가 0.05)
- [ ] archerRange 스택 (max 20, 처치당 +1, 데미지 +1%/스택)
- [ ] 21 스킬 atk_mult 분포 적절성
- [ ] 95 노드 분포 (코어 / 분기 / 키스톤)
- [ ] 어드민 게이팅 (서버 + 클라 이중)
- [ ] 5일 작업 일정
