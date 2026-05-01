const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync(__dirname + '/../../db/migrations/029_event_exp_max_level.sql', 'utf8');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  await c.query(sql);
  const { rows } = await c.query(
    `SELECT id, name, level, event_exp_pct, event_exp_until, event_exp_max_level
       FROM characters
      WHERE event_exp_pct > 0 AND event_exp_until > NOW()
      ORDER BY id`
  );
  console.log(`활성 신규유저 EXP 버프 캐릭터: ${rows.length}명`);
  for (const r of rows) {
    console.log(`  ${r.name} (Lv.${r.level}) +${r.event_exp_pct}% until ${r.event_exp_until} max_lv=${r.event_exp_max_level}`);
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
