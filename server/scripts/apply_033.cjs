const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync(__dirname + '/../../db/migrations/033_balance_802_def_reduce.sql', 'utf8');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  // 사전 카운트
  const counts = {};
  for (const t of ['character_inventory','character_equipped','mailbox','auctions','account_storage_items','guild_storage_items']) {
    const r = await c.query(`SELECT COUNT(*)::int AS n FROM ${t} WHERE item_id = 802 AND prefix_stats ? 'def_reduce_pct'`);
    counts[t] = r.rows[0].n;
  }
  console.log('영향 인스턴스:', counts);
  const total = Object.values(counts).reduce((a,b) => a+b, 0);
  console.log(`총 ${total}개 인스턴스 업데이트 예정`);
  await c.query(sql);
  const { rows } = await c.query(`SELECT id, name, unique_prefix_stats::text AS u, description FROM items WHERE id = 802`);
  console.log('items 업데이트 결과:', rows[0]);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
