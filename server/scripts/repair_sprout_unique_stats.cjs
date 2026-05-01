// 차원새싹상자에서 유니크 고정 옵션 누락된 채 지급된 인스턴스 복구
// 대상: soulbound=TRUE 이고 유니크 등급이며, unique_prefix_stats 의 키 중 일부가
//       prefix_stats 에 빠져 있는 인스턴스 (character_inventory / mailbox)
// 로직: new_prefix_stats = items.unique_prefix_stats + current prefix_stats (키별 합산)
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });

async function repairById(c, table, label) {
  const { rows } = await c.query(
    `SELECT t.id, t.prefix_stats::text AS stored, i.unique_prefix_stats::text AS u_fixed
       FROM ${table} t JOIN items i ON i.id = t.item_id
      WHERE t.soulbound = TRUE AND i.grade = 'unique' AND i.unique_prefix_stats IS NOT NULL`
  );
  let fixed = 0;
  for (const r of rows) {
    const stored = JSON.parse(r.stored || '{}');
    const uFixed = JSON.parse(r.u_fixed || '{}');
    const missingKeys = Object.keys(uFixed).filter(k => !(k in stored));
    if (missingKeys.length === 0) continue;
    const merged = { ...stored };
    for (const [k, v] of Object.entries(uFixed)) merged[k] = (merged[k] || 0) + v;
    await c.query(`UPDATE ${table} SET prefix_stats = $1::jsonb WHERE id = $2`, [JSON.stringify(merged), r.id]);
    fixed++;
  }
  console.log(`${label}: ${fixed}개 복구`);
}

async function repairEquipped(c) {
  const { rows } = await c.query(
    `SELECT t.character_id, t.slot, t.prefix_stats::text AS stored, i.unique_prefix_stats::text AS u_fixed
       FROM character_equipped t JOIN items i ON i.id = t.item_id
      WHERE t.soulbound = TRUE AND i.grade = 'unique' AND i.unique_prefix_stats IS NOT NULL`
  );
  let fixed = 0;
  for (const r of rows) {
    const stored = JSON.parse(r.stored || '{}');
    const uFixed = JSON.parse(r.u_fixed || '{}');
    const missingKeys = Object.keys(uFixed).filter(k => !(k in stored));
    if (missingKeys.length === 0) continue;
    const merged = { ...stored };
    for (const [k, v] of Object.entries(uFixed)) merged[k] = (merged[k] || 0) + v;
    await c.query(
      `UPDATE character_equipped SET prefix_stats = $1::jsonb WHERE character_id = $2 AND slot = $3`,
      [JSON.stringify(merged), r.character_id, r.slot]
    );
    fixed++;
  }
  console.log(`character_equipped: ${fixed}개 복구`);
}

async function repairMailbox(c) {
  // 상자 오버플로우로 우편에 남은 유니크 (최근 1시간 내)
  const { rows } = await c.query(
    `SELECT t.id, t.prefix_stats::text AS stored, i.unique_prefix_stats::text AS u_fixed
       FROM mailbox t JOIN items i ON i.id = t.item_id
      WHERE i.grade = 'unique' AND i.unique_prefix_stats IS NOT NULL
        AND t.created_at > NOW() - INTERVAL '1 hour'
        AND t.subject LIKE '차원새싹상자%'
        AND t.read_at IS NULL`
  );
  let fixed = 0;
  for (const r of rows) {
    const stored = JSON.parse(r.stored || '{}');
    const uFixed = JSON.parse(r.u_fixed || '{}');
    const missingKeys = Object.keys(uFixed).filter(k => !(k in stored));
    if (missingKeys.length === 0) continue;
    const merged = { ...stored };
    for (const [k, v] of Object.entries(uFixed)) merged[k] = (merged[k] || 0) + v;
    await c.query(`UPDATE mailbox SET prefix_stats = $1::jsonb WHERE id = $2`, [JSON.stringify(merged), r.id]);
    fixed++;
  }
  console.log(`mailbox (미수령 오버플로우): ${fixed}개 복구`);
}

(async () => {
  await c.connect();
  await repairById(c, 'character_inventory', 'character_inventory');
  await repairEquipped(c);
  await repairMailbox(c);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
