// 상어 (char_id=1886, 마법사, Lv.87) — 경험치 300% (3배) 버프, Lv.95 도달 시 자동 종료
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  await c.query(
    `UPDATE characters
        SET personal_exp_mult = 3.0,
            personal_exp_mult_max_level = 95
      WHERE name = $1`,
    ['상어']
  );
  const { rows } = await c.query(
    `SELECT id, name, level, personal_exp_mult, personal_exp_mult_max_level
       FROM characters WHERE name = $1`, ['상어']
  );
  for (const r of rows) {
    console.log(`char_id=${r.id} ${r.name} Lv.${r.level} → mult=${r.personal_exp_mult} until_level=${r.personal_exp_mult_max_level}`);
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
