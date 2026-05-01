// 시공 분쇄 무기 5종 (id 900-904) 기존 인스턴스의 prefix_stats 를
// 새 unique_prefix_stats + 보존 random 으로 변환하는 dry-run.
// random = current_prefix_stats - OLD_unique
// new = NEW_unique + random
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
  // random = cur - oldU (OLD 키만 차감, 음수면 0/삭제)
  const random = {};
  const anomalies = [];
  for (const k of Object.keys(cur)) {
    const oldVal = oldU[k] || 0;
    const v = (Number(cur[k]) || 0) - oldVal;
    if (oldU[k] !== undefined && v < 0) {
      anomalies.push(`${k}: ${cur[k]} - ${oldU[k]} = ${v} (음수, 0 처리)`);
    }
    if (v > 0) random[k] = v;
  }
  // 결과 = newU + random (같은 키 합산)
  const next = { ...newU };
  for (const [k, v] of Object.entries(random)) {
    next[k] = (next[k] || 0) + v;
  }
  return { next, random, anomalies };
}

async function inspect(table, label) {
  let q;
  if (table === 'character_inventory') q = `SELECT id, character_id, slot_index, item_id, prefix_stats, enhance_level FROM ${table} WHERE item_id BETWEEN 900 AND 904`;
  else if (table === 'character_equipped') q = `SELECT character_id, slot, item_id, prefix_stats, enhance_level FROM ${table} WHERE item_id BETWEEN 900 AND 904`;
  else if (table === 'mailbox') q = `SELECT id, recipient_character_id AS character_id, item_id, prefix_stats FROM ${table} WHERE item_id BETWEEN 900 AND 904`;
  else if (table === 'account_storage_items') q = `SELECT id, user_id, slot_index, item_id, prefix_stats FROM ${table} WHERE item_id BETWEEN 900 AND 904`;
  else if (table === 'guild_storage_items') q = `SELECT id, guild_id, slot_index, item_id, prefix_stats FROM ${table} WHERE item_id BETWEEN 900 AND 904`;
  else if (table === 'auctions') q = `SELECT id, seller_character_id AS character_id, item_id, prefix_stats FROM ${table} WHERE item_id BETWEEN 900 AND 904`;
  let r;
  try { r = await c.query(q); }
  catch (e) {
    if (String(e.message).includes('does not exist')) { console.log(`[${label}] (table not exist)`); return { rows: [], anomCount: 0 }; }
    throw e;
  }
  const total = r.rowCount;
  let anomCount = 0;
  const samples = [];
  for (const row of r.rows) {
    const result = migrate(Number(row.item_id), row.prefix_stats);
    if (result.anomalies.length > 0) anomCount++;
    if (samples.length < 3) samples.push({ row, result });
  }
  console.log(`\n=== ${label} (${total}개) ===`);
  if (anomCount > 0) console.log(`⚠️ 이상 ${anomCount}건`);
  for (const s of samples) {
    const isInv = 'slot_index' in s.row;
    const idLabel = isInv ? `slot ${s.row.slot_index}` : `slot ${s.row.slot}`;
    console.log(`[item ${s.row.item_id}] char/user ${s.row.character_id || s.row.user_id || s.row.guild_id} ${idLabel}`);
    console.log(`  before:`, s.row.prefix_stats);
    console.log(`  random:`, s.result.random);
    console.log(`  after :`, s.result.next);
    if (s.result.anomalies.length > 0) console.log(`  anom  :`, s.result.anomalies);
  }
  return { rows: r.rows, anomCount };
}

(async () => {
  await c.connect();
  await inspect('character_inventory', 'character_inventory');
  await inspect('character_equipped', 'character_equipped');
  await inspect('mailbox', 'mailbox');
  await inspect('account_storage_items', 'account_storage_items');
  await inspect('guild_storage_items', 'guild_storage_items');
  await inspect('auctions', 'auctions');
  console.log('\n---\nDRY RUN. 실제 변경 없음. 검토 후 apply 스크립트 실행 필요.');
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
