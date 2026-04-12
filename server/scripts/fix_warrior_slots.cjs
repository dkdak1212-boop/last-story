const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const CHAR_ID = 13; // 근느
const DESIRED_ORDER = [
  '무쌍난무',      // 슬롯1 - damage
  '분노의 일격',   // 슬롯2 - damage
  '최후의 일격',   // 슬롯3 - damage
  '전장의 포효',   // 슬롯4 - buff (자유)
  '전쟁의 함성',   // 슬롯5 - buff (자유)
  '반격의 의지',   // 슬롯6 - buff (자유)
  '강타',         // 슬롯7 - 기본기
];

(async () => {
  // 먼저 모든 스킬 auto_use=TRUE, slot_order 재설정
  for (let i = 0; i < DESIRED_ORDER.length; i++) {
    const name = DESIRED_ORDER[i];
    const skillR = await pool.query(`SELECT id FROM skills WHERE class_name = 'warrior' AND name = $1`, [name]);
    if (skillR.rowCount === 0) { console.error(`스킬 없음: ${name}`); continue; }
    const skillId = skillR.rows[0].id;

    await pool.query(
      `UPDATE character_skills SET auto_use = TRUE, slot_order = $1 WHERE character_id = $2 AND skill_id = $3`,
      [i + 1, CHAR_ID, skillId]
    );
    console.log(`슬롯${i + 1}: ${name} (ON)`);
  }

  // 나머지 스킬은 OFF + slot_order 100+
  await pool.query(`
    UPDATE character_skills SET auto_use = FALSE, slot_order = 100 + skill_id
    WHERE character_id = $1 AND skill_id NOT IN (
      SELECT id FROM skills WHERE name = ANY($2::text[])
    )
  `, [CHAR_ID, DESIRED_ORDER]);

  // 검증
  const v = await pool.query(`
    SELECT cs.slot_order, cs.auto_use, s.name, s.kind, s.cooldown_actions
    FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
    WHERE cs.character_id = $1 AND cs.auto_use = TRUE
    ORDER BY cs.slot_order
  `, [CHAR_ID]);
  console.log('\n=== 변경 후 ===');
  for (const s of v.rows) {
    const tag = s.kind === 'buff' ? '[자유]' : s.cooldown_actions === 0 ? '[기본기]' : `[cd=${s.cooldown_actions}]`;
    console.log(`  슬롯${s.slot_order}: ${s.name} ${tag}`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
