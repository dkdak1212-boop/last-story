const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  // 90~100 사냥터 (required_level 기준) 필드 조회
  const fields = await pool.query(`
    SELECT id, name, required_level, monster_pool
    FROM fields WHERE required_level >= 90
    ORDER BY required_level
  `);
  console.log(`90+ 필드 ${fields.rows.length}개\n`);

  const monsterIds = new Set();
  for (const f of fields.rows) {
    console.log(`[${f.name}] Lv.${f.required_level} 몬스터: ${f.monster_pool}`);
    for (const mid of f.monster_pool) monsterIds.add(mid);
  }

  if (monsterIds.size === 0) { console.log('대상 몬스터 없음'); await pool.end(); return; }

  const ids = [...monsterIds];

  // 변경 전 확인
  const before = await pool.query(`SELECT id, name, level, max_hp, stats FROM monsters WHERE id = ANY($1::int[])`, [ids]);
  console.log('\n=== 변경 전 ===');
  for (const m of before.rows) {
    console.log(`  ${m.name} Lv.${m.level}: HP=${m.max_hp} stats=${JSON.stringify(m.stats)}`);
  }

  // HP ×3, 스탯(공/방) ×2
  for (const m of before.rows) {
    const newHp = m.max_hp * 3;
    const newStats = { ...m.stats };
    newStats.str = Math.round((newStats.str || 0) * 2);
    newStats.int = Math.round((newStats.int || 0) * 2);
    newStats.vit = Math.round((newStats.vit || 0) * 2);

    await pool.query(
      `UPDATE monsters SET max_hp = $1, stats = $2::jsonb WHERE id = $3`,
      [newHp, JSON.stringify(newStats), m.id]
    );
  }

  // 변경 후 확인
  const after = await pool.query(`SELECT id, name, level, max_hp, stats FROM monsters WHERE id = ANY($1::int[])`, [ids]);
  console.log('\n=== 변경 후 ===');
  for (const m of after.rows) {
    console.log(`  ${m.name} Lv.${m.level}: HP=${m.max_hp} stats=${JSON.stringify(m.stats)}`);
  }

  console.log(`\n${ids.length}마리 몬스터 강화 완료`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
