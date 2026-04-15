const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  // 컬럼 존재 확인 후 추가
  const col = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='skills' AND column_name='element'`);
  if (col.rowCount === 0) {
    await pool.query(`ALTER TABLE skills ADD COLUMN element TEXT`);
    console.log('✓ skills.element 컬럼 추가');
  } else {
    console.log('skills.element 이미 존재');
  }

  // 소환사 스킬 원소 매핑
  const mapping = {
    '늑대 소환': 'earth',
    '골렘 소환': 'earth',
    '독수리 소환': 'lightning',
    '불정령 소환': 'fire',
    '수호수 소환': 'holy',
    '드래곤 소환': 'fire',
    '희생': 'dark',
    '피닉스 소환': 'holy',
    '하이드라 소환': 'frost',
    '영혼 폭풍': 'dark',
    '고대 용 소환': 'dark',
  };

  for (const [name, element] of Object.entries(mapping)) {
    const r = await pool.query(
      `UPDATE skills SET element=$1 WHERE class_name='summoner' AND name=$2 RETURNING id`,
      [element, name]
    );
    console.log(`  ${name} → ${element} (${r.rowCount}행)`);
  }

  // 검증
  const check = await pool.query(
    `SELECT name, element FROM skills WHERE class_name='summoner' ORDER BY required_level`
  );
  console.log('\n=== 소환사 스킬 원소 ===');
  for (const s of check.rows) console.log(`  ${s.name}: ${s.element || '(none)'}`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
