-- 히드라 카르나스 (Lv.90, HP 1500만) — 발라카스보다 2~3배 보상
UPDATE world_event_bosses SET reward_table = '[
  {"tier":"S","minRank":1,"maxRank":3,"rewards":{"itemId":289,"qty":1,"gold":100000,"exp":1000000}},
  {"tier":"A","minPct":0,"maxPct":5,"rewards":{"itemId":288,"qty":1,"gold":60000,"exp":600000}},
  {"tier":"B","minPct":5,"maxPct":20,"rewards":{"itemId":287,"qty":1,"gold":30000,"exp":300000}},
  {"tier":"C","minPct":20,"maxPct":100,"rewards":{"exp":100000,"gold":10000}}
]'::jsonb WHERE id = 3;

-- 아트라스 (Lv.100, HP 5000만) — 최강 보상
UPDATE world_event_bosses SET reward_table = '[
  {"tier":"S","minRank":1,"maxRank":3,"rewards":{"itemId":292,"qty":1,"gold":250000,"exp":2500000}},
  {"tier":"A","minPct":0,"maxPct":5,"rewards":{"itemId":291,"qty":1,"gold":150000,"exp":1500000}},
  {"tier":"B","minPct":5,"maxPct":20,"rewards":{"itemId":290,"qty":1,"gold":80000,"exp":800000}},
  {"tier":"C","minPct":20,"maxPct":100,"rewards":{"exp":250000,"gold":25000}}
]'::jsonb WHERE id = 2;

SELECT id, name, reward_table IS NOT NULL AND reward_table != '[]'::jsonb AS has_rewards FROM world_event_bosses ORDER BY id;
