// 이미 개봉된 상자에서 유니크 옵션이 빠진 채 지급된 아이템 탐색
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  // soulbound=TRUE 이고 유니크 등급인데 유니크 고정 옵션 키가 prefix_stats 에 없는 인스턴스
  const { rows } = await c.query(`
    SELECT ci.id, ci.character_id, ci.item_id, i.name, ch.name AS char_name,
           i.unique_prefix_stats::text AS u_fixed,
           ci.prefix_stats::text AS stored
      FROM character_inventory ci
      JOIN items i ON i.id = ci.item_id
      JOIN characters ch ON ch.id = ci.character_id
     WHERE ci.soulbound = TRUE
       AND i.grade = 'unique'
       AND i.unique_prefix_stats IS NOT NULL
     ORDER BY ci.id DESC
     LIMIT 50
  `);
  console.log(`soulbound 유니크 인스턴스: ${rows.length}개 (최근 50)`);
  let broken = 0;
  for (const r of rows) {
    const fixed = JSON.parse(r.u_fixed || '{}');
    const stored = JSON.parse(r.stored || '{}');
    const missingKeys = Object.keys(fixed).filter(k => !(k in stored));
    if (missingKeys.length > 0) {
      broken++;
      console.log(`  [BROKEN] inv_id=${r.id} ${r.char_name} / ${r.name} / missing=${missingKeys.join(',')}`);
    }
  }
  console.log(`깨진 인스턴스: ${broken}개`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
