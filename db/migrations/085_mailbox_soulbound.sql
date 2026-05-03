-- mailbox 에 soulbound 컬럼 추가 — 거래소 미확인 구매 → 가방 가득 → 우편 fallback 시
-- 식별된 아이템이 귀속 상태로 인벤토리에 들어가야 재거래 차단됨.
ALTER TABLE mailbox ADD COLUMN IF NOT EXISTS soulbound BOOLEAN NOT NULL DEFAULT FALSE;
