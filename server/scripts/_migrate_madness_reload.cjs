// 키스톤 #7 반대의 균형 → 광기의 재충전 으로 교체.
// 1. node_definitions #953 의 name/description/effects 업데이트.
// 2. character_nodes 에 #953 투자한 캐릭은 그대로 유지 (효과만 변경됨, 자동 환불 X).
//    필요 시 운영자가 수동으로 환불 가능.
const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const before = await c.query(`SELECT id, name, description, effects FROM node_definitions WHERE id = 953`);
    if (before.rowCount === 0) { console.log('노드 953 없음'); return; }
    console.log('변경 전:', before.rows[0]);

    const newName = '광기의 재충전';
    const newDesc = '스킬 시전 시 50% 확률로 즉시 쿨다운 0 / 50% 확률로 쿨다운 ×3 (200% 증가)';
    const newEffects = JSON.stringify([{ key: 'paragon_madness_reload', type: 'passive', value: 1 }]);

    await c.query(
      `UPDATE node_definitions SET name = $1, description = $2, effects = $3::jsonb WHERE id = 953`,
      [newName, newDesc, newEffects]
    );

    const after = await c.query(`SELECT id, name, description, effects FROM node_definitions WHERE id = 953`);
    console.log('\n변경 후:', after.rows[0]);

    // 기존 투자자 확인
    const inv = await c.query(`SELECT character_id FROM character_nodes WHERE node_id = 953`);
    console.log(`\n현재 #953 투자한 캐릭: ${inv.rowCount}명`);
    if (inv.rowCount > 0) {
      console.log(`  → 효과만 변경되어 자동 적용. 환불은 운영자 수동 처리 필요시.`);
    }
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
