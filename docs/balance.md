# 마지막이야기 — 전투 밸런싱 문서 v0.1

> 모든 수치는 초안. v0.1 테스트 후 조정 예정.

---

## 1. 스탯 시스템

| 스탯 | 약어 | 효과 |
|------|------|------|
| 힘 | STR | 물리 공격력: `atk = str × 1.0 + weapon.str` |
| 민첩 | DEX | 명중·회피: `accuracy = 80 + dex × 0.5`, `dodge = dex × 0.4` (%) |
| 지능 | INT | 마법 공격력 & 최대 MP: `matk = int × 1.2`, `max_mp += int × 4` |
| 체력 | VIT | 최대 HP: `max_hp += vit × 10` |
| 스피드 | SPD | 틱 간격: `tick_ms = 2000 / (spd / 100)` |
| 치명타 | CRI | 치명타 확률 (%). 치명타 시 데미지 1.5배 |

### 레벨업 스탯 증가 (자동 분배)

| 클래스 | STR | DEX | INT | VIT | SPD | CRI |
|--------|-----|-----|-----|-----|-----|-----|
| 전사 | +2 | +1 | +0 | +2 | +0.5 | +0.1 |
| 검사 | +2 | +1.5 | +0 | +1 | +1 | +0.2 |
| 궁수 | +1 | +2 | +0 | +1 | +1.5 | +0.3 |
| 도적 | +1 | +2 | +0 | +1 | +2 | +0.4 |
| 암살자 | +1.5 | +2 | +0 | +0.5 | +1.5 | +0.5 |
| 마법사 | +0 | +0.5 | +3 | +1 | +0.5 | +0.1 |
| 사제 | +0.5 | +0.5 | +2.5 | +1.5 | +0.5 | +0.1 |
| 드루이드 | +1 | +1 | +2 | +1.5 | +0.5 | +0.2 |

(소수값은 누적 후 반올림)

### 레벨업 HP/MP 증가

```
max_hp += 10 + vit_growth × 3
max_mp += 5  + int_growth × 2
```

### 레벨업 시 HP/MP 완전 회복.

---

## 2. 클래스 시작 스탯 (Lv.1)

| 클래스 | HP | MP | STR | DEX | INT | VIT | SPD | CRI | tick(ms) |
|--------|----|----|-----|-----|-----|-----|-----|-----|----------|
| 전사 | 160 | 40 | 14 | 8 | 4 | 16 | 90 | 5 | 2222 |
| 검사 | 130 | 50 | 13 | 11 | 5 | 12 | 110 | 8 | 1818 |
| 궁수 | 110 | 60 | 10 | 15 | 6 | 10 | 120 | 12 | 1666 |
| 도적 | 100 | 60 | 9 | 16 | 7 | 9 | 140 | 14 | 1428 |
| 암살자 | 95 | 55 | 12 | 14 | 6 | 8 | 135 | 18 | 1481 |
| 마법사 | 85 | 120 | 4 | 7 | 18 | 8 | 100 | 6 | 2000 |
| 사제 | 110 | 110 | 6 | 8 | 15 | 11 | 95 | 5 | 2105 |
| 드루이드 | 120 | 100 | 8 | 10 | 13 | 12 | 105 | 7 | 1904 |

---

## 3. 전투 틱 시스템

### 기본 공식

```
tick_interval_ms = 2000 / (speed / 100)
```

- SPD 100 → 2초 간격
- SPD 200 → 1초 간격
- SPD 50  → 4초 간격
- 최소 500ms, 최대 5000ms 클램프

### 전투 진행

1. 필드 진입 시 `combat_sessions` 행 생성
2. 서버가 `next_player_action_at`, `next_monster_action_at` 관리
3. 클라이언트는 1.5초 주기로 `/combat/tick` POST → 서버가 시간 경과분 일괄 처리
4. 처리 순서: **시간이 이른 쪽이 먼저 행동**, 동시면 SPD 높은 쪽 우선

### 데미지 공식

```
# 기본 공격 (스킬 미사용)
base_damage = attacker.atk - defender.def × 0.5
if attacker.type == 'mage/priest/druid':
    base_damage = attacker.matk - defender.mdef × 0.5
base_damage = max(1, base_damage)

# 치명타
if random() < attacker.cri / 100:
    damage = base_damage × 1.5

# 회피
if random() < defender.dodge / 100:
    damage = 0  (MISS)

# 스킬 사용 시
damage = base_damage × skill.damage_mult
```

### 방어력 계산 (v0.1 초안)

```
def = vit × 0.8 + equipment.def
mdef = int × 0.5 + equipment.mdef
```

---

## 4. 자동 행동 로직

### 우선순위 (매 틱 서버에서 판단)

1. **자동 포션** (설정값 기본)
   - HP < 40% → 작은/중급 체력 물약 사용
   - MP < 30% → 작은/중급 마나 물약 사용
2. **자동 스킬**
   - `auto_use = true` 스킬 중 쿨다운 완료된 것
   - 우선순위: `damage_mult` 내림차순 (강한 스킬 먼저)
   - MP 부족하면 스킵
3. **기본 공격**
   - 위 조건 모두 미충족 시 기본 공격

### 타겟팅

- HP 절대값이 가장 낮은 적 우선
- (v0.1은 필드당 1마리만 상대하므로 해당 없음)

