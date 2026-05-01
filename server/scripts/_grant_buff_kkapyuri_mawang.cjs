const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  const names = ['깝유리', '마왕'];
  const found = await pool.query(
    `SELECT id, name, level, exp_boost_until, gold_boost_until, drop_boost_until
       FROM characters WHERE name = ANY($1)`,
    [names]
  );
  console.log(`매치된 캐릭: ${found.rows.length}건`);
  for (const r of found.rows) {
    console.log(`  - ${r.name} (id=${r.id}, lv=${r.level})`);
  }

  if (found.rows.length === 0) {
    console.log('\n캐릭 없음 — 종료');
    process.exit(0);
  }

  const ids = found.rows.map(r => r.id);
  const upd = await pool.query(
    `UPDATE characters
        SET exp_boost_until  = NOW() + INTERVAL '4 hours',
            gold_boost_until = NOW() + INTERVAL '4 hours',
            drop_boost_until = NOW() + INTERVAL '4 hours'
      WHERE id = ANY($1)
      RETURNING id, name, exp_boost_until`,
    [ids]
  );
  console.log(`\n=== 버프 적용 완료 (4시간) ===`);
  for (const r of upd.rows) {
    console.log(`  ${r.name}: until ${r.exp_boost_until}`);
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
