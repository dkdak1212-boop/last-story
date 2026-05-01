SET client_encoding TO 'UTF8';

\echo === guild_bosses 컬럼 ===
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name='guild_bosses' ORDER BY ordinal_position;

\echo
\echo === 7 보스 메커닉 정의 ===
SELECT id, name, weekday,
       dot_immune, element_immune, element_weak, weak_amp_pct, random_weakness,
       alternating_immune, hp_recover_pct, hp_recover_interval_sec
  FROM guild_bosses
 ORDER BY weekday;

\echo
\echo === 활성 run / 24h 내 ===
SELECT b.name, b.weekday, COUNT(*) AS runs_24h, SUM(r.total_damage::numeric)::text AS total_dmg
  FROM guild_boss_runs r
  JOIN guild_bosses b ON b.id = r.boss_id
 WHERE r.started_at > NOW() - INTERVAL '24 hours'
 GROUP BY b.name, b.weekday
 ORDER BY b.weekday;
