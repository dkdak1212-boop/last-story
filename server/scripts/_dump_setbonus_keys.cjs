const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  try {
    const r = await pool.query(`SELECT id, name, set_bonus_2, set_bonus_4, set_bonus_6 FROM item_sets ORDER BY id`);
    const allKeys = new Set();
    for (const row of r.rows) {
      console.log(`[${row.id}] ${row.name}`);
      console.log(`  2: ${JSON.stringify(row.set_bonus_2)}`);
      console.log(`  4: ${JSON.stringify(row.set_bonus_4)}`);
      console.log(`  6: ${JSON.stringify(row.set_bonus_6)}`);
      [row.set_bonus_2, row.set_bonus_4, row.set_bonus_6].forEach(b => {
        if (b) Object.keys(b).forEach(k => allKeys.add(k));
      });
    }
    console.log('\nALL UNIQUE KEYS:', [...allKeys].sort().join(', '));
  } finally { await pool.end(); }
})().catch(e => { console.error(e); process.exit(1); });
