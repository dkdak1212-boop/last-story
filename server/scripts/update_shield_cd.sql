SET client_encoding TO 'UTF8';
BEGIN;
UPDATE skills SET cooldown_actions = 2 WHERE id = 96;
SELECT id, name, cooldown_actions, effect_duration FROM skills WHERE id = 96;
COMMIT;
