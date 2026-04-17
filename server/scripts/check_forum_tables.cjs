const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const t = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_name IN ('board_posts','board_comments','board_reports')`);
  console.log('tables:', t.rows);
  const m = await pool.query(`SELECT name, applied_at FROM _migrations WHERE name = 'forum_v1'`);
  console.log('migration:', m.rows);
  try {
    const r = await pool.query(`SELECT COUNT(*)::int AS cnt FROM board_posts`);
    console.log('board_posts count:', r.rows);
  } catch (e) {
    console.error('board_posts query failed:', e.message);
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
