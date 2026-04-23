# 100제 유니크 무기 8종 리메이크 스펙

## 범위
전사 2·마법사 3·소환사 3 = 총 8종 리메이크. 800(시공의 절단검), 성직자(806~808, 최근 개편 完), 도적(809~811)은 제외.

## 컨셉
딜/치명 축 기본. 마법사는 치명타 -50% 너프(+6% 보정), 소환사는 치명/원소폭발 대신 소환수 강화 계열 + 기동성(SPD).

## DB 변경 (items 테이블)

### 전사
- **801 무한 망각의 대검**: stats `{atk:990, hp:1200, str:28, cri:8}` / unique `{atk_pct:12, crit_dmg_pct:15}` / desc "[유니크] 공격 +12%, 치명타 피해 +15%"
- **802 차원 분쇄자**: stats `{atk:1100, hp:700, cri:12, str:30}` / unique `{atk_pct:10, crit_dmg_pct:22, def_reduce_pct:15}` / desc "[유니크] 공격 +10%, 치명타 피해 +22%, 적 방어 -15%"

### 마법사
- **803 시간의 종말**: stats `{matk:1080, int:30, hp:700}` / unique `{matk_pct:11, crit_dmg_pct:15, gauge_on_crit_pct:7}` / desc "[유니크] 마법공격 +11%, 치명타 피해 +15%, 치명타 시 게이지 +7%"
- **804 무한 별의 지팡이**: stats `{matk:1050, int:28, hp:800}` / unique `{matk_pct:15, crit_dmg_pct:13}` / desc "[유니크] 마법공격 +15%, 치명타 피해 +13%"
- **805 차원 균열의 홀**: stats `{matk:1100, int:26, hp:700}` / unique `{matk_pct:10, crit_dmg_pct:17, def_pierce_pct:10}` / desc "[유니크] 마법공격 +10%, 치명타 피해 +17%, 적 방어 +10% 추가 무시"

### 소환사
- **812 무한 소환의 보주**: stats `{matk:1050, int:28, hp:950}` / unique `{matk_pct:10, summon_amp:20, summon_double_hit:12}` / desc "[유니크] 마법공격 +10%, 소환수 데미지 +20%, 소환수 2회 타격 +12%"
- **813 차원 균열의 토템**: stats `{matk:1000, int:26, hp:1100, spd:50}` / unique `{matk_pct:9, summon_max_extra:1}` / desc "[유니크] 마법공격 +9%, 최대 소환수 +1"
- **814 시공 소환술서**: stats `{matk:1070, int:30, hp:800, spd:50}` / unique `{matk_pct:12, summon_amp:15}` / desc "[유니크] 마법공격 +12%, 소환수 데미지 +15%"

## 코드 변경

### combat/engine.ts — 소환수 키 접두사 합산 (shield_amp 패턴)
```ts
// line 940-941
const summonAmp = getPassive(s, 'summon_amp') + (s.equipPrefixes.summon_amp || 0);
const summonDouble = getPassive(s, 'summon_double_hit') + (s.equipPrefixes.summon_double_hit || 0);
// line 1866
const maxSummons = MAX_SUMMONS + getPassive(s, 'summon_max_extra') + (s.equipPrefixes.summon_max_extra || 0);
```

### client/PrefixDisplay.tsx — 라벨 3종 추가
```ts
summon_amp: v => `소환수 데미지 ${v}% 증가`,
summon_double_hit: v => `소환수 2회 타격 ${v}%`,
summon_max_extra: v => `최대 소환수 +${v}`,
```

## 반영 범위 (자동)
- 같은 item_id를 참조하는 모든 인스턴스가 자동 반영됨
- 경매장 매물 (auctions.item_id 참조): 다음 조회 시 신규 stats/unique 노출
- 인벤토리/장착 (character_inventory/character_equipped): 캐릭 재로그인/전투 재진입 시 갱신
- 랜덤 prefix_stats (per-instance 롤)는 변경 없음 — 유니크 옵션만 교체

## 리스크
- 기존 보유자 자동 다운그레이드 (801/802/803/804/805/812/813/814 전부 옵션 약화 방향)
- 813/814 SPD +50은 base stat라 캐릭 재로그인 / 재장착 시까지 전투 세션 캐시는 이전 값 유지
- PvP 소환사 경로는 이번 프리픽스 패치 미반영 (실제 PvP에서 소환수 메카닉 미사용)
