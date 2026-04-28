-- Lv.100 마법사/성직자 무기 base 스탯 보강 (2026-04-28)
-- 마법사 무기 (803/804/805): cri +8 (현재 0 → 8)
-- 성직자 무기 (806/807/808): vit +100 (각자 +100 가산)

UPDATE items
   SET stats = jsonb_set(stats, '{cri}', to_jsonb(COALESCE((stats->>'cri')::int, 0) + 8))
 WHERE id IN (803, 804, 805);

UPDATE items
   SET stats = jsonb_set(stats, '{vit}', to_jsonb(COALESCE((stats->>'vit')::int, 0) + 100))
 WHERE id IN (806, 807, 808);