---

## 5. 몬스터 밸런스

| 필드 | 레벨 | 몬스터 | HP | 보상(exp/gold) | 평균 처치시간 |
|------|------|--------|----|----|--------------|
| 초원 | 1 | 들쥐 | 40 | 12 / 5 | 6초 |
| 초원 | 2 | 고블린 | 70 | 20 / 10 | 8초 |
| 언덕길 | 3 | 늑대 | 110 | 30 / 14 | 10초 |
| 숲외곽 | 6 | 숲 거미 | 180 | 55 / 22 | 11초 |
| 깊은숲 | 8 | 오크 전사 | 280 | 85 / 38 | 14초 |
| 숲중심 | 12 | **보스: 숲의 왕** | 1400 | 400 / 180 | 60초 |

### 경험치 테이블

```
exp_to_next(level) = floor(50 × level × level^0.6)
```

| Lv | 다음까지 | 누적 |
|----|----|----|
| 1 → 2 | 50 | 50 |
| 2 → 3 | 151 | 201 |
| 3 → 4 | 281 | 482 |
| 5 → 6 | 624 | 1700 |
| 10 → 11 | 1994 | 9700 |
| 20 → 21 | 6060 | 55000 |

**오프라인 24h 기준 예상 레벨업:**
- Lv.3 캐릭터가 초원에서 자동전투 → 시간당 약 450 exp → 24h 10,800 exp → 약 Lv.5~6 도달

---

## 6. 오프라인 진행 통계 공식

```python
def calculate_offline_report(character, elapsed_seconds, field, is_premium):
    capped_seconds = min(elapsed_seconds, 24 * 3600)
    efficiency = 1.0 if is_premium else 0.9
    effective_seconds = capped_seconds * efficiency

    # 필드 내 평균 몬스터 처치 시간
    avg_kill = avg_of([m.avg_kill_time_sec for m in field.monsters])
    # 캐릭터 DPS 계수로 보정
    kill_speed_mult = character.atk / 30  # 레벨링 보정
    effective_kill_time = avg_kill / max(0.5, kill_speed_mult)

    kill_count = int(effective_seconds / effective_kill_time)
    avg_exp = avg_of([m.exp_reward for m in field.monsters])
    avg_gold = avg_of([m.gold_reward for m in field.monsters])

    exp_gained = kill_count * avg_exp
    gold_gained = kill_count * avg_gold

    # 드랍 계산 (각 몬스터 드랍테이블 평균)
    items = []
    for m in field.monsters:
        for drop in m.drop_table:
            expected = kill_count / len(field.monsters) * drop.chance
            qty = int(expected * ((drop.min + drop.max) / 2))
            if qty > 0: items.append({item_id: drop.itemId, qty})

    # 레벨업 시뮬레이션
    levels = simulate_level_ups(character.level, character.exp, exp_gained)

    return {
        minutesAccounted: capped_seconds / 60,
        efficiency,
        killCount: kill_count,
        expGained: exp_gained,
        goldGained: gold_gained,
        itemsDropped: items,
        levelsGained: levels,
        overflow: max(0, inventory_count + items_count - 50)  # 50슬롯 초과분
    }
```

### 오프라인 중 자동회피 조건

- 캐릭터 DPS × 2 < 몬스터 DPS → 위험 판정, 마을 귀환, 보상 누적 중단
- 위 경우 `location = 'village'`로 복귀하고 리포트는 해당 시점까지만

---

## 7. 강화 시스템 (v0.1 초안, v0.2+ 구현)

| 강화 단계 | 성공 확률 | 필요 재료(골드) | 실패 시 |
|----------|---------|----------------|--------|
| +1 ~ +3 | 100% | 50 × lv | - |
| +4 ~ +6 | 80% | 200 × lv | 등급 유지 |
| +7 ~ +9 | 50% | 500 × lv | 등급 유지 |
| +10 | 20% | 2000 × lv | 등급 유지 |

### 강화별 스탯 보너스
```
+n 스탯 = 기본 × (1 + n × 0.1)
```

---

## 8. 아이템 드랍 규칙

- 각 `drop_table` 항목은 몬스터 1마리 처치 시 독립 굴림
- 필드 등급이 높을수록 상위 등급 드랍률 증가 (v0.2 수치 조정)
- 전설 장비는 보스만 드랍 (일반 사냥 드랍 없음)

---

## 9. 경제 밸런스

### 골드 획득 (초원 기준)
- 시간당 약 220골드 (들쥐/고블린 반반)

### 골드 싱크 (예상)
- 작은 체력 물약: 20G (시간당 약 30~40개 사용 → 600~800G)
- 장비 강화 +1~+3: 누적 약 900G
- 경매소 판매 수수료: 낙찰가 10%

> **초기 밸런스 목표:** 시간당 획득 ≈ 시간당 지출 (인플레 억제)

---

## 10. 차후 조정 포인트

- 클래스 간 DPS 편차 (현재 도적/암살자 편중 예상)
- 오프라인 효율 90%가 체감상 충분한지
- 스피드 스탯이 전투 속도에 미치는 영향 (너무 큰가)
- 보스전 난이도 (Lv.12 유저에게 적절한가)
- 포션 가격 vs 드랍률 균형

---

*2026-04-06 초안 · v0.1 구현 후 1주 플레이테스트 → v0.2 조정*
