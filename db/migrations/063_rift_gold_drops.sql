-- 시공의 균열 몬스터 골드/드랍 조정 (2026-04-29)
-- 골드: 500=2만, 501=4만, 502=6만
-- 드랍 통일 (3 종 모두): 차원 파편(852) 10% / 시공의 정수(853) 5% / 균열의 핵(854) 2.5%

UPDATE monsters SET gold_reward = 20000, drop_table = '[
  {"itemId":852,"chance":0.10,"minQty":1,"maxQty":1},
  {"itemId":853,"chance":0.05,"minQty":1,"maxQty":1},
  {"itemId":854,"chance":0.025,"minQty":1,"maxQty":1}
]'::jsonb WHERE id = 500;

UPDATE monsters SET gold_reward = 40000, drop_table = '[
  {"itemId":852,"chance":0.10,"minQty":1,"maxQty":1},
  {"itemId":853,"chance":0.05,"minQty":1,"maxQty":1},
  {"itemId":854,"chance":0.025,"minQty":1,"maxQty":1}
]'::jsonb WHERE id = 501;

UPDATE monsters SET gold_reward = 60000, drop_table = '[
  {"itemId":852,"chance":0.10,"minQty":1,"maxQty":1},
  {"itemId":853,"chance":0.05,"minQty":1,"maxQty":1},
  {"itemId":854,"chance":0.025,"minQty":1,"maxQty":1}
]'::jsonb WHERE id = 502;
