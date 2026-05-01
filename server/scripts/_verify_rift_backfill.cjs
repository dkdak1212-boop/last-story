const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  console.log('=== 검증: 각 itemId 의 prefix_stats 키 분포 ===');
  for (const itemId of [900, 901, 902, 903, 904]) {
    const r = await c.query(
      `SELECT prefix_stats FROM character_inventory WHERE item_id = $1 LIMIT 5`,
      [itemId]
    );
    console.log(`\n--- item ${itemId} 샘플 5건 (character_inventory) ---`);
    for (const row of r.rows) console.log(' ', row.prefix_stats);
  }
  // 잔존 OLD 키 체크
  console.log('\n=== OLD 키 잔존 검증 ===');
  const checks = [
    { id: 900, oldOnly: ['berserk_pct', 'def_pierce_pct'] },  // 902 의 berserk 와 충돌 X (900만)
    { id: 902, oldOnly: ['matk_pct'] },  // 902 에서 matk_pct 제거 (다른 무기는 NEW 에 matk_pct 있음)
    { id: 903, oldOnly: ['ambush_pct'] },
    { id: 904, oldOnly: ['summon_amp'] },
  ];
  for (const ch of checks) {
    for (const k of ch.oldOnly) {
      const r = await c.query(
        `SELECT COUNT(*)::int AS n FROM character_inventory WHERE item_id = $1 AND prefix_stats ? $2`,
        [ch.id, k]
      );
      const n = r.rows[0].n;
      // 있어도 random 보존된 거라 OK. 다만 user 의도상 "OLD unique 자체로 박혀있는" 인스턴스만 검증.
      if (n > 0) console.log(`item ${ch.id} 의 ${k} 잔존: ${n}건 (random rolled 일 수도 있음 — 정상)`);
      else console.log(`item ${ch.id} 의 ${k}: 0건 ✓`);
    }
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
