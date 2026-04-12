const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  const updates = [
    { id: 1, name: '발라카스', hp: 50000000, minLevel: 30 },
    { id: 3, name: '카르나스', hp: 150000000, minLevel: 60 },
    { id: 2, name: '아트라스', hp: 500000000, minLevel: 80 },
  ];

  for (const u of updates) {
    await pool.query(`UPDATE world_event_bosses SET max_hp = $1, min_level = $2 WHERE id = $3`, [u.hp, u.minLevel, u.id]);
    console.log(`${u.name}: HP → ${(u.hp/1000000)}M, 참가 Lv.${u.minLevel}+`);
  }

  // 보상 골드 3배
  const bosses = await pool.query(`SELECT id, name, reward_table FROM world_event_bosses ORDER BY id`);
  for (const b of bosses.rows) {
    const rt = b.reward_table.map(t => ({
      ...t,
      rewards: {
        ...t.rewards,
        gold: (t.rewards.gold || 0) * 3,
        exp: (t.rewards.exp || 0) * 3,
      }
    }));
    await pool.query(`UPDATE world_event_bosses SET reward_table = $1::jsonb WHERE id = $2`, [JSON.stringify(rt), b.id]);
    console.log(`${b.name} 보상 골드/EXP ×3`);
  }

  // 검증
  const after = await pool.query(`SELECT name, max_hp, min_level, reward_table FROM world_event_bosses ORDER BY level`);
  console.log('\n=== 변경 후 ===');
  for (const b of after.rows) {
    const sReward = b.reward_table.find(t => t.tier === 'S');
    console.log(`${b.name}: HP=${(Number(b.max_hp)/1000000)}M 참가Lv.${b.min_level}+ S등급=${JSON.stringify(sReward?.rewards)}`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
