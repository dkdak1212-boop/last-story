const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  try {
    const r = await pool.query(
      `SELECT id, name, level, node_points,
              COALESCE((SELECT SUM(nd.cost) FROM character_nodes cn LEFT JOIN node_definitions nd ON nd.id = cn.node_id WHERE cn.character_id = c.id AND (nd.zone IS NULL OR nd.zone <> 'paragon')), 0) AS spent_normal
         FROM characters c
        WHERE name = '은총'`
    );
    if (!r.rowCount) { console.log('NO CHAR 은총'); return; }
    for (const c of r.rows) {
      console.log(`[before] id=${c.id} name=${c.name} L=${c.level} node_points=${c.node_points} spent_normal=${c.spent_normal}`);
      const expected = Math.max(0, c.level - 1);
      const have = Number(c.node_points) + Number(c.spent_normal);
      const diff = expected - have;
      if (diff > 0) {
        await pool.query('UPDATE characters SET node_points = node_points + $1 WHERE id = $2', [diff, c.id]);
        console.log(`[fix]    +${diff} node_points → 이제 spent+available = ${expected}`);
      } else {
        console.log(`[skip]   이미 충족 (spent+available=${have} >= expected=${expected})`);
      }
    }
    const after = await pool.query(`SELECT id, name, level, node_points FROM characters WHERE name = '은총'`);
    for (const c of after.rows) {
      console.log(`[after]  id=${c.id} name=${c.name} L=${c.level} node_points=${c.node_points}`);
    }
  } finally {
    await pool.end();
  }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
