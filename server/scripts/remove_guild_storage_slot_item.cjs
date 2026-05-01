const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  // 제거 전 확인
  const { rows: before } = await c.query(
    `SELECT id, name, price, reward_type FROM guild_boss_shop_items WHERE reward_type = 'guild_storage_slot'`
  );
  console.log('삭제 대상:', before);
  // 제거
  const r = await c.query(`DELETE FROM guild_boss_shop_items WHERE reward_type = 'guild_storage_slot'`);
  console.log(`DELETE rowCount=${r.rowCount}`);
  // 혹시 구매 이력(구매 횟수 추적)도 정리 — 있을 경우만
  try {
    const r2 = await c.query(`DELETE FROM guild_boss_shop_purchases WHERE shop_item_id IN (SELECT id FROM guild_boss_shop_items WHERE reward_type = 'guild_storage_slot')`);
    console.log(`purchases DELETE rowCount=${r2.rowCount}`);
  } catch {}
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
