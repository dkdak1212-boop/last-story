const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  const cnt = await pool.query(`SELECT COUNT(*)::int AS n FROM items WHERE id BETWEEN 800 AND 838`);
  console.log(`아이템 수: ${cnt.rows[0].n}`);
  const m = await pool.query(`SELECT id, name, drop_table FROM monsters WHERE id IN (115, 116)`);
  for (const r of m.rows) {
    const dt = Array.isArray(r.drop_table) ? r.drop_table : [];
    const newOnes = dt.filter(d => d.itemId >= 800 && d.itemId <= 838);
    console.log(`${r.name}(${r.id}): 800~838 드롭 ${newOnes.length}개, 첫 chance=${newOnes[0]?.chance}`);
  }
  await pool.end();
})();
