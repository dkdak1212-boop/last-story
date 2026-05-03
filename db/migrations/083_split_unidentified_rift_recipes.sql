-- 시공의 균열 세트 (미확인) — 무기·방어구·장신구 카테고리별 분리 레시피.
-- 082 의 단일 멀티재료 레시피(15) 폐기 → 3 개 레시피로 분리.
-- 무기 (균열의 핵 ×1000)        → 시공 분쇄 무기 5종 (900-904) 무작위 1
-- 방어구 (차원 파편 ×2500)      → 시공 분쇄 방어구 3종 (905-907) 무작위 1
-- 장신구 (시공의 정수 ×2500)    → 시공의 반지/목걸이 (908-909) 무작위 1
-- 결과는 모두 unidentified=TRUE, soulbound=FALSE → 거래 가능.

-- 기존 통합 레시피 15 폐기 (이미 등록된 사용자 데이터 영향 없음 — 미사용 신규 기능)
DELETE FROM craft_recipes WHERE id = 15;

-- 무기 — 균열의 핵 ×1000 → 무작위 무기 5종 (단일 재료, extra_materials 빈 배열)
INSERT INTO craft_recipes (id, name, material_item_id, material_qty, result_type, result_item_ids, set_id, extra_materials)
VALUES (
  15,
  '시공의 균열 무기 (미확인) — 균열의 핵 1000',
  854, 1000,
  'unidentified_set',
  ARRAY[900, 901, 902, 903, 904]::int[],
  4,
  '[]'::jsonb
);

-- 방어구 — 차원 파편 ×2500 → 무작위 방어구 3종
INSERT INTO craft_recipes (id, name, material_item_id, material_qty, result_type, result_item_ids, set_id, extra_materials)
VALUES (
  16,
  '시공의 균열 방어구 (미확인) — 차원 파편 2500',
  852, 2500,
  'unidentified_set',
  ARRAY[905, 906, 907]::int[],
  4,
  '[]'::jsonb
);

-- 장신구 — 시공의 정수 ×2500 → 무작위 장신구 2종
INSERT INTO craft_recipes (id, name, material_item_id, material_qty, result_type, result_item_ids, set_id, extra_materials)
VALUES (
  17,
  '시공의 균열 장신구 (미확인) — 시공의 정수 2500',
  853, 2500,
  'unidentified_set',
  ARRAY[908, 909]::int[],
  4,
  '[]'::jsonb
);

-- 시퀀스 동기화
SELECT setval(pg_get_serial_sequence('craft_recipes', 'id'),
              GREATEST((SELECT MAX(id) FROM craft_recipes), 17));
