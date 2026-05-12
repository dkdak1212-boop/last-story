// 캐릭터 장착 장비 조회 — argv[2] = 닉네임
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const NAME = process.argv[2];
if (!NAME) { console.log('usage: node _show_equip_char.cjs <닉네임>'); process.exit(1); }

(async () => {
  try {
    const c = await pool.query('SELECT id, name, level, class_name FROM characters WHERE name = $1', [NAME]);
    if (!c.rowCount) { console.log(`NO CHAR ${NAME}`); return; }
    const ch = c.rows[0];
    console.log(`[char] ${ch.name}  id=${ch.id}  Lv${ch.level}  ${ch.class_name}`);
    console.log('─'.repeat(80));

    const eq = await pool.query(
      `SELECT ce.slot, ce.item_id, ce.enhance_level, ce.enhance_pity,
              i.name, i.grade, i.required_level,
              ce.prefix_stats, ce.quality, ce.locked, ce.soulbound
         FROM character_equipped ce JOIN items i ON i.id = ce.item_id
        WHERE ce.character_id = $1
        ORDER BY ce.slot`,
      [ch.id]
    );
    if (!eq.rowCount) { console.log('(장착 중인 장비 없음)'); return; }

    const slotKr = {
      weapon: '무기', helmet: '투구', chest: '상의', pants: '하의',
      gloves: '장갑', boots: '신발', necklace: '목걸이', earring: '귀걸이',
      ring1: '반지1', ring2: '반지2', belt: '벨트', cape: '망토', shield: '방패',
    };
    for (const r of eq.rows) {
      const enh = r.enhance_level > 0 ? ` +${r.enhance_level}` : '';
      const pty = (r.enhance_pity || 0) > 0 ? `  [pity ${r.enhance_pity}]` : '';
      const lock = r.locked ? '🔒' : '';
      const sb = r.soulbound ? '💀' : '';
      const q = (r.quality || 0) > 0 ? ` 품질 ${r.quality}` : '';
      console.log(`[${(slotKr[r.slot] || r.slot).padEnd(8)}] ${lock}${sb} ${r.name}${enh} (${r.grade}, Lv${r.required_level})${q}${pty}`);
      const ps = r.prefix_stats || {};
      const keys = Object.keys(ps);
      if (keys.length) {
        for (const k of keys) console.log(`           · ${k}: ${ps[k]}`);
      }
    }
  } finally {
    await pool.end();
  }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
