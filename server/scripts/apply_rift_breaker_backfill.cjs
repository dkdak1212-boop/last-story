// 시공 분쇄 무기 5종 (id 900-904) 기존 인스턴스 prefix_stats 백필.
// random = current - OLD_unique, new_prefix_stats = NEW_unique + random.
// 적용 테이블: character_inventory, character_equipped, account_storage_items.
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });

const OLD = {
  900: { atk_pct: 25, berserk_pct: 30, predator_pct: 20, def_pierce_pct: 20 },
  901: { spd_pct: 14, matk_pct: 25, crit_dmg_pct: 50 },
  902: { matk_pct: 18, max_hp_pct: 25, thorns_pct: 30, predator_pct: 20 },
  903: { atk_pct: 20, ambush_pct: 40, dot_amp_pct: 35, evasion_burst_pct: 50 },
  904: { matk_pct: 18, summon_amp: 30, summon_max_extra: 1, summon_double_hit: 15 },
};
const NEW = {
  900: { atk_pct: 25, full_hp_amp_pct: 30, predator_pct: 20, spd_pct: 14 },
  901: { spd_pct: 25, matk_pct: 25, crit_dmg_pct: 50 },
  902: { spd_pct: 14, max_hp_pct: 25, thorns_pct: 30, berserk_pct: 30 },
  903: { atk_pct: 20, spd_pct: 14, dot_amp_pct: 35, evasion_burst_pct: 50 },
  904: { spd_pct: 14, matk_pct: 18, summon_max_extra: 1, summon_double_hit: 15 },
};

function migrate(itemId, current) {
  const oldU = OLD[itemId] || {};
  const newU = NEW[itemId] || {};
  const cur = { ...(current || {}) };
  const random = {};
  for (const k of Object.keys(cur)) {
    const oldVal = oldU[k] || 0;
    const v = (Number(cur[k]) || 0) - oldVal;
    if (v > 0) random[k] = v;
  }
  const next = { ...newU };
  for (const [k, v] of Object.entries(random)) {
    next[k] = (next[k] || 0) + v;
  }
  return next;
}

async function backfillTable(table, idCol, whereExtra = '') {
  const sel = await c.query(
    `SELECT ${idCol} AS id, item_id, prefix_stats FROM ${table}
      WHERE item_id BETWEEN 900 AND 904 ${whereExtra}`
  );
  let updated = 0;
  for (const row of sel.rows) {
    const next = migrate(Number(row.item_id), row.prefix_stats);
    await c.query(
      `UPDATE ${table} SET prefix_stats = $1::jsonb WHERE ${idCol} = $2`,
      [JSON.stringify(next), row.id]
    );
    updated++;
  }
  console.log(`[${table}] ${updated} 행 업데이트`);
  return updated;
}

(async () => {
  await c.connect();
  await c.query('BEGIN');
  try {
    let total = 0;
    total += await backfillTable('character_inventory', 'id');
    // character_equipped 는 (character_id, slot) PK — 단일 PK 컬럼 없음. 다른 방식.
    {
      const sel = await c.query(`SELECT character_id, slot, item_id, prefix_stats FROM character_equipped WHERE item_id BETWEEN 900 AND 904`);
      let n = 0;
      for (const row of sel.rows) {
        const next = migrate(Number(row.item_id), row.prefix_stats);
        await c.query(
          `UPDATE character_equipped SET prefix_stats = $1::jsonb WHERE character_id = $2 AND slot = $3`,
          [JSON.stringify(next), row.character_id, row.slot]
        );
        n++;
      }
      console.log(`[character_equipped] ${n} 행 업데이트`);
      total += n;
    }
    total += await backfillTable('account_storage_items', 'id');
    await c.query('COMMIT');
    console.log(`\n총 ${total} 행 업데이트 완료.`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('rollback:', e);
    process.exit(1);
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
