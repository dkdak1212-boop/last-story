// 코뿔소 — 반대의 균형 toggle 어뷰즈로 부풀려진 max_hp 정상화.
// 정상 max_hp = 200(start) + (level-1)*25(HP_PER_LEVEL) + spentContrib*20(HP_PER_VIT)
//   spentContrib = hasInversion ? spentDex : spentVit (start.stats 기준 초과분)
// hp 는 max_hp 로 클램프.
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const HP_PER_LEVEL = 25;
const HP_PER_VIT = 20;
const CLASS_START = {
  warrior:  { stats: { str: 15, dex: 8,  int: 4,  vit: 14 }, maxHp: 200 },
  mage:     { stats: { str: 4,  dex: 7,  int: 16, vit: 14 }, maxHp: 200 },
  cleric:   { stats: { str: 8,  dex: 6,  int: 16, vit: 14 }, maxHp: 200 },
  rogue:    { stats: { str: 10, dex: 14, int: 5,  vit: 14 }, maxHp: 200 },
  summoner: { stats: { str: 4,  dex: 6,  int: 18, vit: 14 }, maxHp: 200 },
};

(async () => {
  try {
    const r = await pool.query(
      `SELECT id, name, class_name, level, max_hp, hp, stats FROM characters WHERE name = '코뿔소'`
    );
    if (!r.rowCount) { console.log('NO CHAR 코뿔소'); return; }
    for (const c of r.rows) {
      const start = CLASS_START[c.class_name];
      if (!start) { console.log(`[skip] id=${c.id} unknown class ${c.class_name}`); continue; }

      const invR = await pool.query(
        `SELECT EXISTS(
           SELECT 1 FROM character_nodes cn
           JOIN node_definitions nd ON nd.id = cn.node_id
           WHERE cn.character_id = $1
             AND nd.effects::text LIKE '%paragon_balance_inversion%'
         ) AS ex`, [c.id]
      );
      const hasInversion = !!invR.rows[0]?.ex;

      const cur = c.stats || {};
      const spentVit = Math.max(0, (cur.vit ?? start.stats.vit) - start.stats.vit);
      const spentDex = Math.max(0, (cur.dex ?? start.stats.dex) - start.stats.dex);
      const spentContrib = hasInversion ? spentDex : spentVit;

      const correctMaxHp = start.maxHp + (c.level - 1) * HP_PER_LEVEL + spentContrib * HP_PER_VIT;
      const newHp = Math.min(c.hp, correctMaxHp);

      console.log(`[before] id=${c.id} name=${c.name} class=${c.class_name} L=${c.level} max_hp=${c.max_hp} hp=${c.hp}`);
      console.log(`         hasInversion=${hasInversion} spentVit=${spentVit} spentDex=${spentDex} contrib=${spentContrib}`);
      console.log(`[fix]    correctMaxHp=${correctMaxHp} (200 + ${c.level - 1}*25 + ${spentContrib}*20) diff=${correctMaxHp - c.max_hp}`);

      await pool.query(
        `UPDATE characters SET max_hp = $1, hp = $2 WHERE id = $3`,
        [correctMaxHp, newHp, c.id]
      );

      const after = await pool.query(`SELECT max_hp, hp FROM characters WHERE id = $1`, [c.id]);
      console.log(`[after]  max_hp=${after.rows[0].max_hp} hp=${after.rows[0].hp}`);
    }
  } finally { await pool.end(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
