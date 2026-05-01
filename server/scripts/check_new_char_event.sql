SELECT key, value, updated_at, NOW() AS now
FROM server_settings
WHERE key IN ('new_char_exp_pct', 'new_char_exp_until');
