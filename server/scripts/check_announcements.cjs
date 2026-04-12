const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const r = await pool.query(`
    SELECT id, title, active, priority, created_at, expires_at,
           (expires_at > NOW()) AS not_expired
    FROM announcements
    ORDER BY created_at DESC LIMIT 10
  `);
  for (const row of r.rows) {
    console.log(`#${row.id} [${row.active ? 'ON' : 'OFF'}] ${row.priority} | expired=${!row.not_expired} | ${row.title}`);
  }
  await pool.end();
})();
