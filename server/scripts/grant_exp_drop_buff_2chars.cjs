// 똘똘한박서연, 나혼자레벨업 → EXP +300% · 드랍 +300% · 48시간 (2일)
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
const names = ['똘똘한박서연', '나혼자레벨업'];
const durationHours = 48;
(async () => {
  await c.connect();
  const until = new Date(Date.now() + durationHours * 3600 * 1000);
  for (const name of names) {
    const { rows } = await c.query(
      `SELECT id, name, class_name, level FROM characters WHERE name = $1`, [name]
    );
    if (rows.length === 0) { console.log(`캐릭터 없음: ${name}`); continue; }
    const ch = rows[0];
    await c.query(
      `UPDATE characters
          SET event_exp_pct = 300,
              event_exp_until = $1,
              event_exp_max_level = NULL,
              event_drop_pct = 300,
              event_drop_until = $1
        WHERE id = $2`,
      [until.toISOString(), ch.id]
    );
    const { rows: after } = await c.query(
      `SELECT id, name, level, event_exp_pct, event_exp_until, event_drop_pct, event_drop_until
         FROM characters WHERE id = $1`, [ch.id]
    );
    const a = after[0];
    console.log(`${a.name} Lv.${a.level} / EXP +${a.event_exp_pct}% · 드랍 +${a.event_drop_pct}% · until ${a.event_exp_until}`);
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
