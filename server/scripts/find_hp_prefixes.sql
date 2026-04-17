SET client_encoding TO 'UTF8';
SELECT id, name, stat_key, tier, value
FROM item_prefixes
WHERE stat_key IN ('berserk_pct', 'predator_pct', 'guardian_pct')
ORDER BY stat_key, tier;
