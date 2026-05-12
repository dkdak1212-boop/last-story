// 분노 시공 분쇄 대검 강화 총 골드 계산 (enhance_log 기반)
const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

// server/src/routes/enhance.ts getEnhanceInfo 와 동일 (next = currentLevel + 1)
function costForNext(next) {
  const lv = 100;
  if (next <= 3)        return 50 * lv;
  if (next <= 6)        return 200 * lv;
  if (next <= 9)        return 500 * lv;
  if (next <= 12)       return 2000 * lv;
  if (next <= 14)       return 5000 * lv;
  if (next === 15)      return 2_500_000;
  if (next <= 18)       return 2_500_000 * (next - 14);
  if (next <= 20)       return 2_500_000 * (next - 14);
  if (next <= 30)       return 50_000_000 + (next - 21) * 10_000_000;
  return 0;
}

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const ch = await c.query(`SELECT id FROM characters WHERE name = '분노' LIMIT 1`);
    if (ch.rowCount === 0) { console.log('캐릭 없음.'); return; }
    const cid = ch.rows[0].id;

    const r = await c.query(
      `SELECT from_level, success
         FROM enhance_log
        WHERE character_id = $1 AND item_name = '시공 분쇄 대검'
        ORDER BY created_at`,
      [cid]
    );
    if (r.rowCount === 0) { console.log('로그 없음'); return; }

    // 단계별 골드 집계 (success/fail 무관 — 시도마다 골드 차감됨)
    const byLvl = new Map();
    let totalAll = 0;
    let total20 = 0;
    let totalPre = 0;
    for (const row of r.rows) {
      const next = row.from_level + 1;
      const cost = costForNext(next);
      const k = row.from_level;
      const v = byLvl.get(k) || { tries: 0, gold: 0 };
      v.tries++;
      v.gold += cost;
      byLvl.set(k, v);
      totalAll += cost;
      if (k >= 20) total20 += cost;
      else totalPre += cost;
    }

    console.log('=== 분노 — 시공 분쇄 대검 단계별 골드 소비 (시도당 비용 누적) ===\n');
    console.log('단계         | 시도 | 단가(G)        | 합계(G)');
    console.log('-'.repeat(60));
    for (const k of [...byLvl.keys()].sort((a,b) => a - b)) {
      const v = byLvl.get(k);
      const unit = costForNext(k + 1);
      console.log(`+${String(k).padStart(2)} → +${String(k+1).padStart(2)}    | ${String(v.tries).padStart(4)} | ${unit.toLocaleString().padStart(13)} | ${v.gold.toLocaleString().padStart(15)}`);
    }
    console.log('-'.repeat(60));
    console.log(`\n+0~+19 누적: ${totalPre.toLocaleString()}G`);
    console.log(`+20~+29 누적: ${total20.toLocaleString()}G`);
    console.log(`★ 총 강화 골드: ${totalAll.toLocaleString()}G (${(totalAll / 1e9).toFixed(2)}B)`);
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
