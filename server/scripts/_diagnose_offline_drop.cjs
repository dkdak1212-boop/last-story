const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();

  // 황제 캐릭 1010 의 drop filter 설정
  const dfr = await c.query(`SELECT id, name, drop_filter_tiers, drop_filter_common, drop_filter_protect_prefixes, drop_filter_protect_3opt FROM characters WHERE id = 1010`);
  console.log('=== 황제 drop filter ===');
  console.log(dfr.rows[0]);

  // "전설 홀" (id=383) 인벤 인스턴스의 prefix_ids 분포
  const inst = await c.query(`
    SELECT prefix_ids, prefix_stats, quality
      FROM character_inventory
     WHERE character_id = 1010 AND item_id = 383
     LIMIT 10`);
  console.log('\n=== 전설 홀 인벤 인스턴스 (10개) ===');
  for (const r of inst.rows) {
    console.log(`prefix_ids=${JSON.stringify(r.prefix_ids)} quality=${r.quality} prefix_stats keys=${Object.keys(r.prefix_stats || {}).join(',')}`);
  }

  // 전설 검 (361), 전설 지팡이 (372), 전설 단검 (394) 인벤 인스턴스
  for (const iid of [361, 372, 394, 405, 416, 427, 438, 449, 471]) {
    const r = await c.query(`SELECT prefix_ids, prefix_stats, quality FROM character_inventory WHERE character_id = 1010 AND item_id = $1`, [iid]);
    const nm = (await c.query(`SELECT name FROM items WHERE id = $1`, [iid])).rows[0]?.name;
    console.log(`\n=== ${nm} (${iid}) 인스턴스 ${r.rows.length}개 ===`);
    for (const x of r.rows) {
      console.log(`  prefix_ids=${JSON.stringify(x.prefix_ids)} q=${x.quality} keys=${Object.keys(x.prefix_stats||{}).join(',')}`);
    }
  }

  // prefix table 일부
  console.log('\n=== item_prefixes 테이블 컬럼 ===');
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'item_prefixes' ORDER BY ordinal_position`);
  console.log(cols.rows.map(r => r.column_name).join(', '));

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
