# 무한의 정수 v1

## 컨셉
영구 주력 스탯 (힘/덱스/인트/바이탈) +1 부여. 모든 사냥터에서 매우 희귀한 확률 (1천만 분의 1) 로 드랍, 계정당 하루 1개 제한.

## 아이템 정보
- 이름: **무한의 정수**
- type: `consumable`
- grade: `mythic`
- stack_size: 99
- required_level: 1
- bound_on_pickup: `false` (거래소·창고·우편 모두 가능)
- sell_price: 0 (NPC 매각 차단)
- 폐기/추출/분해 불가
- 거래소 카테고리: 기타

## 드랍
- 모든 사냥터 (필드/균열/종언) 어떤 몬스터든 처치 시
- 드랍 확률: **1e-7 (0.00001%)**
- **계정당 일일 1개 제한**
  - 같은 계정의 어떤 캐릭이 받았든 그 날 다시 안 떨어짐
  - 자정 KST 리셋

## 사용 효과
- 사용 시 모달: "어떤 스탯에 +1 하시겠습니까?"
- 4버튼: **힘 / 덱스 / 인트 / 바이탈**
- 캡: **각 스탯 +200까지** (캐릭당)
- 캡 도달 시 해당 버튼 비활성 + 다른 스탯으로 자동 안내
- 4 스탯 모두 캡 도달 시 사용 불가 메시지

## 스탯 적용 방식
- characters 테이블에 새 컬럼 4개:
  - `permanent_stat_bonus_str` (int, default 0, max 200)
  - `permanent_stat_bonus_dex` (int, default 0, max 200)
  - `permanent_stat_bonus_int` (int, default 0, max 200)
  - `permanent_stat_bonus_vit` (int, default 0, max 200)
- 캐릭 스탯 계산 시 `stats.{str|dex|int|vit}` + `permanent_stat_bonus_*` 합산

## DB 변경
1. `items` row 추가 (id 자동, 또는 다음 id)
2. `characters` 컬럼 4개 추가
3. `users` 컬럼 추가:
   - `eternal_essence_drop_date` DATE — 마지막 드랍 일자 (KST)

## 보호
- drop_filter (auto_sell/auto_dismantle) 자동 폐기 보호 — 코드에서 item.id 명시적 제외
- 거래소 등록 시 모달 한 번 더 확인: "무한의 정수는 회수 불가합니다. 등록하시겠습니까?"

## 거래소
- marketplace.ts 카테고리 매핑에 추가
- 카테고리: `etc` (기타)

## 클라 UI
- ItemIcon 에 무한의 정수 아이콘 추가 (별/보석 픽셀 아이콘)
- 인벤에서 사용 시 스탯 선택 모달 (4버튼)
- 사용 후 토스트: "[힘/덱스/인트/바이탈] +1 영구 적용 (현재 +N/+200)"

## 변경 파일
- 서버:
  - `server/src/routes/inventory.ts` — 사용 분기
  - `server/src/combat/engine.ts` 또는 `combat/spawn` 등 — 드랍 로직
  - `server/src/game/character.ts` 또는 `formulas.ts` — 영구 보너스 합산
  - `server/src/routes/marketplace.ts` — 카테고리, 등록 보호
- DB: 마이그레이션 SQL (직접 실행)
- 클라:
  - `client/src/screens/InventoryScreen.tsx` — 사용 모달
  - `client/src/components/ui/ItemIcon.tsx` — 아이콘
  - `client/src/screens/MarketplaceScreen.tsx` — 등록 확인
