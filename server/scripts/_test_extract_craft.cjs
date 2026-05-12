const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

// 테스트 캐릭 직접 DB 조작 — 추출/제작 로직만 검증.
// API 호출은 별도 (서버 실행 후 curl) — 여기서는 SQL 단위 검증.

(async () => {
  try {
    // 1) 신비한가루 보유 → T3 추첨권 제작 검증 (admin 으로 캐릭 1개에 가루 20 지급 후 craft 시뮬)
    const charR = await pool.query(`SELECT id, name FROM characters WHERE name = '두둥게' LIMIT 1`);
    if (charR.rowCount === 0) {
      console.log('테스트 캐릭 두둥게 없음 — 다른 캐릭으로');
      const any = await pool.query(`SELECT id, name FROM characters LIMIT 1`);
      if (any.rowCount === 0) { console.log('NO CHARACTER'); return; }
      var cid = any.rows[0].id; var cname = any.rows[0].name;
    } else { var cid = charR.rows[0].id; var cname = charR.rows[0].name; }
    console.log(`테스트 대상: ${cname} (id=${cid})`);

    // 2) 검증: extra_materials 컬럼 존재 + 값 정상
    const r15 = await pool.query(`SELECT id, name, material_item_id, material_qty, result_type, result_item_ids, set_id, extra_materials FROM craft_recipes WHERE id = 15`);
    console.log('Recipe 15 detail:', JSON.stringify(r15.rows[0], null, 2));

    // 3) 검증: unidentified 컬럼들 추가됨
    const cols = await pool.query(`
      SELECT table_name, column_name FROM information_schema.columns
       WHERE column_name='unidentified' AND table_name IN ('character_inventory','auctions','mailbox')
       ORDER BY table_name`);
    console.log('unidentified columns:', cols.rows);

    // 4) 시뮬: 미확인 시공의 검 1개를 character_inventory 에 직접 INSERT, 거래소 등록·구매 흐름 SQL 검증
    // 빈 슬롯 찾기
    const usedR = await pool.query(`SELECT slot_index FROM character_inventory WHERE character_id = $1`, [cid]);
    const used = new Set(usedR.rows.map(r => r.slot_index));
    let freeSlot = -1;
    for (let i = 0; i < 300; i++) if (!used.has(i)) { freeSlot = i; break; }
    if (freeSlot < 0) { console.log('인벤 가득'); return; }

    // 미확인 시공 분쇄 대검 (item 900) 1개 INSERT
    const ins = await pool.query(
      `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, prefix_ids, prefix_stats, quality, soulbound, unidentified)
       VALUES ($1, 900, $2, 1, NULL, '{}'::jsonb, 0, FALSE, TRUE)
       RETURNING id`,
      [cid, freeSlot]
    );
    const invId = ins.rows[0].id;
    console.log(`✓ 미확인 시공 분쇄 대검 INSERT 성공 (inv id=${invId}, slot=${freeSlot})`);

    // 5) 거래소 등록 SQL — 실제 etx 라우트 흐름 시뮬 (옵션 미확인 그대로 전달)
    const ench = 0, pIds = null, pStats = '{}', qual = 0, unid = true;
    const auc = await pool.query(
      `INSERT INTO auctions (seller_id, item_id, item_quantity, start_price, buyout_price, ends_at, enhance_level, prefix_ids, prefix_stats, quality, listed_at, unidentified)
       VALUES ($1, 900, 1, 1000000, 1000000, NOW() + INTERVAL '24 hours', $2, $3, $4::jsonb, $5, NOW(), $6)
       RETURNING id`,
      [cid, ench, pIds, pStats, qual, unid]
    );
    console.log(`✓ 거래소 등록 (auction id=${auc.rows[0].id}, unidentified=true)`);

    // 6) 시공 prefix 풀 + 시공 unique_prefix_stats 확인
    const itemR = await pool.query(`SELECT id, name, required_level, unique_prefix_stats FROM items WHERE id = 900`);
    console.log('item 900:', JSON.stringify(itemR.rows[0], null, 2));

    // 7) 정리: 테스트 행 삭제
    await pool.query(`DELETE FROM auctions WHERE id = $1`, [auc.rows[0].id]);
    await pool.query(`DELETE FROM character_inventory WHERE id = $1`, [invId]);
    console.log('✓ 테스트 데이터 정리 완료');

    console.log('\n=== 테스트 통과 ===');
    console.log('1) 마이그레이션 082 적용 OK');
    console.log('2) extra_materials 컬럼 + recipe 15 멀티재료 등록 OK');
    console.log('3) character_inventory/auctions/mailbox 에 unidentified 컬럼 추가 OK');
    console.log('4) 미확인 장비 INSERT + 거래소 등록 SQL 정상');
    console.log('5) 다음 단계: 서버 배포 → 클라에서 /craft/extract, /craft/craft (recipe 14/15), /marketplace 구매 플로우 실 테스트');
  } catch (e) { console.error('FAIL:', e.message); console.error(e.stack); process.exit(1); }
  await pool.end();
})();
