const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  try {
    const r = await pool.query(`SELECT id, name, level, COALESCE(paragon_points, 0) AS pp FROM characters WHERE name = '레이시'`);
    if (!r.rowCount) { console.log('NO CHAR 레이시'); return; }
    for (const c of r.rows) {
      console.log(`[before] id=${c.id} name=${c.name} L=${c.level} paragon_points=${c.pp}`);
      await pool.query('UPDATE characters SET paragon_points = COALESCE(paragon_points, 0) + 5 WHERE id = $1', [c.id]);
    }
    const after = await pool.query(`SELECT id, name, COALESCE(paragon_points, 0) AS pp FROM characters WHERE name = '레이시'`);
    after.rows.forEach(c => console.log(`[after]  id=${c.id} name=${c.name} paragon_points=${c.pp}`));
  } finally { await pool.end(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
