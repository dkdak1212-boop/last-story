const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  const NAMES = ['나혼자레벨다운', '똘똘한박서연'];
  const POINTS = 30;

  for (const name of NAMES) {
    const charR = await pool.query(
      `SELECT id, name, level, node_points FROM characters WHERE name = $1`,
      [name]
    );
    if (charR.rowCount === 0) { console.log(`[FAIL] ${name}: 캐릭터 없음`); continue; }
    const c = charR.rows[0];

    const upd = await pool.query(
      `UPDATE characters SET node_points = node_points + $1 WHERE id = $2 RETURNING node_points`,
      [POINTS, c.id]
    );
    const after = upd.rows[0].node_points;
    console.log(`[OK] ${name} (id=${c.id}, Lv.${c.level}): node_points ${c.node_points} -> ${after} (+${POINTS})`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
