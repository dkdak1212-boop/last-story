SET client_encoding TO 'UTF8';
SELECT id, name, stat_key, tier FROM item_prefixes WHERE stat_key IN ('atk', 'str', 'matk', 'int') ORDER BY stat_key, tier LIMIT 30;
