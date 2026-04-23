SELECT id, name, exp_boost_until, event_exp_pct, event_exp_until, event_drop_pct, event_drop_until, NOW() AS now
FROM characters
WHERE name IN ('나혼자레벨업','똘똘한박서연')
ORDER BY name;
