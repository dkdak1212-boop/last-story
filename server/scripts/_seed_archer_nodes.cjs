const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

let id = 1010;
const NODES = [];
function add(zone, tier, name, cost, effects, desc) {
  NODES.push({ id: id++, zone, tier, name, cost, effects, desc });
}

// core/small (27): dex×9 cri×9 spd×9
for (let i = 1; i <= 9; i++) add('core', 'small', `궁수 민첩 ${i}`, 1, [{ stat: 'dex', type: 'stat', value: 5 }], '민첩 +5');
for (let i = 1; i <= 9; i++) add('core', 'small', `궁수 치명 ${i}`, 1, [{ stat: 'cri', type: 'stat', value: 1 }], '치명타 +1%');
for (let i = 1; i <= 9; i++) add('core', 'small', `궁수 스피드 ${i}`, 1, [{ stat: 'spd', type: 'stat', value: 3 }], '스피드 +3');

// core/medium (12)
add('core', 'medium', '궁수 DEX 증강 I',  2, [{ stat: 'dex', type: 'stat', value: 12 }], 'DEX +12');
add('core', 'medium', '궁수 DEX 증강 II', 2, [{ stat: 'dex', type: 'stat', value: 12 }], 'DEX +12');
add('core', 'medium', '궁수 치명 증강 I',  2, [{ stat: 'cri', type: 'stat', value: 3 }], 'CRI +3%');
add('core', 'medium', '궁수 치명 증강 II', 2, [{ stat: 'cri', type: 'stat', value: 3 }], 'CRI +3%');
add('core', 'medium', '궁수 SPD 증강 I',   2, [{ stat: 'spd', type: 'stat', value: 10 }], 'SPD +10');
add('core', 'medium', '궁수 SPD 증강 II',  2, [{ stat: 'spd', type: 'stat', value: 10 }], 'SPD +10');
add('core', 'medium', '관통 강화',        2, [{ key: 'armor_pierce', type: 'passive', value: 10 }], '방어 관통 +10%');
add('core', 'medium', '치명 데미지 강화',  2, [{ key: 'crit_damage', type: 'passive', value: 25 }], '치명타 데미지 +25%');
add('core', 'medium', '다타 누적 강화',    2, [{ key: 'multi_hit_amp_pct', type: 'passive', value: 12 }], 'multi_hit 누적 +12%');
add('core', 'medium', '사거리 강화 I',     2, [{ key: 'archer_range_amp', type: 'passive', value: 1 }], '사거리 스택당 데미지 +1%');
add('core', 'medium', '표적 추적 강화',    2, [{ key: 'mark_extend', type: 'passive', value: 1 }], '표적 지속 +1행동');
add('core', 'medium', '도트 증폭',         2, [{ key: 'dot_amp', type: 'passive', value: 25 }], '도트 데미지 +25%');

// core/large (3)
add('core', 'large', '카이팅 마스터',     5, [{ stat: 'spd', type: 'stat', value: 25 }, { key: 'kite_speed', type: 'passive', value: 15 }], 'SPD +25, 카이팅 스피드 +15');
add('core', 'large', '저격수 본능',       5, [{ stat: 'cri', type: 'stat', value: 8 }, { key: 'crit_damage', type: 'passive', value: 20 }], 'CRI +8, 치명 데미지 +20%');
add('core', 'large', '표적 마스터',       5, [{ key: 'marked_damage_amp', type: 'passive', value: 25 }, { key: 'mark_extend', type: 'passive', value: 2 }], '표적 데미지 +25%, 지속 +2');

// core/huge (5)
add('core', 'huge', '궁수의 진수',       8, [{ stat: 'dex', type: 'stat', value: 30 }, { stat: 'cri', type: 'stat', value: 5 }, { key: 'crit_damage', type: 'passive', value: 30 }], 'DEX +30, CRI +5%, 치명뎀 +30%');
add('core', 'huge', '끝없는 사거리',     8, [{ key: 'archer_range_max', type: 'passive', value: 20 }, { key: 'archer_range_amp', type: 'passive', value: 1 }], '사거리 max +20 (40), 스택당 데미지 +1%');
add('core', 'huge', '관통의 화신',       8, [{ key: 'armor_pierce', type: 'passive', value: 30 }, { key: 'arrow_pierce', type: 'passive', value: 1 }], '방어 관통 +30%, 화살 관통 활성');
add('core', 'huge', '절대 정밀',         8, [{ stat: 'cri', type: 'stat', value: 15 }, { key: 'crit_damage', type: 'passive', value: 50 }], 'CRI +15%, 치명뎀 +50%');
add('core', 'huge', '저격수의 호흡',     8, [{ key: 'precise_chain', type: 'passive', value: 5 }, { stat: 'spd', type: 'stat', value: 30 }], '연속 처치당 CRI +5, SPD +30');

