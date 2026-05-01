SET client_encoding TO 'UTF8';

WITH checks AS (
  SELECT 'guild_bosses_table' AS k, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='guild_bosses')::text AS v
  UNION ALL SELECT 'item_800_desc', COALESCE((SELECT substring(description,1,30) FROM items WHERE id=800), 'MISSING')
  UNION ALL SELECT 'total_hits_col', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='guild_boss_guild_daily' AND column_name='total_hits')::text
  UNION ALL SELECT 'personal_exp_mult_col', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='characters' AND column_name='personal_exp_mult')::text
  UNION ALL SELECT 'field_999', EXISTS(SELECT 1 FROM fields WHERE id=999)::text
  UNION ALL SELECT 'event_exp_max_level_col', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='characters' AND column_name='event_exp_max_level')::text
  UNION ALL SELECT 'last_char_deleted_at_col', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_char_deleted_at')::text
  UNION ALL SELECT 'quality_reroll_item', EXISTS(SELECT 1 FROM items WHERE name=E'품질 재굴림권')::text
  UNION ALL SELECT 'storage_slots_bonus_col', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='storage_slots_bonus')::text
  UNION ALL SELECT 'atk_boost_until_col', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='characters' AND column_name='atk_boost_until')::text
  UNION ALL SELECT 'guild_medals_col', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='guild_medals')::text
  UNION ALL SELECT 'unique_ticket_item', EXISTS(SELECT 1 FROM items WHERE name=E'유니크 무작위 추첨권')::text
  UNION ALL SELECT 'item_802_def_reduce', COALESCE((SELECT unique_prefix_stats->>'def_reduce_pct' FROM items WHERE id=802), 'MISSING')
)
SELECT k || '|' || v FROM checks ORDER BY k;
