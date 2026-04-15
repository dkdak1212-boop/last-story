// 레벨 대비 오버한 캐릭터 스탯 비례 클램프
// - starting 스탯은 고정 (시작값 유지)
// - 할당 초과분만 비율로 축소: (expected-start) / (actual-start)
// - cri/spd 포함 모든 스탯에 동일 비율 적용
// - unspent stat_points 는 그대로 유지

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 2 });

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
  `);
  console.log(`스캔: ${r.rowCount}명`);

  const client = await pool.connect();
  let clampedCount = 0;
  let totalRemoved = 0;
  try {
    await client.query('BEGIN');
    for (const row of r.rows) {
      const start = STARTING[row.class_name];
      if (!start) continue;
      const startTotal = sumStats(start);
      const gained = (row.level - 1) * STAT_POINTS_PER_LEVEL;
      const unspent = row.stat_points || 0;
      const expected = startTotal + gained - unspent;
      const actual = sumStats(row.stats || {});
      if (actual <= expected) continue;

      // 비례 축소
      const curAlloc = actual - startTotal;
      const expAlloc = Math.max(0, expected - startTotal);
      if (curAlloc <= 0) continue;
      const scale = expAlloc / curAlloc;

      const oldStats = { ...row.stats };
      const newStats = {};
      let newTotal = 0;
      for (const key of ['str', 'dex', 'int', 'vit', 'spd', 'cri']) {
        const startVal = start[key] || 0;
        const curVal = oldStats[key] || 0;
        const allocPortion = curVal - startVal;
        let newVal;
        if (allocPortion <= 0) {
          newVal = Math.min(curVal, startVal); // 시작 이하면 그대로
        } else {
          const newAlloc = Math.round(allocPortion * scale);
          newVal = startVal + Math.max(0, newAlloc);
        }
        newStats[key] = newVal;
        newTotal += newVal;
      }

      // 반올림 오차 교정: newTotal 이 expected 와 약간 다를 수 있음
      let diff = newTotal - expected;
      if (diff !== 0) {
        // 가장 큰 할당 스탯에서 가감
        const keysByAlloc = ['str','dex','int','vit','spd','cri']
          .map(k => ({ k, alloc: (newStats[k] || 0) - (start[k] || 0) }))
          .sort((a, b) => b.alloc - a.alloc);
        let i = 0;
        while (diff !== 0 && i < keysByAlloc.length) {
          const tgt = keysByAlloc[i].k;
          const startVal = start[tgt] || 0;
          if (diff > 0 && newStats[tgt] > startVal) {
            const take = Math.min(diff, newStats[tgt] - startVal);
            newStats[tgt] -= take;
            diff -= take;
          } else if (diff < 0) {
            newStats[tgt] -= diff; // diff negative → add
            diff = 0;
          } else {
            i++;
          }
        }
      }

      clampedCount++;
      totalRemoved += (actual - sumStats(newStats));

      await client.query(
        `UPDATE characters SET stats = $1::jsonb WHERE id = $2`,
        [JSON.stringify(newStats), row.id]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  console.log(`\n클램프 완료: ${clampedCount}명`);
  console.log(`제거된 스탯 총합: ${totalRemoved}`);

  // 재검증
  const verify = await pool.query(`
    SELECT id, name, class_name, level, stats, stat_points FROM characters
    WHERE class_name IN ('warrior','mage','cleric','rogue','summoner')
  `);
  let stillOver = 0;
  for (const row of verify.rows) {
    const start = STARTING[row.class_name];
    if (!start) continue;
    const expected = sumStats(start) + (row.level-1)*2 - (row.stat_points||0);
    const actual = sumStats(row.stats||{});
    if (actual > expected) stillOver++;
  }
  console.log(`재검증: 여전히 오버 ${stillOver}명`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
