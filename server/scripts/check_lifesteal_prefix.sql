-- 현재 장착 장비의 prefix_stats 에 lifesteal 관련 키가 있는지
SELECT ce.character_id, c.name, c.class_name, ce.slot, ce.prefix_stats
FROM character_equipped ce
JOIN characters c ON c.id = ce.character_id
WHERE ce.prefix_stats::text ILIKE '%lifesteal%' OR ce.prefix_stats::text ILIKE '%흡혈%'
LIMIT 10;

-- prefixes 시스템 테이블 확인 (다른 이름일 수도)
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name ILIKE '%prefix%';

-- item_prefixes / item_prefix_definitions 등의 컬럼
SELECT DISTINCT (kv).key AS stat_key, COUNT(*) AS cnt
FROM character_equipped ce
CROSS JOIN LATERAL jsonb_each(ce.prefix_stats) kv
WHERE ce.prefix_stats IS NOT NULL
GROUP BY (kv).key
ORDER BY cnt DESC;
