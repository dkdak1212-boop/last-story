const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const r = await c.query(`SELECT id, name, level, class_name, max_hp, hp, stats FROM characters WHERE name = '성직자' LIMIT 1`);
    if (r.rowCount === 0) { console.log('없음'); return; }
    const ch = r.rows[0];
    console.log(`=== 성직자 (id=${ch.id}, ${ch.class_name} L${ch.level}) ===`);
    console.log(`base max_hp: ${ch.max_hp}`);
    console.log(`stats: ${JSON.stringify(ch.stats)}`);
    // 장비
    const eq = await c.query(`
      SELECT ce.slot, i.name, ce.enhance_level, COALESCE(ce.quality, 0) AS quality, i.stats, ce.prefix_stats
      FROM character_equipped ce JOIN items i ON i.id = ce.item_id WHERE ce.character_id = $1`, [ch.id]);
    console.log(`\n장비 ${eq.rowCount}개:`);
    let totalAtk = 0, totalMatk = 0, totalVit = 0, totalHp = 0;
    for (const row of eq.rows) {
      const s = row.stats || {};
      const lvl = row.enhance_level || 0;
      const a = Math.min(10, lvl) * 0.05;
      const b = Math.max(0, Math.min(10, lvl - 10)) * 0.10;
      const cc = Math.max(0, Math.min(10, lvl - 20)) * 0.15;
      const enhMult = 1 + a + b + cc;
      const qBonus = (row.quality || 0) / 100;
      const mult = enhMult + qBonus;
      const atk = Math.round((s.atk || 0) * mult);
      const matk = Math.round((s.matk || 0) * mult);
      const vit = Math.round((s.vit || 0) * mult);
      const hp = Math.round((s.hp || 0) * mult);
      totalAtk += atk;
      totalMatk += matk;
      totalVit += vit;
      totalHp += hp;
      const ps = row.prefix_stats || {};
      const pVit = ps.vit || 0;
      const pHp = ps.hp || 0;
      console.log(`  ${row.slot}: ${row.name} +${lvl} (atk=${atk}, matk=${matk}, vit=${vit}, hp=${hp}, prefix_vit=${pVit}, prefix_hp=${pHp})`);
    }
    console.log(`\n장비 합계: atk=${totalAtk}, matk=${totalMatk}, vit=${totalVit}, hp=${totalHp}`);
    // maxHp 추정: base + equipVit×20 + bonusHp + 보너스 비율
    const estMaxHp = ch.max_hp + totalVit * 20 + totalHp;
    console.log(`추정 maxHp (직업 패시브/접두사 % 미반영): ${estMaxHp}`);
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
