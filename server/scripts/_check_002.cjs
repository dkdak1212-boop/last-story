const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const r = await c.query(`SELECT id, name, level, class_name, max_hp, hp, stats FROM characters WHERE name = '002' LIMIT 1`);
    if (r.rowCount === 0) { console.log('002 캐릭 없음'); return; }
    const ch = r.rows[0];
    console.log(`=== 002 (id=${ch.id}, ${ch.class_name} L${ch.level}) base max_hp=${ch.max_hp} ===`);
    console.log(`stats: ${JSON.stringify(ch.stats)}`);
    const eq = await c.query(`
      SELECT ce.slot, i.name, ce.enhance_level, COALESCE(ce.quality, 0) AS quality, i.stats, ce.prefix_stats
      FROM character_equipped ce JOIN items i ON i.id = ce.item_id WHERE ce.character_id = $1`, [ch.id]);
    let totalAtk = 0, totalMatk = 0, totalVit = 0, totalHp = 0, totalMHpPct = 0;
    for (const row of eq.rows) {
      const s = row.stats || {};
      const lvl = row.enhance_level || 0;
      const a = Math.min(10, lvl) * 0.05;
      const b = Math.max(0, Math.min(10, lvl - 10)) * 0.10;
      const cc = Math.max(0, Math.min(10, lvl - 20)) * 0.15;
      const enhMult = 1 + a + b + cc;
      const qBonus = (row.quality || 0) / 100;
      const mult = enhMult + qBonus;
      const matk = Math.round((s.matk || 0) * mult);
      const vit = Math.round((s.vit || 0) * mult);
      const hp = Math.round((s.hp || 0) * mult);
      totalAtk += Math.round((s.atk || 0) * mult);
      totalMatk += matk;
      totalVit += vit;
      totalHp += hp;
      const ps = row.prefix_stats || {};
      const prefixMult = 1 + lvl * 0.025;
      const pVit = Math.round((ps.vit || 0) * prefixMult);
      const pHp = Math.round((ps.hp || 0) * prefixMult);
      const pMHpPct = (ps.max_hp_pct || 0);
      totalVit += pVit; totalHp += pHp;
      totalMHpPct += pMHpPct;
      console.log(`  ${row.slot}: ${row.name} +${lvl} matk=${matk} vit=${vit} hp=${hp} pVit=${pVit} pHp=${pHp} pMaxHp%=${pMHpPct}`);
    }
    console.log(`\n장비 합계: matk=${totalMatk} vit=${totalVit} hp=${totalHp} max_hp_pct=${totalMHpPct}%`);
    let baseHp = ch.max_hp + totalVit * 20 + totalHp;
    if (totalMHpPct > 0) baseHp = Math.round(baseHp * (1 + totalMHpPct/100));
    console.log(`추정 effective maxHp (룬/노드/세트 미반영): ${baseHp}`);
    // 종언 2900층 보스 #516 끝없는 심판자: mdef base=45000, dr_pct=45
    const floor = 2900;
    const scale = 1 + (floor - 1) * 0.03;
    const mdefScaled = 45000 * scale;
    const mdefHalf = mdefScaled * 0.5;
    console.log(`\n=== 시뮬레이션 (${floor}층 보스 #516 끝없는 심판자, scale=×${scale.toFixed(2)}) ===`);
    console.log(`scaled mdef = ${Math.round(mdefScaled).toLocaleString()}, mdef × 0.5 = ${Math.round(mdefHalf).toLocaleString()}`);
    console.log(`\n천상강림 flat = max(1, maxHp(${baseHp}) × 15 - mdefHalf(${Math.round(mdefHalf)})) = max(1, ${baseHp*15 - Math.round(mdefHalf)})`);
    const flat15 = Math.max(1, baseHp * 15 - Math.round(mdefHalf));
    console.log(`→ ${flat15} (음수 → floor 1 일 수도)`);
    console.log(`신의 타격 flat = max(1, maxHp × 20 - mdefHalf) = ${Math.max(1, baseHp*20 - Math.round(mdefHalf))}`);
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
