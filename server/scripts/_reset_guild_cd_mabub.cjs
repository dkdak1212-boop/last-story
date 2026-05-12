const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const before = await c.query(`SELECT id, name, level, guild_cooldown_until FROM characters WHERE name = $1`, ['마법']);
    if (before.rowCount === 0) { console.log("'마법' 캐릭 없음"); return; }
    for (const r of before.rows) {
      console.log(`#${r.id} ${r.name} (L${r.level})  현재 cooldown: ${r.guild_cooldown_until}`);
    }
    const upd = await c.query(`UPDATE characters SET guild_cooldown_until = NULL WHERE name = $1 RETURNING id`, ['마법']);
    console.log(`✅ ${upd.rowCount}개 캐릭 길드 재가입 cooldown 초기화`);
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
