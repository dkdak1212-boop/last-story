-- 시공의 균열 드랍 분리 (재료별 정해진 몬스터)
-- 500 차원의 잔재 (공몹) → 852 차원 파편 / 10%
-- 501 시공의 수호자 (엘리트) → 853 시공의 정수 / 5%
-- 502 균열의 군주 (필드보스) → 854 균열의 핵 / 2.5%

UPDATE monsters SET drop_table = '[
  {"chance": 0.10, "itemId": 852, "maxQty": 1, "minQty": 1}
]'::jsonb WHERE id = 500;

UPDATE monsters SET drop_table = '[
  {"chance": 0.05, "itemId": 853, "maxQty": 1, "minQty": 1}
]'::jsonb WHERE id = 501;

UPDATE monsters SET drop_table = '[
  {"chance": 0.025, "itemId": 854, "maxQty": 1, "minQty": 1}
]'::jsonb WHERE id = 502;
