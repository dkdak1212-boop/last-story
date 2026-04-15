// 미사용 stat_points 가 레벨 기대치(level-1 × 2)를 초과한 캐릭터 트림
// 할당 스탯은 이미 정상인 경우 → stat_points 자체 축소

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const STARTING = {
  warrior:  { str: 15, dex: 8,  int: 4,  vit: 14, spd: 200, cri: 5 },
  mage:     { str: 4,  dex: 7,  int: 16, vit: 14, spd: 200, cri: 5 },
  cleric:   { str: 8,  dex: 6,  int: 16, vit: 14, spd: 200, cri: 5 },
  rogue:    { str: 10, dex: 14, int: 5,  vit: 14, spd: 200, cri: 5 },
  summoner: { str: 4,  dex: 6,  int: 18, vit: 14, spd: 200, cri: 5 },
};
function sumStats(s){return (s.str||0)+(s.dex||0)+(s.int||0)+(s.vit||0)+(s.spd||0)+(s.cri||0);}

(async () => {
  const r = await pool.query(`
    SELECT id, name, class_name, level, stats, stat_points
    FROM characters WHERE class_name IN ('warrior','mage','cleric','rogue','summoner')
  `);
  let fixed = 0;
  for (const row of r.rows) {
    const start = STARTING[row.class_name];
    if (!start) continue;
    const startTotal = sumStats(start);
    const gained = (row.level - 1) * 2;
    const unspent = row.stat_points || 0;
    const actual = sumStats(row.stats || {});
    const allocated = actual - startTotal;
    // 총 분배 가능한 스탯 포인트 = allocated + unspent ≤ gained
    const totalPoints = allocated + unspent;
    if (totalPoints > gained) {
      const newUnspent = Math.max(0, gained - allocated);
      await pool.query(
        `UPDATE characters SET stat_points = $1 WHERE id = $2`,
        [newUnspent, row.id]
      );
      console.log(`  #${row.id} [${row.name}] ${row.class_name} lv${row.level} | unspent ${unspent} → ${newUnspent} (allocated ${allocated}, gained ${gained})`);
      fixed++;
    }
  }
  console.log(`\n트림: ${fixed}명`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
