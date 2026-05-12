// 종실에게 길드 메달 500개 지급
const { Client } = require('pg');

const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
const GRANT = 500;

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const ch = await c.query(
      `SELECT id, name, user_id, COALESCE(guild_boss_medals, 0)::int AS medals
         FROM characters WHERE name = $1`,
      ['종실']
    );
    if (ch.rows.length === 0) {
      console.log('character 종실 not found');
      return;
    }
    if (ch.rows.length > 1) {
      console.log('동명이인 다수 — 확인 필요:');
      for (const r of ch.rows) console.log(' ', r.id, r.name, 'user_id=' + r.user_id, 'medals=' + r.medals);
      return;
    }
    const row = ch.rows[0];
    console.log(`종실 id=${row.id} user_id=${row.user_id} before=${row.medals}`);
    const r = await c.query(
      `UPDATE characters SET guild_boss_medals = guild_boss_medals + $1
        WHERE id = $2 RETURNING guild_boss_medals`,
      [GRANT, row.id]
    );
    console.log(`+${GRANT} → after=${r.rows[0].guild_boss_medals}`);
  } finally {
    await c.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
