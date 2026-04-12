const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  const charR = await pool.query(`SELECT id, name, level, class_name FROM characters WHERE name = '서련'`);
  if (charR.rowCount === 0) { console.error('캐릭터 없음'); process.exit(1); }
  const char = charR.rows[0];
  console.log(`대상: ${char.name} (id=${char.id}) Lv.${char.level} ${char.class_name}`);

  // 현재 상태 확인
  const cur = await pool.query(`
    SELECT cs.slot_order, cs.auto_use, s.name, s.kind, s.cooldown_actions
    FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
    WHERE cs.character_id = $1 ORDER BY cs.slot_order
  `, [char.id]);
  console.log('\n현재:');
  for (const s of cur.rows) console.log(`  슬롯${s.slot_order} ${s.auto_use ? 'ON' : 'OFF'} ${s.name} [${s.kind}]`);

  // 원하는 순서 설정
  const ORDER = ['무쌍난무', '분노의 일격', '최후의 일격', '전장의 포효', '전쟁의 함성', '반격의 의지', '강타'];

  for (let i = 0; i < ORDER.length; i++) {
    const skillR = await pool.query(`SELECT id FROM skills WHERE class_name = $1 AND name = $2`, [char.class_name, ORDER[i]]);
    if (skillR.rowCount === 0) { console.error(`스킬 없음: ${ORDER[i]}`); continue; }
    await pool.query(
      `UPDATE character_skills SET auto_use = TRUE, slot_order = $1 WHERE character_id = $2 AND skill_id = $3`,
      [i + 1, char.id, skillR.rows[0].id]
    );
  }

  // 나머지 OFF
  const orderIds = [];
  for (const name of ORDER) {
    const r = await pool.query(`SELECT id FROM skills WHERE class_name = $1 AND name = $2`, [char.class_name, name]);
    if (r.rowCount > 0) orderIds.push(r.rows[0].id);
  }
  await pool.query(`
    UPDATE character_skills SET auto_use = FALSE, slot_order = 100 + skill_id
    WHERE character_id = $1 AND skill_id != ALL($2::int[])
  `, [char.id, orderIds]);

  // 검증
  const after = await pool.query(`
    SELECT cs.slot_order, cs.auto_use, s.name, s.kind, s.cooldown_actions
    FROM character_skills cs JOIN skills s ON s.id = cs.skill_id
    WHERE cs.character_id = $1 AND cs.auto_use = TRUE
    ORDER BY cs.slot_order
  `, [char.id]);
  console.log('\n변경 후:');
  for (const s of after.rows) {
    const tag = s.kind === 'buff' ? '[자유]' : s.cooldown_actions === 0 ? '[기본기]' : `[cd=${s.cooldown_actions}]`;
    console.log(`  슬롯${s.slot_order}: ${s.name} ${tag}`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
