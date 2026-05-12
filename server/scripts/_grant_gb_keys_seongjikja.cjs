// 성직자 캐릭 길드보스 입장키 +2 지급 (오늘자 keys_remaining 에 누적)
const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
const NAME = '성직자';
const GRANT = 2;

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const ch = await c.query(`SELECT id, name, class_name, level FROM characters WHERE name = $1 LIMIT 1`, [NAME]);
    if (ch.rowCount === 0) { console.log(`캐릭 '${NAME}' 없음`); return; }
    const cid = ch.rows[0].id;
    console.log(`타겟: ${ch.rows[0].name} (id=${cid}, ${ch.rows[0].class_name} L${ch.rows[0].level})`);

    // 오늘자 row 확인 (KST)
    const today = await c.query(`SELECT keys_remaining, daily_damage_total
                                   FROM guild_boss_daily
                                  WHERE character_id = $1
                                    AND date = (NOW() AT TIME ZONE 'Asia/Seoul')::date`, [cid]);
    const before = today.rowCount > 0 ? today.rows[0].keys_remaining : null;
    console.log(`지급 전 — keys_remaining: ${before === null ? '(오늘 행 없음)' : before}`);

    // upsert: 없으면 (default 2) + GRANT, 있으면 +GRANT
    await c.query(
      `INSERT INTO guild_boss_daily (character_id, date, keys_remaining, daily_damage_total)
       VALUES ($1, (NOW() AT TIME ZONE 'Asia/Seoul')::date, $2, 0)
       ON CONFLICT (character_id, date)
       DO UPDATE SET keys_remaining = guild_boss_daily.keys_remaining + $3`,
      [cid, 2 + GRANT, GRANT]
    );

    const after = await c.query(`SELECT keys_remaining FROM guild_boss_daily
                                  WHERE character_id = $1
                                    AND date = (NOW() AT TIME ZONE 'Asia/Seoul')::date`, [cid]);
    console.log(`지급 후 — keys_remaining: ${after.rows[0].keys_remaining}`);
    console.log(`★ +${GRANT} 지급 완료`);
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
