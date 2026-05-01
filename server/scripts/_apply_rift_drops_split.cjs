const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  const updates = [
    { id: 500, name: '차원의 잔재', drops: [{ chance: 0.10, itemId: 852, minQty: 1, maxQty: 1 }] },
    { id: 501, name: '시공의 수호자', drops: [{ chance: 0.05, itemId: 853, minQty: 1, maxQty: 1 }] },
    { id: 502, name: '균열의 군주', drops: [{ chance: 0.025, itemId: 854, minQty: 1, maxQty: 1 }] },
  ];
  for (const u of updates) {
    await pool.query(
      'UPDATE monsters SET drop_table = $1::jsonb WHERE id = $2',
      [JSON.stringify(u.drops), u.id]
    );
    console.log(`[${u.id}] ${u.name} → ${JSON.stringify(u.drops)}`);
  }
  // 검증
  const r = await pool.query(`SELECT id, name, drop_table FROM monsters WHERE id IN (500,501,502) ORDER BY id`);
  console.log(`\n=== 적용 후 ===`);
  for (const m of r.rows) {
    console.log(`[${m.id}] ${m.name}: ${JSON.stringify(m.drop_table)}`);
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
