// 지정 캐릭터에게 길드보스 입장키(keys_remaining) +2 충전 (오늘 KST 기준)
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
const names = ['깨양갱','양갱','001','릴파','홍빠','홍씨','전사2','무심했던나를','o도적o','거의','닌자','짜릿한너'];
(async () => {
  await c.connect();
  const today = (await c.query(`SELECT (NOW() AT TIME ZONE 'Asia/Seoul')::date::text AS d`)).rows[0].d;
  for (const name of names) {
    const cr = await c.query(`SELECT id FROM characters WHERE name = $1`, [name]);
    if (cr.rowCount === 0) { console.log(`❌ 없음: ${name}`); continue; }
    const cid = cr.rows[0].id;
    // 오늘자 row upsert — 없으면 기본 2키 생성 후 +2
    await c.query(
      `INSERT INTO guild_boss_daily (character_id, date, keys_remaining, daily_damage_total)
       VALUES ($1, $2, 4, 0)
       ON CONFLICT (character_id, date) DO UPDATE SET keys_remaining = guild_boss_daily.keys_remaining + 2`,
      [cid, today]
    );
    const chk = await c.query(`SELECT keys_remaining FROM guild_boss_daily WHERE character_id = $1 AND date = $2`, [cid, today]);
    console.log(`✓ ${name} (id=${cid}) keys_remaining=${chk.rows[0].keys_remaining}`);
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
