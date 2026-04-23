BEGIN;

UPDATE characters
SET exp_boost_until  = NOW() + INTERVAL '6 hours',
    gold_boost_until = NOW() + INTERVAL '6 hours',
    drop_boost_until = NOW() + INTERVAL '6 hours'
WHERE name = '일단';

SELECT id, name, exp_boost_until, gold_boost_until, drop_boost_until, NOW() AS now
FROM characters
WHERE name = '일단';

COMMIT;
