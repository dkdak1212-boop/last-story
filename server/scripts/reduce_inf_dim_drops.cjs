// 무한의 차원 유니크(800~838)의 현재 드롭률을 50% 인하 (×0.5)
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const FIELD_MONSTERS = [115, 116];
const ID_MIN = 800, ID_MAX = 838;
const FACTOR = 0.5;

(async () => {
  for (const mid of FIELD_MONSTERS) {
    const r = await pool.query(`SELECT name, drop_table FROM monsters WHERE id = $1`, [mid]);
    const cur = Array.isArray(r.rows[0].drop_table) ? r.rows[0].drop_table : [];
    let touched = 0;
    let exampleBefore = null, exampleAfter = null;
    const next = cur.map(d => {
      if (d.itemId >= ID_MIN && d.itemId <= ID_MAX) {
        if (exampleBefore === null) exampleBefore = d.chance;
        const newChance = d.chance * FACTOR;
        if (exampleAfter === null) exampleAfter = newChance;
        touched++;
        return { ...d, chance: newChance };
      }
      return d;
    });
    await pool.query(`UPDATE monsters SET drop_table = $1::jsonb WHERE id = $2`, [JSON.stringify(next), mid]);
    console.log(`${r.rows[0].name}(${mid}): ${touched}건 수정 (chance ${exampleBefore} → ${exampleAfter})`);
  }

  // 검증
  const v = await pool.query(`SELECT id, drop_table FROM monsters WHERE id = ANY($1::int[])`, [FIELD_MONSTERS]);
  for (const r of v.rows) {
    const sample = (r.drop_table || []).find(d => d.itemId >= ID_MIN && d.itemId <= ID_MAX);
    console.log(`  몬스터 ${r.id} 샘플: ${JSON.stringify(sample)}`);
  }

  // 기대치
  const newChance = 0.00005 * FACTOR;
  console.log(`\n기대치: 2 몹 × 250킬/일 × ${newChance} × 39종 = ${(2 * 250 * newChance * 39).toFixed(2)} 드롭/일`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