// north_archer/small (20)
for (let i = 1; i <= 7; i++) add('north_archer', 'small', `정밀 ${i}`, 1, [{ stat: 'cri', type: 'stat', value: 1 }], 'CRI +1%');
for (let i = 1; i <= 7; i++) add('north_archer', 'small', `민첩 ${i}`, 1, [{ stat: 'dex', type: 'stat', value: 5 }], 'DEX +5');
for (let i = 1; i <= 6; i++) add('north_archer', 'small', `속도 ${i}`, 1, [{ stat: 'spd', type: 'stat', value: 3 }], 'SPD +3');

// north_archer/medium (13)
add('north_archer', 'medium', '저격수의 시야',   2, [{ stat: 'cri', type: 'stat', value: 6 }, { key: 'crit_damage', type: 'passive', value: 10 }], 'CRI +6%, 치명뎀 +10%');
add('north_archer', 'medium', '관통의 비수',     2, [{ key: 'armor_pierce', type: 'passive', value: 12 }], '방관 +12%');
add('north_archer', 'medium', '폭격 가속',       2, [{ stat: 'spd', type: 'stat', value: 15 }, { key: 'multi_hit_amp_pct', type: 'passive', value: 8 }], 'SPD +15, 다타 +8%');
add('north_archer', 'medium', '추격자',          2, [{ key: 'kite_speed', type: 'passive', value: 10 }, { key: 'precise_chain', type: 'passive', value: 2 }], '카이팅 +10, 처치 CRI +2');
add('north_archer', 'medium', '약점 분석',       2, [{ key: 'marked_damage_amp', type: 'passive', value: 15 }], '표적 데미지 +15%');
add('north_archer', 'medium', '인내의 화살',     2, [{ key: 'lifesteal_pct', type: 'passive', value: 5 }], '흡혈 +5%');
add('north_archer', 'medium', '도트 마스터',     2, [{ key: 'dot_amp', type: 'passive', value: 20 }], '도트 +20%');
add('north_archer', 'medium', '연계 사격',       2, [{ key: 'multi_hit_amp_pct', type: 'passive', value: 10 }, { stat: 'cri', type: 'stat', value: 4 }], '다타 +10%, CRI +4%');
add('north_archer', 'medium', '사거리 확장',     2, [{ key: 'archer_range_max', type: 'passive', value: 5 }], '사거리 max +5');
add('north_archer', 'medium', '바람의 의지',     2, [{ stat: 'dex', type: 'stat', value: 15 }, { stat: 'spd', type: 'stat', value: 8 }], 'DEX +15, SPD +8');
add('north_archer', 'medium', '표적의 별',       2, [{ key: 'mark_extend', type: 'passive', value: 2 }, { key: 'marked_damage_amp', type: 'passive', value: 10 }], '표적 +2행동, +10%');
add('north_archer', 'medium', '폭주 화살',       2, [{ key: 'crit_damage', type: 'passive', value: 18 }], '치명뎀 +18%');
add('north_archer', 'medium', '끝없는 활시위',   2, [{ key: 'archer_range_amp', type: 'passive', value: 1 }, { stat: 'cri', type: 'stat', value: 3 }], '사거리뎀 +1%/스택, CRI +3%');

