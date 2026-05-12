const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    // L60 폭격 모드 — self_atk_buff (engine handler 추가됨)
    // L80 절대 정밀 — crit_guaranteed 5행동 (기존 메커니즘 재활용)
    const updates = [
      { id: 216, et: 'crit_guaranteed', ev: 0, ed: 5, desc: '5행동 동안 모든 공격 치명타 확정 · 쿨 9행동 · 자유행동' },
    ];
    for (const u of updates) {
      const r = await c.query(`UPDATE skills SET effect_type=$1, effect_value=$2, effect_duration=$3, description=$4 WHERE id=$5 RETURNING name`, [u.et, u.ev, u.ed, u.desc, u.id]);
      console.log(`✓ #${u.id} ${r.rows[0].name} → ${u.et}=${u.ev} dur=${u.ed}`);
    }
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
