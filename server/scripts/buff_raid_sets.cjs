const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  // 1. 세트 아이템 ID 수집
  const crafts = await pool.query(`SELECT set_id, result_item_ids FROM craft_recipes WHERE set_id IS NOT NULL`);
  const setItemIds = { 1: [], 2: [], 3: [] };
  for (const c of crafts.rows) {
    for (const id of c.result_item_ids) setItemIds[c.set_id].push(id);
  }
  console.log('세트 아이템 ID:', setItemIds);

  // 2. 등급 common → legendary + 스탯 ×1.5
  for (const [setId, ids] of Object.entries(setItemIds)) {
    const items = await pool.query(`SELECT id, name, stats FROM items WHERE id = ANY($1::int[])`, [ids]);
    for (const item of items.rows) {
      const newStats = {};
      for (const [k, v] of Object.entries(item.stats)) {
        newStats[k] = Math.round(v * 1.5);
      }
      await pool.query(
        `UPDATE items SET grade = 'legendary', stats = $1::jsonb WHERE id = $2`,
        [JSON.stringify(newStats), item.id]
      );
      console.log(`[세트${setId}] ${item.name}: legendary + 스탯 ×1.5 → ${JSON.stringify(newStats)}`);
    }
  }

  // 3. 세트 보너스 정의
  const setBonuses = {
    1: { // 발라카스
      name: '발라카스 세트',
      set_bonus: {
        '3': { label: '3세트: ATK/MATK +15%, HP +20%', effects: [
          { type: 'stat_pct', stat: 'atk', value: 15 },
          { type: 'stat_pct', stat: 'matk', value: 15 },
          { type: 'stat_pct', stat: 'hp', value: 20 },
        ]}
      }
    },
    2: { // 카르나스
      name: '카르나스 세트',
      set_bonus: {
        '3': { label: '3세트: 도트 데미지 +30%, 방어 관통 +15%', effects: [
          { type: 'passive', key: 'dot_amp', value: 30 },
          { type: 'passive', key: 'armor_pierce', value: 15 },
        ]}
      }
    },
    3: { // 아트라스
      name: '아트라스 세트',
      set_bonus: {
        '3': { label: '3세트: 모든 스탯 +20%, 받는 데미지 -10%', effects: [
          { type: 'stat_pct', stat: 'atk', value: 20 },
          { type: 'stat_pct', stat: 'matk', value: 20 },
          { type: 'stat_pct', stat: 'def', value: 20 },
          { type: 'stat_pct', stat: 'mdef', value: 20 },
          { type: 'stat_pct', stat: 'hp', value: 20 },
          { type: 'passive', key: 'damage_taken_down_pct', value: 10 },
        ]}
      }
    },
  };

  for (const [setId, data] of Object.entries(setBonuses)) {
    await pool.query(
      `UPDATE item_sets SET set_bonus = $1::jsonb WHERE id = $2`,
      [JSON.stringify(data.set_bonus), Number(setId)]
    );
    console.log(`\n${data.name} 세트 보너스 등록: ${JSON.stringify(data.set_bonus['3'].label)}`);
  }

  // 검증
  console.log('\n=== 검증 ===');
  const verify = await pool.query(`SELECT id, name, set_bonus FROM item_sets ORDER BY id`);
  for (const s of verify.rows) {
    console.log(`${s.name}: ${JSON.stringify(s.set_bonus)}`);
  }

  const itemVerify = await pool.query(`SELECT id, name, grade, stats FROM items WHERE id = ANY($1::int[]) ORDER BY id`,
    [[...setItemIds[1], ...setItemIds[2], ...setItemIds[3]]]);
  for (const i of itemVerify.rows) {
    console.log(`${i.name} [${i.grade}] ${JSON.stringify(i.stats)}`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
