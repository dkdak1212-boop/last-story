// 1단계: items.stack_size 9999 (별도 commit)
// 2단계: 인벤 그룹별 합치기 (per-group commit, 짧은 트랜잭션)
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
const ITEM_IDS = [100, 102, 104, 106, 108];
const NEW_STACK = 9999;

(async () => {
  await c.connect();

  // STEP 1: 마스터
  await c.query(`UPDATE items SET stack_size = $1 WHERE id = ANY($2::int[])`, [NEW_STACK, ITEM_IDS]);
  console.log('Step1: items.stack_size 9999 적용');

  // STEP 2: 그룹 목록
  const groupsR = await c.query(`
    SELECT character_id, item_id
      FROM character_inventory
     WHERE item_id = ANY($1::int[])
     GROUP BY character_id, item_id
    HAVING COUNT(*) > 1
  `, [ITEM_IDS]);
  console.log(`Step2: 합칠 그룹 ${groupsR.rowCount}개`);

  let processed = 0, totalUpd = 0, totalDel = 0;
  for (const g of groupsR.rows) {
    const cid = Number(g.character_id);
    const iid = Number(g.item_id);
    // per-group 짧은 트랜잭션
    await c.query('BEGIN');
    try {
      const detail = await c.query(`
        SELECT id, slot_index, quantity FROM character_inventory
         WHERE character_id = $1 AND item_id = $2
         ORDER BY slot_index
         FOR UPDATE
      `, [cid, iid]);
      const total = detail.rows.reduce((s, r) => s + Number(r.quantity), 0);
      const fullSlots = Math.floor(total / NEW_STACK);
      const remainder = total % NEW_STACK;
      const needSlots = fullSlots + (remainder > 0 ? 1 : 0);
      const ids = detail.rows.map(r => Number(r.id));
      const keep = ids.slice(0, needSlots);
      const remove = ids.slice(needSlots);
      for (let i = 0; i < needSlots; i++) {
        const qty = i < fullSlots ? NEW_STACK : remainder;
        await c.query(`UPDATE character_inventory SET quantity = $1 WHERE id = $2`, [qty, keep[i]]);
        totalUpd++;
      }
      if (remove.length > 0) {
        await c.query(`DELETE FROM character_inventory WHERE id = ANY($1::int[])`, [remove]);
        totalDel += remove.length;
      }
      await c.query('COMMIT');
      processed++;
      if (processed % 100 === 0) console.log(`  진행 ${processed}/${groupsR.rowCount}`);
    } catch (e) {
      await c.query('ROLLBACK');
      console.error(`group char=${cid} item=${iid} err:`, e.message);
    }
  }
  console.log(`Step2 완료: 그룹 ${processed} / UPDATE ${totalUpd} / DELETE ${totalDel}`);

  // 검증
  const v = await c.query(`SELECT id, name, stack_size FROM items WHERE id = ANY($1::int[]) ORDER BY id`, [ITEM_IDS]);
  console.log('마스터 확인:', v.rows);
  const left = await c.query(`SELECT COUNT(*)::int AS n FROM (SELECT character_id, item_id FROM character_inventory WHERE item_id = ANY($1::int[]) GROUP BY character_id, item_id HAVING COUNT(*) > 1) sub`, [ITEM_IDS]);
  console.log(`잔여 흩어진 그룹: ${left.rows[0].n}`);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
