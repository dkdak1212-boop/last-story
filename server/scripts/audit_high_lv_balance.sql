SET client_encoding TO 'UTF8';

\echo '=== 1. 90+ 레벨 몬스터 ==='
SELECT id, name, level, max_hp, exp_reward, gold_reward, stats
FROM monsters WHERE level >= 80 ORDER BY level;

\echo ''
\echo '=== 2. 80+ 레벨 필드 ==='
SELECT id, name, monster_pool FROM fields ORDER BY id DESC LIMIT 10;

\echo ''
\echo '=== 3. 80+ 레벨 캐릭터 분포 ==='
SELECT level, COUNT(*) AS count
FROM characters WHERE level >= 80 GROUP BY level ORDER BY level DESC;

\echo ''
\echo '=== 4. 80+ 캐릭터 평균/최대 스탯 (직업별) ==='
SELECT class_name,
       AVG((stats->>'str')::int + (stats->>'dex')::int + (stats->>'int')::int + (stats->>'vit')::int + COALESCE((stats->>'spd')::int,0)) AS avg_total,
       MAX((stats->>'str')::int + (stats->>'dex')::int + (stats->>'int')::int + (stats->>'vit')::int + COALESCE((stats->>'spd')::int,0)) AS max_total,
       AVG(max_hp) AS avg_hp
FROM characters WHERE level >= 80 GROUP BY class_name;

\echo ''
\echo '=== 5. Top 5 캐릭터 정확한 스탯 ==='
SELECT id, name, class_name, level, max_hp, stats
FROM characters WHERE level >= 80 ORDER BY level DESC, max_hp DESC LIMIT 10;
