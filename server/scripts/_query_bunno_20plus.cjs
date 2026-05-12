// 분노 시공 분쇄 대검 +20 위 강화 단계별 성공/실패 통계
const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const ch = await c.query(`SELECT id FROM characters WHERE name = '분노' LIMIT 1`);
    if (ch.rowCount === 0) { console.log('캐릭 없음.'); return; }
    const cid = ch.rows[0].id;

    const r = await c.query(
      `SELECT from_level, success, destroyed
         FROM enhance_log
        WHERE character_id = $1
          AND item_name = '시공 분쇄 대검'
          AND from_level >= 20
        ORDER BY from_level, created_at`,
      [cid]
    );
    if (r.rowCount === 0) { console.log('+20 이상 강화 로그 없음.'); return; }

    // 단계별 집계
    const byLvl = new Map();
    for (const row of r.rows) {
      const k = row.from_level;
      const v = byLvl.get(k) || { success: 0, fail: 0, destroyed: 0 };
      if (row.success) v.success++;
      else v.fail++;
      if (row.destroyed) v.destroyed++;
      byLvl.set(k, v);
    }

    console.log('=== 분노 — 시공 분쇄 대검 +20 위 강화 단계별 시도 ===\n');
    console.log('단계         | 성공 | 실패 | 파괴 | 총 시도 | 성공률');
    console.log('-'.repeat(64));
    let totalS = 0, totalF = 0, totalD = 0;
    for (const k of [...byLvl.keys()].sort((a,b) => a - b)) {
      const v = byLvl.get(k);
      const total = v.success + v.fail;
      const rate = ((v.success / total) * 100).toFixed(1);
      console.log(`+${k} → +${k+1}    | ${String(v.success).padStart(4)} | ${String(v.fail).padStart(4)} | ${String(v.destroyed).padStart(4)} | ${String(total).padStart(7)} | ${rate}%`);
      totalS += v.success; totalF += v.fail; totalD += v.destroyed;
    }
    console.log('-'.repeat(64));
    const tot = totalS + totalF;
    console.log(`합계         | ${String(totalS).padStart(4)} | ${String(totalF).padStart(4)} | ${String(totalD).padStart(4)} | ${String(tot).padStart(7)} | ${((totalS/tot)*100).toFixed(1)}%`);
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
