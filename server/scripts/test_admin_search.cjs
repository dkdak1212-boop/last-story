const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const names = ['나우아임영', '나우', '나', 'admin'];
  for (const n of names) {
    const r = await pool.query(
      `SELECT c.id, c.name, c.level
       FROM characters c JOIN users u ON u.id = c.user_id
       WHERE c.name ILIKE $1
       ORDER BY c.level DESC LIMIT 20`,
      [`%${n}%`]
    );
    console.log(`"${n}" → ${r.rowCount}개: ${JSON.stringify(r.rows.slice(0, 5))}`);
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
