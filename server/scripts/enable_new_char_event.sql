-- 신규 캐릭 EXP +300% (×4) 이벤트 활성화 — 30일
BEGIN;
UPDATE server_settings SET value = '300', updated_at = NOW() WHERE key = 'new_char_exp_pct';
UPDATE server_settings SET value = (NOW() + INTERVAL '30 days')::text, updated_at = NOW() WHERE key = 'new_char_exp_until';
SELECT key, value FROM server_settings WHERE key IN ('new_char_exp_pct','new_char_exp_until');
COMMIT;
