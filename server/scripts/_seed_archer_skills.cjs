const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

const SKILLS = [
  // id, name, lvl, kind, mult, hits/cd, effect_type, effect_value, effect_duration, desc
  { id: 200, name: '정조준',     lvl: 1,   kind: 'damage', mult: 2.50, cd: 0, et: 'double_chance', ev: 30, ed: 0, desc: '2.5배 데미지 · 30% 확률 추가타 · 기본기' },
  { id: 201, name: '다중 사격',  lvl: 5,   kind: 'damage', mult: 1.60, cd: 3, et: 'multi_hit',     ev: 3,  ed: 0, desc: '1.6배 × 3연타 · 쿨 3행동' },
  { id: 202, name: '백스텝',     lvl: 10,  kind: 'buff',   mult: 0.00, cd: 5, et: 'gauge_fill',    ev: 500, ed: 0, desc: '자기 게이지 +500 · 쿨 5행동 · 자유행동' },
  { id: 203, name: '약점 표시',  lvl: 15,  kind: 'debuff', mult: 1.40, cd: 4, et: 'accuracy_debuff', ev: 20, ed: 5, desc: '1.4배 + 표시 (5행동) · 명중 -20% · 쿨 4행동' },
  { id: 204, name: '분산 사격',  lvl: 20,  kind: 'damage', mult: 1.20, cd: 5, et: 'multi_hit',     ev: 4,  ed: 0, desc: '1.2배 × 4연타 광역 · 쿨 5행동' },
  { id: 205, name: '폭발 화살',  lvl: 25,  kind: 'damage', mult: 3.50, cd: 6, et: 'dot',           ev: 100, ed: 3, desc: '3.5배 + 도트 3행동 (atk×1.0/턴) · 쿨 6행동' },
  { id: 206, name: '회피 사격',  lvl: 30,  kind: 'damage', mult: 4.50, cd: 6, et: 'gauge_fill',    ev: 300, ed: 0, desc: '4.5배 데미지 + 게이지 +300 · 쿨 6행동' },
  { id: 207, name: '정밀 저격',  lvl: 35,  kind: 'damage', mult: 5.00, cd: 5, et: 'crit_bonus',    ev: 30, ed: 0, desc: '5.0배 데미지 · 치명 +30% · 쿨 5행동' },
  { id: 208, name: '화살 비',    lvl: 40,  kind: 'damage', mult: 1.40, cd: 7, et: 'multi_hit',     ev: 6,  ed: 0, desc: '1.4배 × 6연타 광역 · 쿨 7행동' },
  { id: 209, name: '추적 표식',  lvl: 45,  kind: 'debuff', mult: 1.80, cd: 5, et: 'accuracy_debuff', ev: 30, ed: 6, desc: '1.8배 + 강한 표시 (6행동) · 명중 -30% · 쿨 5행동' },
  { id: 210, name: '관통 사격',  lvl: 50,  kind: 'damage', mult: 6.50, cd: 7, et: 'def_pierce',    ev: 50, ed: 0, desc: '6.5배 데미지 · 적 방어 50% 무시 · 쿨 7행동' },
  { id: 211, name: '침묵 화살',  lvl: 55,  kind: 'debuff', mult: 2.50, cd: 6, et: 'cd_increase',   ev: 5,  ed: 2, desc: '2.5배 + 적 스킬 cd +5 (2행동 봉인) · 쿨 6행동' },
  { id: 212, name: '폭격 모드',  lvl: 60,  kind: 'buff',   mult: 0.00, cd: 8, et: 'self_atk_buff', ev: 50, ed: 5, desc: '자기 ATK +50% 5행동 · 쿨 8행동 · 자유행동' },
  { id: 213, name: '그림자 사격', lvl: 65,  kind: 'damage', mult: 7.50, cd: 6, et: 'gauge_fill',    ev: 400, ed: 0, desc: '7.5배 데미지 + 게이지 +400 · 쿨 6행동' },
  { id: 214, name: '화살 폭풍',  lvl: 70,  kind: 'damage', mult: 1.60, cd: 7, et: 'multi_hit',     ev: 8,  ed: 0, desc: '1.6배 × 8연타 광역 · 쿨 7행동' },
  { id: 215, name: '마비 화살',  lvl: 75,  kind: 'damage', mult: 3.00, cd: 8, et: 'stun',          ev: 1,  ed: 1, desc: '3배 데미지 + 1행동 기절 · 쿨 8행동' },
  { id: 216, name: '절대 정밀',  lvl: 80,  kind: 'buff',   mult: 0.00, cd: 9, et: 'self_cri_buff', ev: 50, ed: 5, desc: '자기 치명 +50% 5행동 · 쿨 9행동 · 자유행동' },
  { id: 217, name: '사신의 화살', lvl: 85,  kind: 'damage', mult: 9.00, cd: 6, et: 'hp_pct_damage', ev: 12, ed: 0, desc: '9배 데미지 + 적 HP 12% 추가 · 쿨 6행동' },
  { id: 218, name: '천공 강타',  lvl: 90,  kind: 'damage', mult: 1.70, cd: 8, et: 'multi_hit',     ev: 10, ed: 0, desc: '1.7배 × 10연타 광역 · 쿨 8행동' },
  { id: 219, name: '일격필살',   lvl: 95,  kind: 'damage', mult: 18.0, cd: 8, et: 'crit_bonus',    ev: 50, ed: 0, desc: '18배 데미지 · 치명 +50% · 쿨 8행동' },
  { id: 220, name: '운명의 화살', lvl: 100, kind: 'damage', mult: 35.0, cd: 9, et: 'hp_pct_damage', ev: 30, ed: 0, desc: '35배 + 적 HP 30% 추가 · 쿨 9행동' },
];

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    let inserted = 0, skipped = 0;
    for (const s of SKILLS) {
      try {
        await c.query(
          `INSERT INTO skills (id, class_name, name, description, required_level, damage_mult, kind, cooldown_actions, flat_damage, effect_type, effect_value, effect_duration)
           VALUES ($1, 'archer', $2, $3, $4, $5, $6, $7, 0, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name, description = EXCLUDED.description, required_level = EXCLUDED.required_level,
             damage_mult = EXCLUDED.damage_mult, kind = EXCLUDED.kind, cooldown_actions = EXCLUDED.cooldown_actions,
             effect_type = EXCLUDED.effect_type, effect_value = EXCLUDED.effect_value, effect_duration = EXCLUDED.effect_duration`,
          [s.id, s.name, s.desc, s.lvl, s.mult, s.kind, s.cd, s.et, s.ev, s.ed]
        );
        inserted++;
        console.log(`  ✓ #${s.id} L${s.lvl} ${s.name}`);
      } catch (e) {
        skipped++;
        console.log(`  ✗ #${s.id} ${s.name}: ${e.message.slice(0,80)}`);
      }
    }
    console.log(`\n총 ${inserted}개 INSERT/UPSERT, ${skipped}개 스킵`);
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
