// 소환사 기본기 교체: 늑대 소환 cd 0 → 2, 신규 기본기 '영혼 화살' 추가

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. 신규 기본기 '영혼 화살' 추가 (lv1, cd 0, damage, mult 2.5)
    const exists = await client.query(`SELECT id FROM skills WHERE class_name='summoner' AND name='영혼 화살'`);
    if (exists.rowCount === 0) {
      await client.query(
        `INSERT INTO skills (class_name, name, description, required_level, damage_mult, kind, cooldown_actions, flat_damage, effect_type, effect_value, effect_duration, icon, element)
         VALUES ('summoner', $1, $2, 1, $3, 'damage', 0, 0, 'damage', 0, 0, '', null)`,
        ['영혼 화살', '영혼의 힘을 한 점에 집중해 적을 관통 — 소환사 기본 공격 (MATK x250%)', 2.5]
      );
      console.log('✓ 영혼 화살 추가');
    } else {
      console.log('영혼 화살 이미 존재');
    }

    // 2. 늑대 소환 cd 0 → 2
    const updW = await client.query(
      `UPDATE skills SET cooldown_actions = 2 WHERE class_name='summoner' AND name='늑대 소환' RETURNING id, cooldown_actions`
    );
    console.log('늑대 소환 cd 변경:', updW.rows);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // 검증
  const v = await pool.query(
    `SELECT name, required_level, cooldown_actions, damage_mult, effect_type FROM skills
     WHERE class_name='summoner' AND required_level <= 10 ORDER BY required_level, name`
  );
  console.log('\n=== 저레벨 소환사 스킬 ===');
  for (const r of v.rows) console.log(` lv${r.required_level} | cd=${r.cooldown_actions} | ${r.name} | mult=${r.damage_mult} | ${r.effect_type}`);

  // 기존 소환사 캐릭터의 character_skills에 auto_use=FALSE로 늑대 소환 갱신 선택
  //   자동 학습 로직이 다음 세션 시작 시 처리하므로 별도 조치 불필요
  //   (cd>0 이므로 safety net 에서 강제 TRUE 되지 않음)

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
