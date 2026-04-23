# 100제 유니크 성직자 무기 개편 스펙

## 목적
성직자 유니크 100제 무기 3종의 기본 스탯·유니크 옵션을 재조정하여 성직자 컨셉(보호/방어형)을 강화. 기존 미구현 키(`hp_pct`) 버그도 함께 수정.

## 범위
- DB `items` 테이블 id=806, 807, 808 의 `stats`, `unique_prefix_stats`, `description` 업데이트
- `server/src/combat/engine.ts` — 장비 접두사 `shield_amp` 합산 지원
- `server/src/pvp/realtimeEngine.ts` — PvP shield 스킬도 `shield_amp`(노드+접두사) 반영 (일관성, 기존에 전혀 안 붙던 경로 동시 수정)

## 변경 내역

### id=806 신성한 차원의 홀
- stats: `{matk:945, hp:1100, int:22}` → `{matk:945, hp:2000, vit:20}`
- unique_prefix_stats: `{matk_pct:14, hp_regen:100}` → `{shield_amp:20, damage_taken_down_pct:10}`
- description: `[유니크] 마법공격 +14%, HP 재생 +100` → `[유니크] 쉴드효과 +20%, 받는 데미지 -10%`

### id=807 영원한 빛의 성구
- stats: `{matk:910, hp:1300, vit:20}` → `{matk:910, hp:1300, vit:50}`
- unique_prefix_stats: `{hp_pct:18, lifesteal_pct:25}` → `{max_hp_pct:18}`
  - **버그 수정**: `hp_pct` (무효 키) → `max_hp_pct` (실제 적용되는 키)
  - 흡혈 제거
- description: `[유니크] 최대 HP +18%, 흡혈 +25%` → `[유니크] 최대 HP +18%`

### id=808 무한의 심판
- stats: 변경 없음 (`{matk:998, hp:950, def:60}`)
- unique_prefix_stats: `{matk_pct:15, damage_taken_down_pct:12}` → `{matk_pct:30, damage_taken_down_pct:20}`
- description: `[유니크] 마법공격 +15%, 받는 데미지 -12%` → `[유니크] 마법공격 +30%, 받는 데미지 -20%`

## 코드 변경

### combat/engine.ts: shield case에 equipPrefixes 합산
```ts
// 기존:
const shieldAmp = getPassive(s, 'shield_amp');
// 변경:
const shieldAmp = getPassive(s, 'shield_amp') + (s.equipPrefixes.shield_amp || 0);
```

### pvp/realtimeEngine.ts: shield case에 node+prefix 합산
기존: shield_amp 미적용. 노드+접두사 `shield_amp` 합해서 쉴드량에 × (1 + x/100) 반영.

## 리스크
- 기존 806 보유자(있다면): matk_pct +14% / hp_regen +100 사라짐. 저HP 축 캐릭터에게 다운그레이드 가능. stats 변경으로 총 matk↓, hp↑.
- 기존 807 보유자: 흡혈 +25% 사라짐 (실전 영향 큼). max_hp_pct는 원래 버그로 0%였던 게 실제 18% 적용되어 HP↑.
- 808 보유자: 큰 폭 상향 (matk +15% → +30%). 마공 주력 기준 실DPS ~+13% 상승.
- 장비 같은 item_id라 자동 반영됨 (캐릭터 인벤토리/장착 롤백 불필요).
- `shield_amp` 접두사 지원 추가는 기존 보유 캐릭 중 누구도 해당 접두사가 없던 상태라 사이드 이펙트 없음.

## 적용 순서
1. 코드 변경 (engine.ts, realtimeEngine.ts) → commit → push (Railway 재배포)
2. DB UPDATE 3건 (Railway DB)
3. 보유자 확인 (현재 누가 장착/보관 중인지)
