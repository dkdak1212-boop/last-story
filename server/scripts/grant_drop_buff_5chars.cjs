const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  const NAMES = ['분노', '나태', '둥둥', '일단', '이단'];
  const PCT = 200;
  const HOURS = 24;

  for (const name of NAMES) {
    const r = await pool.query(
      `UPDATE characters
          SET event_drop_pct = $1,
              event_drop_until = NOW() + ($2 || ' hours')::interval
        WHERE name = $3
        RETURNING id, name, level, event_drop_pct, event_drop_until`,
      [PCT, HOURS.toString(), name]
    );
    if (r.rowCount === 0) { console.log(`[FAIL] ${name}: 캐릭터 없음`); continue; }
    const c = r.rows[0];
    console.log(`[OK] ${name} (id=${c.id}, Lv.${c.level}): drop +${c.event_drop_pct}% until ${c.event_drop_until}`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
