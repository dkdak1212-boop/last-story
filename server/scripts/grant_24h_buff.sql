SET client_encoding TO 'UTF8';
BEGIN;
UPDATE characters
SET exp_boost_until = GREATEST(COALESCE(exp_boost_until, NOW()), NOW()) + INTERVAL '24 hours',
    gold_boost_until = GREATEST(COALESCE(gold_boost_until, NOW()), NOW()) + INTERVAL '24 hours',
    drop_boost_until = GREATEST(COALESCE(drop_boost_until, NOW()), NOW()) + INTERVAL '24 hours'
WHERE name = '마법소년'
RETURNING id, name, exp_boost_until, gold_boost_until, drop_boost_until;
COMMIT;
