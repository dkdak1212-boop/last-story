SELECT id, name, exp_boost_until, gold_boost_until, drop_boost_until, NOW() AS now,
       exp_boost_until - NOW() AS exp_remaining
FROM characters
WHERE name = '일단';
