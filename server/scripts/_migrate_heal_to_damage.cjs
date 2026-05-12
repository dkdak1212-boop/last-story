// 키스톤 #928 고립본능 → 회복 환원 으로 교체.
// effects key: paragon_isolation_instinct → paragon_heal_to_damage
const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const before = await c.query(`SELECT id, name, description, effects FROM node_definitions WHERE id = 928`);
    if (before.rowCount === 0) { console.log('노드 928 없음'); return; }
    console.log('변경 전:', before.rows[0]);

    const newName = '회복 환원';
    const newDesc = '받은 회복량의 100% 가 다음 자기 공격 1회에 flat 데미지로 추가 (소모형)';
    const newEffects = JSON.stringify([{ key: 'paragon_heal_to_damage', type: 'passive', value: 1 }]);

    await c.query(
      `UPDATE node_definitions SET name = $1, description = $2, effects = $3::jsonb WHERE id = 928`,
      [newName, newDesc, newEffects]
    );

    const after = await c.query(`SELECT id, name, description, effects FROM node_definitions WHERE id = 928`);
    console.log('\n변경 후:', after.rows[0]);

    const inv = await c.query(`SELECT character_id FROM character_nodes WHERE node_id = 928`);
    console.log(`\n현재 #928 투자한 캐릭: ${inv.rowCount}명 (자동 새 효과 적용)`);
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
