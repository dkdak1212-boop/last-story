const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  // 직업별 damage 스킬 총합 계수 비교
  const r = await pool.query(`
    SELECT class_name,
           COUNT(*) FILTER (WHERE kind = 'damage') AS dmg_cnt,
           ROUND(AVG(damage_mult) FILTER (WHERE kind = 'damage' AND damage_mult > 0), 2) AS avg_mult,
           ROUND(MAX(damage_mult) FILTER (WHERE kind = 'damage'), 2) AS max_mult,
           ROUND(SUM(damage_mult) FILTER (WHERE kind = 'damage'), 2) AS sum_mult,
           COUNT(*) FILTER (WHERE kind = 'buff') AS buff_cnt,
           COUNT(*) FILTER (WHERE kind = 'debuff') AS debuff_cnt,
           COUNT(*) FILTER (WHERE kind = 'heal') AS heal_cnt
    FROM skills GROUP BY class_name ORDER BY class_name
  `);
  console.log('=== 직업별 스킬 계수 비교 ===');
  for (const row of r.rows) {
    console.log(`[${row.class_name}] dmg스킬 ${row.dmg_cnt}개 | 평균계수 ${row.avg_mult} | 최대 ${row.max_mult} | 합계 ${row.sum_mult} | buff ${row.buff_cnt} | debuff ${row.debuff_cnt} | heal ${row.heal_cnt}`);
  }

  // 직업별 상위 5 스킬
  console.log('\n=== 직업별 damage 스킬 TOP 5 (계수순) ===');
  for (const cls of ['warrior', 'mage', 'cleric', 'rogue']) {
    const s = await pool.query(`
      SELECT name, damage_mult, cooldown_actions, effect_type, required_level
      FROM skills WHERE class_name = $1 AND kind = 'damage' AND damage_mult > 0
      ORDER BY damage_mult DESC LIMIT 5
    `, [cls]);
    console.log(`\n[${cls}]`);
    for (const sk of s.rows) {
      const dps = (sk.damage_mult / Math.max(1, sk.cooldown_actions)).toFixed(2);
      console.log(`  Lv${sk.required_level} ${sk.name}: x${sk.damage_mult} cd=${sk.cooldown_actions} (DPS효율=${dps}) ${sk.effect_type}`);
    }
  }

  // 스탯 계수 비교 (formulas.ts: str*1.0=atk, int*1.5=matk)
  console.log('\n=== 기본 스탯→데미지 계수 ===');
  console.log('전사: STR×1.0 = ATK (물리)');
  console.log('마법사: INT×1.5 = MATK (마법)');
  console.log('성직자: INT×1.5 = MATK (마법) + 쉴드비례 시너지');
  console.log('도적: STR×1.0 = ATK (물리) + 독/도트 스택');

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
