// 길드 보스 통행증(키) 2개씩 지급 — 돚거지 / 내꺼야 / 난도적이야
// guild_boss_daily(character_id, date, keys_remaining, daily_damage_total)
// 오늘(KST) row 없으면 INSERT (기본 2 + 지급 2 = 4), 있으면 += 2.
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const TARGETS = ['돚거지', '내꺼야', '난도적이야'];
const QTY = 2;

(async () => {
  try {
    const dr = await pool.query("SELECT (NOW() AT TIME ZONE 'Asia/Seoul')::date AS d");
    const today = dr.rows[0].d;
    console.log(`[today-kst] ${today}`);

    for (const name of TARGETS) {
      const r = await pool.query('SELECT id, name FROM characters WHERE name = $1', [name]);
      if (!r.rowCount) { console.log(`[skip] NO CHAR ${name}`); continue; }
      const cid = r.rows[0].id;
      // 오늘 row 확보
      const exist = await pool.query(
        'SELECT keys_remaining FROM guild_boss_daily WHERE character_id = $1 AND date = $2',
        [cid, today]
      );
      let before;
      if (!exist.rowCount) {
        await pool.query(
          `INSERT INTO guild_boss_daily (character_id, date, keys_remaining, daily_damage_total)
           VALUES ($1, $2, $3, 0)`,
          [cid, today, 2 + QTY]
        );
        before = 0;
      } else {
        before = Number(exist.rows[0].keys_remaining);
        await pool.query(
          'UPDATE guild_boss_daily SET keys_remaining = keys_remaining + $1 WHERE character_id = $2 AND date = $3',
          [QTY, cid, today]
        );
      }
      const after = await pool.query(
        'SELECT keys_remaining FROM guild_boss_daily WHERE character_id = $1 AND date = $2',
        [cid, today]
      );
      console.log(`[ok] ${name} (id=${cid}) keys ${before} → ${after.rows[0].keys_remaining}  (+${QTY})`);
    }
  } finally {
    await pool.end();
  }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
