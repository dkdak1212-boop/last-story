// 체력 물약 5종 (id 100/102/104/106/108) stack_size 300 → 9999 + 인벤 흩어진 슬롯 합치기.
// 단일 슬롯에 9999 까지 합산, 초과분은 다음 슬롯으로.
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });

const ITEM_IDS = [100, 102, 104, 106, 108];
const NEW_STACK = 9999;

(async () => {
  await c.connect();
  await c.query('BEGIN');
  try {
    // 1) 마스터 stack_size 9999
    await c.query(`UPDATE items SET stack_size = $1 WHERE id = ANY($2::int[])`, [NEW_STACK, ITEM_IDS]);
    console.log('items.stack_size 9999 적용 완료');

    // 2) 인벤 흩어진 슬롯 합치기
    // per char × item: 모든 슬롯 quantity 합 → 9999 단위로 슬롯 채우기, min slot 부터.
    const groups = await c.query(`
      SELECT character_id, item_id,
             SUM(quantity)::int AS total,
             array_agg(slot_index ORDER BY slot_index) AS slots,
             array_agg(id ORDER BY slot_index) AS row_ids
        FROM character_inventory
       WHERE item_id = ANY($1::int[])
       GROUP BY character_id, item_id
    `, [ITEM_IDS]);

    let updated = 0, deleted = 0;
    for (const g of groups.rows) {
      const total = Number(g.total);
      const slots = g.slots.map(Number);
      const rowIds = g.row_ids.map(Number);
      // 9999 단위로 분할 — 보통 1 슬롯 안에 들어감
      const fullSlots = Math.floor(total / NEW_STACK);
      const remainder = total % NEW_STACK;
      const needSlots = fullSlots + (remainder > 0 ? 1 : 0);
      // 사용 슬롯: 기존 슬롯 중 앞 needSlots 개 재활용
      const keepRowIds = rowIds.slice(0, needSlots);
      const removeRowIds = rowIds.slice(needSlots);
      // 앞쪽 슬롯에 quantity 채우기
      for (let i = 0; i < needSlots; i++) {
        const qty = (i < fullSlots) ? NEW_STACK : remainder;
        await c.query(
          `UPDATE character_inventory SET quantity = $1 WHERE id = $2`,
          [qty, keepRowIds[i]]
        );
        updated++;
      }
      // 나머지 슬롯 DELETE
      if (removeRowIds.length > 0) {
        await c.query(`DELETE FROM character_inventory WHERE id = ANY($1::int[])`, [removeRowIds]);
        deleted += removeRowIds.length;
      }
    }
    console.log(`인벤 정리: UPDATE ${updated}, DELETE ${deleted}`);

    // 검증
    const verify = await c.query(`
      SELECT COUNT(*)::int AS bad
        FROM character_inventory
       WHERE item_id = ANY($1::int[]) AND quantity > $2
    `, [ITEM_IDS, NEW_STACK]);
    console.log(`9999 초과 슬롯 (0이어야 정상):`, verify.rows[0].bad);

    await c.query('COMMIT');
    console.log('완료.');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('rollback:', e);
    process.exit(1);
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
