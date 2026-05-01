const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  // 현재 이벤트 종료 시각 조회
  const { rows: setts } = await c.query(
    `SELECT key, value FROM server_settings WHERE key IN ('new_char_exp_pct','new_char_exp_until')`
  );
  const m = Object.fromEntries(setts.map(r => [r.key, r.value]));
  const pct = Number(m.new_char_exp_pct || 300);
  const until = m.new_char_exp_until ? new Date(m.new_char_exp_until) : new Date(Date.now() + 30 * 24 * 3600 * 1000);
  console.log(`이벤트 설정: pct=${pct}, until=${until.toISOString()}`);

  // 캐릭 조회
  const { rows: chs } = await c.query(
    `SELECT id, name, class_name, level, event_exp_pct, event_exp_until, event_exp_max_level
       FROM characters WHERE name = $1`, ['신라면']
  );
  if (chs.length === 0) { console.log('캐릭터 없음: 신라면'); return; }
  const ch = chs[0];
  console.log(`전: ${ch.name} Lv.${ch.level} ${ch.class_name} / pct=${ch.event_exp_pct} until=${ch.event_exp_until} max_lv=${ch.event_exp_max_level}`);

  // 신라면에게 이벤트 버프 부여 (300% + Lv.95 상한)
  await c.query(
    `UPDATE characters SET event_exp_pct = $1, event_exp_until = $2, event_exp_max_level = 95
      WHERE id = $3`,
    [pct, until.toISOString(), ch.id]
  );
  const { rows: after } = await c.query(
    `SELECT id, name, level, event_exp_pct, event_exp_until, event_exp_max_level FROM characters WHERE id = $1`, [ch.id]
  );
  const a = after[0];
  console.log(`후: ${a.name} Lv.${a.level} / pct=${a.event_exp_pct} until=${a.event_exp_until} max_lv=${a.event_exp_max_level}`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
