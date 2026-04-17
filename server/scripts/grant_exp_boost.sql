SET client_encoding TO 'UTF8';
BEGIN;
UPDATE characters
SET exp_boost_until = GREATEST(COALESCE(exp_boost_until, NOW()), NOW()) + INTERVAL '6 hours'
WHERE name = '이름변경'
RETURNING id, name, exp_boost_until;
COMMIT;
