const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  // 스타터 상자 후보군: 포션/재료/스크롤/티켓/확장권 등 소비성
  const { rows } = await c.query(
    `SELECT id, name, type, grade, COALESCE(required_level,1) AS lv, description
       FROM items
      WHERE type IN ('consumable','material','ticket','currency','scroll')
         OR id IN (100,102,104,106,107,477,842,843,844,845)
         OR name ILIKE '%주문서%' OR name ILIKE '%스크롤%' OR name ILIKE '%확장%'
         OR name ILIKE '%재굴림%' OR name ILIKE '%통행%' OR name ILIKE '%상자%'
      ORDER BY id`
  );
  for (const r of rows) {
    console.log(`${r.id} | ${r.name} | type=${r.type} grade=${r.grade} lv=${r.lv} | ${r.description?.slice(0,50) || ''}`);
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
