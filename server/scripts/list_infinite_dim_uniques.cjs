const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  const r = await pool.query(
    `SELECT id, name, type, slot, class_restriction, required_level, stats, unique_prefix_stats, description
     FROM items WHERE id BETWEEN 800 AND 838 ORDER BY id`
  );

  const fmt = (j) => Object.entries(j || {}).map(([k, v]) => `${k}=${v}`).join(', ');

  let last = '';
  for (const it of r.rows) {
    let group = it.type === 'weapon' ? `[무기 / ${it.class_restriction}]` :
                it.type === 'armor' ? `[방어구 / ${it.slot}]` :
                `[악세서리 / ${it.slot}]`;
    if (group !== last) { console.log(`\n=== ${group} ===`); last = group; }
    console.log(`${it.id}  ${it.name}`);
    console.log(`     base : ${fmt(it.stats)}`);
    console.log(`     uniq : ${fmt(it.unique_prefix_stats)}`);
    console.log(`     desc : ${it.description}`);
  }

  console.log(`\n총 ${r.rowCount}개`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
