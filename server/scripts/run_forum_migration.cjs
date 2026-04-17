const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS board_posts (
      id SERIAL PRIMARY KEY,
      board_type VARCHAR(8) NOT NULL,
      character_id INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      character_name VARCHAR(40) NOT NULL,
      class_name VARCHAR(20) NOT NULL,
      title VARCHAR(60) NOT NULL,
      body TEXT NOT NULL,
      target_class VARCHAR(20),
      target_level INT,
      view_count INT NOT NULL DEFAULT 0,
      comment_count INT NOT NULL DEFAULT 0,
      report_count INT NOT NULL DEFAULT 0,
      deleted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_board_posts_list ON board_posts (board_type, deleted, created_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS board_comments (
      id SERIAL PRIMARY KEY,
      post_id INT NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
      character_id INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      character_name VARCHAR(40) NOT NULL,
      class_name VARCHAR(20) NOT NULL,
      body VARCHAR(500) NOT NULL,
      deleted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_board_comments_post ON board_comments (post_id, created_at)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS board_reports (
      id SERIAL PRIMARY KEY,
      post_id INT REFERENCES board_posts(id) ON DELETE CASCADE,
      comment_id INT REFERENCES board_comments(id) ON DELETE CASCADE,
      reporter_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason VARCHAR(200),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_board_reports_post ON board_reports (post_id, reporter_id) WHERE post_id IS NOT NULL`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_board_reports_comment ON board_reports (comment_id, reporter_id) WHERE comment_id IS NOT NULL`);
  await pool.query(`INSERT INTO _migrations (name) VALUES ('forum_v1') ON CONFLICT DO NOTHING`);

  const t = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_name IN ('board_posts','board_comments','board_reports') ORDER BY table_name`);
  console.log('생성 확인:', t.rows.map(r => r.table_name));

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
