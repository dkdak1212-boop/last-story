// 닉네임 '분노' 무기 +29 강화 정상 검증
// 1) 캐릭 검색 + 장착 무기 + 현재 강화 레벨
// 2) enhance_log 에서 그 무기 / 캐릭의 강화 시도 기록 (시도 / 성공 / 파괴)
// 3) gold 변동 / strengthening 자원 소비 패턴
const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    // 1) 캐릭 + 장착 무기
    console.log('=== 닉네임 "분노" 캐릭 검색 ===');
    const ch = await c.query(
      `SELECT id, user_id, name, level, class_name, gold FROM characters WHERE name = '분노' ORDER BY id`
    );
    if (ch.rowCount === 0) { console.log('캐릭 없음.'); return; }
    for (const r of ch.rows) console.log(`char id=${r.id} user=${r.user_id} name=${r.name} class=${r.class_name} Lv${r.level} gold=${Number(r.gold).toLocaleString()}`);

    for (const cha of ch.rows) {
      console.log(`\n=== char ${cha.id} (${cha.name}) 장착 무기 ===`);
      const eq = await c.query(
        `SELECT ce.slot, ce.item_id, i.name AS item_name, i.grade, i.required_level,
                ce.enhance_level, ce.enhance_pity, ce.quality, ce.prefix_ids, ce.prefix_stats, ce.locked, ce.soulbound
           FROM character_equipped ce JOIN items i ON i.id = ce.item_id
          WHERE ce.character_id = $1 AND ce.slot = 'weapon'`,
        [cha.id]
      );
      if (eq.rowCount === 0) { console.log('장착 무기 없음'); continue; }
      const w = eq.rows[0];
      console.log(`item ${w.item_id} ${w.item_name} +${w.enhance_level} (Q${w.quality}) [${w.grade}]`);
      console.log(`pity ${w.enhance_pity || 0} · locked=${w.locked} · soulbound=${w.soulbound}`);
      console.log(`prefix_ids=${JSON.stringify(w.prefix_ids)}`);
      console.log(`prefix_stats=${JSON.stringify(w.prefix_stats)}`);

      // 2) enhance_log — 이 캐릭의 시공 분쇄 대검 강화 시도만
      console.log(`\n=== char ${cha.id} 의 시공 분쇄 대검 강화 기록 (전체 기간) ===`);
      const elog = await c.query(
        `SELECT id, item_name, item_grade, from_level, to_level, success, destroyed, created_at
           FROM enhance_log
          WHERE character_id = $1
            AND item_name = $2
          ORDER BY created_at`,
        [cha.id, w.item_name]
      );
      if (elog.rowCount === 0) {
        console.log('(시공 분쇄 대검 enhance_log 기록 없음 — ⚠️ 의심: 강화 로그 없이 +29 도달)');
      } else {
        let attempts = 0, success = 0, destroyed = 0;
        const byLevel = new Map();
        for (const lg of elog.rows) {
          attempts++;
          if (lg.success) success++;
          if (lg.destroyed) destroyed++;
          const key = `+${lg.from_level} → +${lg.to_level || '?'}`;
          byLevel.set(key, (byLevel.get(key) || 0) + 1);
          console.log(`[${lg.created_at.toISOString().slice(0,19).replace('T',' ')}] +${lg.from_level} → +${lg.to_level || '?'} ${lg.success ? '✓성공' : '✗실패'} ${lg.destroyed ? '💥파괴' : ''}`);
        }
        console.log(`\n→ 총 ${attempts}회 시도 · ${success}회 성공 (${(success/attempts*100).toFixed(1)}%) · ${destroyed}회 파괴`);
        // +28 → +29 시도 명확히 기록 있는지 확인
        const t29 = elog.rows.filter(l => l.from_level === 28).length;
        const s29 = elog.rows.filter(l => l.from_level === 28 && l.success).length;
        console.log(`→ +28 → +29 시도: ${t29}회, 성공: ${s29}회`);
      }

      // 3) 동일 무기 종류로 +0 → +29 까지 도달하는데 평균 시도 수 (다른 캐릭 비교)
      console.log(`\n=== ★ 비교: 다른 캐릭의 같은 item_id 무기 +29+ 도달자 ===`);
      const others = await c.query(
        `SELECT c.name, c.level, c.class_name, ce.enhance_level
           FROM character_equipped ce
           JOIN characters c ON c.id = ce.character_id
          WHERE ce.item_id = $1 AND ce.slot = 'weapon' AND ce.enhance_level >= 29
            AND ce.character_id <> $2
          ORDER BY ce.enhance_level DESC
          LIMIT 20`,
        [w.item_id, cha.id]
      );
      if (others.rowCount === 0) console.log('(같은 item +29+ 보유 캐릭 없음 — 매우 희귀)');
      else for (const o of others.rows) console.log(`  ${o.name}(${o.class_name} L${o.level}) +${o.enhance_level}`);

      // 4) 같은 user 의 다른 캐릭들 (장비 이전 가능성)
      console.log(`\n=== 같은 user 의 다른 캐릭 ===`);
      const sib = await c.query(
        `SELECT id, name, level, class_name FROM characters WHERE user_id = $1 AND id <> $2`,
        [cha.user_id, cha.id]
      );
      if (sib.rowCount === 0) console.log('(없음)');
      else for (const s of sib.rows) console.log(`  ${s.id} ${s.name} (${s.class_name} L${s.level})`);
    }
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
