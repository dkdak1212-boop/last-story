// Railway DB에 직접 접속해서 rollOne 재현 (rerollPrefixValues 공식)

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  const r = await pool.query(`SELECT id, name, tier, stat_key, min_val, max_val FROM item_prefixes ORDER BY id`);
  const prefixes = r.rows;
  console.log(`loaded ${prefixes.length} prefixes`);
  const p13 = prefixes.find(x => x.id === 13);
  const p77 = prefixes.find(x => x.id === 77);
  console.log('13:', p13 ? JSON.stringify(p13) : 'MISSING');
  console.log('77:', p77 ? JSON.stringify(p77) : 'MISSING');

  // whole reroll simulation
  const itemLevel = 35;
  const levelScale = 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;
  const rollOne = (pid) => {
    const p = prefixes.find(x => x.id === pid);
    if (!p) return null;
    const baseValue = p.min_val + Math.floor(Math.random() * (p.max_val - p.min_val + 1));
    const value = Math.max(1, Math.round(baseValue * levelScale));
    return { stat: p.stat_key, value };
  };

  console.log('\n--- whole reroll [13, 77] ---');
  for (let i = 0; i < 5; i++) {
    const bonusStats = {};
    for (const pid of [13, 77]) {
      const roll = rollOne(pid);
      if (!roll) continue;
      bonusStats[roll.stat] = (bonusStats[roll.stat] ?? 0) + roll.value;
    }
    console.log(i, ':', JSON.stringify(bonusStats));
  }

  // 또한 실제 쿼리로 '13과 77이 같은 stat_key인 경우가 있는지' 확인
  const dup = await pool.query(`
    SELECT stat_key, COUNT(DISTINCT id) cnt, array_agg(id ORDER BY id) ids
    FROM item_prefixes WHERE id IN (13, 77) GROUP BY stat_key
  `);
  console.log('\ndup by stat:', JSON.stringify(dup.rows));

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
