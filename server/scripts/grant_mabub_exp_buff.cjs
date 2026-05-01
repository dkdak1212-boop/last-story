// 마법 캐릭터에게 EXP +500% 버프 12시간 부여 (event_exp_* 컬럼 사용, 레벨 상한 없음)
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const { rows: chs } = await c.query(
    `SELECT id, name, class_name, level, event_exp_pct, event_exp_until, event_exp_max_level
       FROM characters WHERE name = $1`, ['마법']
  );
  if (chs.length === 0) { console.log('캐릭터 없음: 마법'); return; }
  const ch = chs[0];
  console.log(`전: ${ch.name} Lv.${ch.level} ${ch.class_name} / pct=${ch.event_exp_pct} until=${ch.event_exp_until} max_lv=${ch.event_exp_max_level}`);
  const until = new Date(Date.now() + 12 * 3600 * 1000);
  await c.query(
    `UPDATE characters
        SET event_exp_pct = 500,
            event_exp_until = $1,
            event_exp_max_level = NULL
      WHERE id = $2`,
    [until.toISOString(), ch.id]
  );
  const { rows: after } = await c.query(
    `SELECT id, name, level, event_exp_pct, event_exp_until, event_exp_max_level FROM characters WHERE id = $1`, [ch.id]
  );
  const a = after[0];
  console.log(`후: ${a.name} Lv.${a.level} / pct=${a.event_exp_pct} until=${a.event_exp_until} max_lv=${a.event_exp_max_level ?? 'NULL'}`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
