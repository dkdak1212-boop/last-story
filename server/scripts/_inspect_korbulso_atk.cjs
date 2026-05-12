// 코뿔소 — 반대의균형 ON/OFF 시 ATK 차이 검증
// 공식 (character.ts:266-269):
//   bonusAtkImplied  = eff.atk / (1 + oldStr*0.005)
//   ATK(INV)         = bonusAtkImplied * (1 + newStr*0.005)
// 여기서 eff.atk 는 inversion 적용 직전의 atk (장비/노드 보너스 적용 후, 클래스 패시브 +0.25%/STR 적용 전).
// warrior 클래스 패시브 atk*(1+str*0.0025) 도 inversion 후 적용되는 newStr 기반으로 재적용 → 추가 차이.
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  try {
    const r = await pool.query(`
      SELECT id, name, level, class_name, stats,
             COALESCE(atk_boost_until, NULL) AS atk_boost_until
        FROM characters WHERE name = '코뿔소'`);
    if (!r.rowCount) return console.log('NO CHAR');
    const c = r.rows[0];
    console.log('[char]', c);
    const cur = c.stats || {};
    const oldStr = cur.str ?? 0, oldInt = cur.int ?? 0;
    console.log(`[stats] STR=${oldStr} INT=${oldInt} DEX=${cur.dex} VIT=${cur.vit}`);

    // 가정: bonusAtk(장비/노드 보너스 포함, 클래스 패시브 적용 전 atk) 추정.
    // 실제 값은 캐릭터 inspect 가 가장 정확하나, 여기선 사용자 보고 "잃은 공격력 36000" 역산만.
    // 잃은 ATK = ATK(no INV) - ATK(INV)
    //   ATK(no INV) = bonusAtk * (1 + 176*0.005) * (1 + 176*0.0025)  // warrior 패시브
    //                = bonusAtk * 1.88 * 1.44 = bonusAtk * 2.7072
    //   ATK(INV):
    //     newStr = round(4*1.5) = 6
    //     ATK(INV) = bonusAtk * (1 + 6*0.005) * (1 + 6*0.0025)
    //              = bonusAtk * 1.03 * 1.015 = bonusAtk * 1.04545
    //   diff factor = 2.7072 - 1.04545 = 1.66175
    // diff = bonusAtk * 1.66175 → bonusAtk = diff / 1.66175

    const newStrInv = Math.round(oldInt * 1.5);
    const noInvFactor = (1 + oldStr * 0.005) * (1 + oldStr * 0.0025);
    const invFactor   = (1 + newStrInv * 0.005) * (1 + newStrInv * 0.0025);
    const diffFactor  = noInvFactor - invFactor;
    console.log(`[factor] noINV=${noInvFactor.toFixed(4)} INV=${invFactor.toFixed(4)} diff=${diffFactor.toFixed(4)} (×bonusAtk)`);

    // 사용자가 본 ATK 값 (약 36000 잃음)
    const reportedLoss = 36000;
    const bonusAtkEst = reportedLoss / diffFactor;
    console.log(`[역산] reportedLoss=${reportedLoss} → bonusAtk≈${bonusAtkEst.toFixed(0)}`);
    console.log(`[추정 ATK] noINV ≈ ${(bonusAtkEst * noInvFactor).toFixed(0)}, INV ≈ ${(bonusAtkEst * invFactor).toFixed(0)}`);

    // 장비 보너스 atk 합산 — 캐릭터 장착 prefix_stats 의 atk/atk_pct 만 빠르게 조회
    const eqR = await pool.query(`
      SELECT ce.slot, ci.prefix_stats, i.atk, i.matk
        FROM character_equipped ce
        JOIN items i ON i.id = ce.item_id
        LEFT JOIN character_inventory ci
               ON ci.character_id = ce.character_id AND ci.item_id = ce.item_id
        WHERE ce.character_id = $1`, [c.id]);
    let baseAtk = 0, atkPct = 0, atkFlat = 0;
    for (const row of eqR.rows) {
      baseAtk += Number(row.atk) || 0;
      const ps = row.prefix_stats || {};
      atkPct += Number(ps.atk_pct || 0);
      atkFlat += Number(ps.atk || 0);
      console.log(`  [eq ${row.slot}] base_atk=${row.atk} prefix_atk=${ps.atk||0} prefix_atk_pct=${ps.atk_pct||0}`);
    }
    console.log(`[장비합] base_atk=${baseAtk} flat=${atkFlat} pct=${atkPct}%`);
    const equipAtk = (baseAtk + atkFlat) * (1 + atkPct/100);
    console.log(`[equipAtk] = (${baseAtk}+${atkFlat}) * (1+${atkPct}/100) = ${equipAtk.toFixed(0)}`);
  } finally { await pool.end(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
