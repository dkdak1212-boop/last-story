// 닉네임 '성직자' 의 T3 접두사 보장 추첨권 사용 추적.
// 정확한 사용 로그 테이블이 없어서 다음 항목으로 추정:
//  - 현재 보유량
//  - 우편함에서 받은 T3 추첨권 mail 갯수 (총 획득량 추정)
//  - 사용 = 획득량 - 현재 보유량
const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const ch = await c.query(`SELECT id, name, level FROM characters WHERE name = '성직자' ORDER BY id`);
    if (ch.rowCount === 0) { console.log('캐릭 없음.'); return; }
    for (const r of ch.rows) console.log(`char id=${r.id} name=${r.name} lv${r.level}`);

    for (const cha of ch.rows) {
      console.log(`\n=== char ${cha.id} (${cha.name}) ===`);
      // 현재 인벤 보유량
      const cur = await c.query(`
        SELECT COALESCE(SUM(ci.quantity), 0)::int AS cur_qty
          FROM character_inventory ci JOIN items i ON i.id = ci.item_id
         WHERE ci.character_id = $1 AND i.name = 'T3 접두사 보장 추첨권'`, [cha.id]);
      const curQty = cur.rows[0]?.cur_qty ?? 0;

      // 우편함에서 수령 가능 (claimed=false) + 받은 mail 합계 (claimed=true 건도 포함)
      const mailA = await c.query(`
        SELECT COUNT(*)::int AS cnt, COALESCE(SUM(item_quantity), 0)::int AS qty
          FROM mailbox WHERE character_id = $1 AND item_id IN (SELECT id FROM items WHERE name = 'T3 접두사 보장 추첨권')`, [cha.id]);
      const mailCnt = mailA.rows[0]?.cnt ?? 0;
      const mailQty = mailA.rows[0]?.qty ?? 0;

      // 청구 안 된 (= 인벤 미수령) 우편 수량
      const mailUnclaimed = await c.query(`
        SELECT COALESCE(SUM(item_quantity), 0)::int AS qty
          FROM mailbox WHERE character_id = $1
            AND item_id IN (SELECT id FROM items WHERE name = 'T3 접두사 보장 추첨권')
            AND claimed = FALSE`, [cha.id]);
      const unclaimedQty = mailUnclaimed.rows[0]?.qty ?? 0;
      const claimedQty = mailQty - unclaimedQty;

      console.log(`현재 보유량 (인벤): ${curQty} 장`);
      console.log(`우편 누적 수령 (claimed=TRUE): ${claimedQty} 장 (총 mail ${mailCnt} 건)`);
      console.log(`우편 미수령 (claimed=FALSE): ${unclaimedQty} 장`);
      // 사용 횟수 추정 = 수령 누적 - 현재 보유 (양수만)
      const used = Math.max(0, claimedQty - curQty);
      console.log(`==> T3 추첨권 사용 횟수 추정: ${used} 회 (수령 ${claimedQty} - 현재 ${curQty})`);
      console.log(`주의: 이 값은 우편 수령분만 집계. 상점/개발자 지급/이벤트 직접 지급은 누락될 수 있음.`);
    }
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
