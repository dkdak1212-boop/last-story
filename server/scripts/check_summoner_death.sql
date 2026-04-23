-- 소환사 캐릭 현황 + 최근 전투 세션
SELECT c.id, c.name, c.level, c.class_name, c.hp, c.max_hp, c.location, c.last_online_at,
       (SELECT COUNT(*) FROM character_inventory ci WHERE ci.character_id = c.id AND ci.item_id IN (100,102,104,106)) AS potion_stacks
FROM characters c
WHERE c.class_name = 'summoner'
ORDER BY c.last_online_at DESC NULLS LAST
LIMIT 10;

-- 최근 전투 세션 (소환사)
SELECT cs.character_id, c.name, c.level, cs.field_id, cs.player_hp, cs.auto_mode, cs.last_tick_at, cs.updated_at,
       jsonb_array_length(cs.status_effects) FILTER (WHERE cs.status_effects IS NOT NULL) AS status_cnt
FROM combat_sessions cs
JOIN characters c ON c.id = cs.character_id
WHERE c.class_name = 'summoner'
ORDER BY cs.updated_at DESC
LIMIT 10;

-- 필드별 몬스터 공격력 (lv 50+ 필드)
SELECT f.id, f.name, f.required_level,
       (SELECT string_agg(m.name || ' (lv' || m.level || ', atk=' || (m.stats->>'str')::int || ')', ', ')
        FROM monsters m WHERE m.id = ANY(SELECT jsonb_array_elements_text(f.monster_pool)::int)) AS monsters
FROM fields f
WHERE f.required_level >= 50
ORDER BY f.required_level
LIMIT 10;
