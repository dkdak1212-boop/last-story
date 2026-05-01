SET client_encoding TO 'UTF8';

\echo === 우유 캐릭 ===
SELECT id, name, class_name, level, exp,
       online_exp_rate, online_gold_rate, online_kill_rate, online_drop_rate,
       current_field_kills, total_kills,
       exp_boost_until, event_exp_until, event_exp_max_level,
       personal_exp_mult, personal_exp_mult_max_level,
       location
  FROM characters
 WHERE name = E'우유';
