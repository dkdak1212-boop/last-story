-- 오프라인 진입 시점 버프 스냅샷 — 정산 시 시간 비례 적분에 사용.
-- onSessionGoOffline 가 last_offline_at 과 함께 jsonb_build_object 로 박제.
-- settleOfflineRewards 가 snapshot.*_until 와 [last_offline_at, NOW] 교집합으로
-- mul 가중치 계산 → 3시간 버프 + 8시간 오프 케이스에서 3시간만 1.5×, 5시간 1.0×
-- 같이 fair 적분. 어뷰즈(오프 후 버프 켜고 정산)도 snapshot.until 이 offline-start
-- 이전이라 overlap=0 → 보너스 0 으로 차단.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS offline_buff_snapshot JSONB;
