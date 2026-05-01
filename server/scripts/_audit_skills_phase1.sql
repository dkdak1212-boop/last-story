SET client_encoding TO 'UTF8';

\echo === 1) 클래스별 스킬 요약 ===
SELECT class_name,
       COUNT(*) AS skills,
       MIN(required_level) AS min_lv,
       MAX(required_level) AS max_lv,
       ROUND(AVG(damage_mult)::numeric, 2) AS avg_dmg_mult,
       ROUND(AVG(cooldown_actions)::numeric, 2) AS avg_cd,
       ROUND(MAX(damage_mult)::numeric, 2) AS max_dmg_mult,
       SUM(CASE WHEN damage_mult>0 THEN 1 ELSE 0 END) AS atk_skills
FROM skills
GROUP BY class_name
ORDER BY class_name;

\echo
\echo === 2) DPS 인덱스 (damage_mult / max(cd,1)) ===
SELECT class_name,
       ROUND(SUM(damage_mult / GREATEST(cooldown_actions, 1))::numeric, 3) AS dps_index
FROM skills
WHERE damage_mult > 0
GROUP BY class_name
ORDER BY dps_index DESC;

\echo
\echo === 3) 클래스별 스킬 상세 ===
SELECT class_name, required_level AS lv, name,
       damage_mult AS dmg, cooldown_actions AS cd,
       kind, effect_type, COALESCE(effect_value, 0) AS ev
FROM skills
ORDER BY class_name, required_level, name;
