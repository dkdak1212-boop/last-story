-- 소환사 전투 세션 상태
SELECT cs.character_id, c.name, c.level, cs.field_id, cs.player_hp, cs.auto_mode,
       cs.monster_hp, cs.action_count,
       cs.last_tick_at, cs.updated_at,
       COALESCE(jsonb_array_length(cs.status_effects), 0) AS status_cnt
FROM combat_sessions cs
JOIN characters c ON c.id = cs.character_id
WHERE c.class_name = 'summoner'
ORDER BY cs.updated_at DESC
LIMIT 15;

-- 필드 25+ (50+ 필드 = highTierMult x3) 소환사 vs 몬스터 데미지 비교
-- 일단(id=65, lv100, 필드21), 까망(id=711, lv92, 필드18)
SELECT id, name, class_name, level, str, int, vit, max_hp
FROM characters
WHERE id IN (65, 711, 267, 556, 76);