// north_archer/large (12)
add('north_archer', 'large', '폭풍 사수',     4, [{ key: 'multi_hit_amp_pct', type: 'passive', value: 15 }, { stat: 'spd', type: 'stat', value: 20 }], '다타 +15%, SPD +20');
add('north_archer', 'large', '천공의 화신',   4, [{ stat: 'cri', type: 'stat', value: 10 }, { key: 'crit_damage', type: 'passive', value: 15 }], 'CRI +10%, 치명뎀 +15%');
add('north_archer', 'large', '관통의 군주',   4, [{ key: 'armor_pierce', type: 'passive', value: 20 }, { stat: 'dex', type: 'stat', value: 20 }], '방관 +20%, DEX +20');
add('north_archer', 'large', '바람의 군주',   4, [{ stat: 'spd', type: 'stat', value: 30 }, { key: 'kite_speed', type: 'passive', value: 15 }], 'SPD +30, 카이팅 +15');
add('north_archer', 'large', '표적 사냥꾼',   4, [{ key: 'marked_damage_amp', type: 'passive', value: 25 }, { key: 'mark_extend', type: 'passive', value: 2 }], '표적 +25%, 지속 +2');
add('north_archer', 'large', '집중 호흡',     4, [{ key: 'precise_chain', type: 'passive', value: 4 }, { stat: 'cri', type: 'stat', value: 8 }], '연계 +4, CRI +8%');
add('north_archer', 'large', '연쇄 사살',     4, [{ key: 'precise_chain', type: 'passive', value: 3 }, { key: 'archer_range_amp', type: 'passive', value: 1 }], '연계 +3, 사거리뎀 +1%');
add('north_archer', 'large', '폭격 모드',     4, [{ key: 'multi_hit_amp_pct', type: 'passive', value: 12 }, { stat: 'dex', type: 'stat', value: 15 }], '다타 +12%, DEX +15');
add('north_archer', 'large', '심장 관통',     4, [{ key: 'armor_pierce', type: 'passive', value: 15 }, { key: 'crit_damage', type: 'passive', value: 18 }], '방관 +15%, 치명뎀 +18%');
add('north_archer', 'large', '폭풍의 활',     4, [{ stat: 'spd', type: 'stat', value: 25 }, { key: 'multi_hit_amp_pct', type: 'passive', value: 10 }], 'SPD +25, 다타 +10%');
add('north_archer', 'large', '죽음의 표적',   4, [{ key: 'marked_damage_amp', type: 'passive', value: 20 }, { key: 'mark_extend', type: 'passive', value: 3 }], '표적 +20%, 지속 +3');
add('north_archer', 'large', '치명의 별',     4, [{ stat: 'cri', type: 'stat', value: 12 }, { key: 'precise_chain', type: 'passive', value: 2 }], 'CRI +12%, 연계 +2');

// north_archer/huge (3)
add('north_archer', 'huge', '정밀의 화신',   8, [{ key: 'precise_chain', type: 'passive', value: 8 }, { stat: 'cri', type: 'stat', value: 20 }, { key: 'crit_damage', type: 'passive', value: 30 }], '연계 +8, CRI +20%, 치명뎀 +30%');
add('north_archer', 'huge', '그림자 궁수',   8, [{ key: 'kite_speed', type: 'passive', value: 30 }, { stat: 'spd', type: 'stat', value: 50 }], '카이팅 +30, SPD +50');
add('north_archer', 'huge', '화살의 거장',   8, [{ key: 'multi_hit_amp_pct', type: 'passive', value: 30 }, { key: 'archer_range_amp', type: 'passive', value: 2 }], '다타 +30%, 사거리뎀 +2%/스택');

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    let inserted = 0;
    for (const n of NODES) {
      try {
        await c.query(
          `INSERT INTO node_definitions (id, name, description, zone, tier, cost, class_exclusive, effects, prerequisites, position_x, position_y, hidden)
           VALUES ($1, $2, $3, $4, $5, $6, 'archer', $7::jsonb, '{}'::int[], 0, 0, false)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name, description = EXCLUDED.description,
             zone = EXCLUDED.zone, tier = EXCLUDED.tier, cost = EXCLUDED.cost,
             effects = EXCLUDED.effects`,
          [n.id, n.name, n.desc, n.zone, n.tier, n.cost, JSON.stringify(n.effects)]
        );
        inserted++;
      } catch (e) {
        console.log(`  X #${n.id} ${n.name}: ${e.message.slice(0, 80)}`);
      }
    }
    console.log(`OK archer 노드 ${inserted}개 INSERT/UPSERT (id ${NODES[0].id}~${NODES[NODES.length - 1].id})`);
    const r = await c.query(`SELECT zone, tier, COUNT(*) AS cnt FROM node_definitions WHERE class_exclusive='archer' GROUP BY zone, tier ORDER BY zone, tier`);
    console.log('\narcher zone/tier 분포:');
    for (const row of r.rows) console.log(`  ${row.zone}/${row.tier}: ${row.cnt}개`);
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
