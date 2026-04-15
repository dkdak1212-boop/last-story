// 레벨 대비 기본 스탯 오버 감사
// 기준: starting_total + (level-1) * 2 + 허용 버퍼(업적/보상 감안)
// 초과 캐릭터 출력

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const STARTING = {
  warrior:  { str: 15, dex: 8,  int: 4,  vit: 14, spd: 200, cri: 5 },
  mage:     { str: 4,  dex: 7,  int: 16, vit: 14, spd: 200, cri: 5 },
  cleric:   { str: 8,  dex: 6,  int: 16, vit: 14, spd: 200, cri: 5 },
  rogue:    { str: 10, dex: 14, int: 5,  vit: 14, spd: 200, cri: 5 },
  summoner: { str: 4,  dex: 6,  int: 18, vit: 14, spd: 200, cri: 5 },
};
const STAT_POINTS_PER_LEVEL = 2;

function sumStats(s) {
  return (s.str||0)+(s.dex||0)+(s.int||0)+(s.vit||0)+(s.spd||0)+(s.cri||0);
}

(async () => {
  const r = await pool.query(`
    SELECT id, name, class_name, level, stats, stat_points
    FROM characters
    WHERE class_name IN ('warrior','mage','cleric','rogue','summoner')
    ORDER BY level DESC
  `);
  console.log(`총 ${r.rowCount}개 캐릭터 스캔`);

  const overflow = [];
  for (const row of r.rows) {
    const start = STARTING[row.class_name];
    if (!start) continue;
    const startTotal = sumStats(start);
    const gainedPoints = (row.level - 1) * STAT_POINTS_PER_LEVEL;
    const unspentPoints = row.stat_points || 0;
    // 스탯 total = 시작 + (할당된 포인트) = 시작 + (레벨업 얻은 포인트 - 미사용 포인트)
    const expected = startTotal + gainedPoints - unspentPoints;
    const actual = sumStats(row.stats || {});
    const diff = actual - expected;

    if (diff > 0) {
      overflow.push({
        id: row.id, name: row.name, cls: row.class_name, lv: row.level,
        stats: row.stats, expected, actual, diff, unspent: unspentPoints,
      });
    }
  }

  overflow.sort((a, b) => b.diff - a.diff);
  console.log(`\n=== 오버 캐릭터 ${overflow.length}명 ===`);
  for (const o of overflow.slice(0, 30)) {
    console.log(`  #${o.id} [${o.name}] ${o.cls} lv${o.lv} | 기대=${o.expected} 실측=${o.actual} 초과=+${o.diff} 미사용=${o.unspent}`);
    console.log(`    stats: ${JSON.stringify(o.stats)}`);
  }
  if (overflow.length > 30) console.log(`  ... 외 ${overflow.length - 30}명`);

  // 초과량 범위 집계
  const buckets = { '1-10': 0, '11-50': 0, '51-100': 0, '101-500': 0, '501+': 0 };
  for (const o of overflow) {
    if (o.diff <= 10) buckets['1-10']++;
    else if (o.diff <= 50) buckets['11-50']++;
    else if (o.diff <= 100) buckets['51-100']++;
    else if (o.diff <= 500) buckets['101-500']++;
    else buckets['501+']++;
  }
  console.log(`\n=== 초과량 분포 ===`);
  for (const [k, v] of Object.entries(buckets)) console.log(`  ${k}: ${v}명`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
