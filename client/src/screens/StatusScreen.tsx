import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { STAT_LABEL } from '../components/ui/ItemStats';
import { ClassIcon } from '../components/ui/ClassIcon';
import type { Stats, ClassName } from '../types';

interface GainBreakdown {
  prefix: number; guild: number; personal: number; event: number; territory?: number; total: number;
}
interface CharStatus {
  level: number; exp: number; expToNext: number; expPercent: number;
  gold: number; hp: number; className: string;
  statPoints: number;
  baseStats: Stats; baseMaxHp: number;
  equipBonus: Partial<Stats>;
  nodeBonus: Partial<Stats>;
  effective: Stats & { maxHp: number; atk: number; matk: number; def: number; mdef: number; dodge: number; accuracy: number };
  guildBuff: { name: string; pct: number } | null;
  prefixBonuses: Record<string, number>;
  passiveBonuses: Record<string, number>;
  gainBonuses?: { gold: GainBreakdown; exp: GainBreakdown; drop: GainBreakdown };
}

const CLASS_LABEL: Record<string, string> = {
  warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적', summoner: '소환사',
};

const PREFIX_LABEL: Record<string, string> = {
  // 기본 스탯 접두사 (접두사 롤에 붙을 수 있음)
  str: '힘',
  dex: '민첩',
  int: '지능',
  vit: '체력',
  spd: '스피드',
  cri: '치명타 확률',
  accuracy: '명중',
  dodge: '회피',
  // 특수 접두사
  berserk_pct: '광폭 (데미지 +%)',
  first_strike_pct: '약점간파 (첫 공격 +%)',
  ambush_pct: '기습 (5초 미피격 시 +%)',
  crit_dmg_pct: '치명타 데미지 +%',
  lifesteal_pct: '생명력 흡수 %',
  gauge_on_crit_pct: '치명타 시 게이지 +%',
  thorns_pct: '가시 반사 %',
  guardian_pct: '수호 (피해감소 %)',
  damage_taken_down_pct: '받는 피해 감소 %',
  predator_pct: '포식 (처치 시 HP회복 %)',
  hp_regen: 'HP 재생 (/초)',
  slow_pct: '저주 (몬스터 속도 -%)',
  def_reduce_pct: '몬스터 방어력 감소 %',
  dot_amp_pct: '도트 데미지 +%',
  gold_bonus_pct: '골드 획득 +%',
  exp_bonus_pct: '경험치 획득 +%',
  atk_pct: '물리 공격 +%',
  matk_pct: '마법 공격 +%',
  hp_pct: '최대 HP +%',
  max_hp_pct: '최대 HP +%',
  drop_rate_pct: '드랍률 +%',
  multi_hit_amp_pct: '다단 타격 데미지 +%',
  def_pierce_pct: '방어 추가 무시 %',
  miss_combo_pct: '빗나감 누적 보너스 +%',
  evasion_burst_pct: '회피 직후 다음 공격 +%',
  // 유니크 전용
  shield_amp: '실드 효과 +%',
  summon_amp: '소환수 데미지 +%',
  summon_double_hit: '소환수 2회 타격 %',
  summon_max_extra: '최대 소환수 +',
  // 110제 craft 추가 옵션
  execute_pct: '처형 (적 HP 20% 이하 시 데미지 +%)',
  undispellable: '버프 디스펠 면역',
  shield_on_low_hp: '저체력 자동 실드 (HP 30% 이하, max_hp %)',
  reflect_skill: '스킬 피해 반사 %',
  def_convert_atk: '방어력→공격력 전환 %',
};

const PASSIVE_LABEL: Record<string, string> = {
  crit_damage: '치명타 데미지 +%',
  armor_pierce: '방어 관통',
  spell_amp: '스킬 데미지 +%',
  dot_amp: '도트 데미지 +%',
  poison_amp: '독 데미지 +%',
  bleed_amp: '출혈 데미지 +%',
  burn_amp: '화상 데미지 +%',
  holy_dot_amp: '신성 도트 +%',
  elemental_storm: '원소 폭풍 +%',
  poison_lord: '독의 군주 +%',
  judge_amp: '심판 데미지 +%',
  holy_judge: '신성 심판 +%',
  cooldown_reduce: '쿨다운 감소 %',
  mana_flow: '마나의 흐름 (쿨 -)',
  dot_resist: '도트 저항 %',
  shield_amp: '쉴드 강화 %',
  extra_hit: '추가 타격',
  chain_action_amp: '연쇄 공격 +%',
  bleed_on_hit: '출혈 확률 %',
  crit_lifesteal: '치명타 흡혈 %',
  lifesteal_amp: '흡혈 증폭 %',
  rage_reduce: '분노 소모 감소',
  freeze_extend: '동결 연장',
  stun_extend: '기절 연장',
  smoke_extend: '연막 연장',
  control_amp: 'CC 증폭 %',
  gauge_control_amp: '게이지 조절 +%',
  frost_amp: '빙결 데미지 +%',
  poison_burst_amp: '독 폭발 +%',
  summon_amp: '소환수 데미지 +%',
  summon_double_hit: '소환수 2회 공격 %',
  summon_duration: '소환 지속 +턴',
  summon_infinite: '소환 영구 유지',
  summon_max_extra: '최대 소환수 +',
  summon_all_cdr: '소환 전원 쿨 감소 %',
  summon_all_element_dmg: '전 원소 소환 데미지 +%',
  summon_hybrid_all: '혼종 소환 강화 +%',
  summon_element_burst: '원소 폭발 데미지 +%',
  summon_dps_atk: '소환수 공격력 +%',
  summon_fire_dmg: '소환 화염 데미지 +%',
  summon_fire_pen: '소환 화염 관통 %',
  summon_fire_crit: '소환 화염 치명타 %',
  summon_fire_crit_dmg: '소환 화염 치명타 데미지 +%',
  summon_frost_dmg: '소환 빙결 데미지 +%',
  summon_frost_pen: '소환 빙결 관통 %',
  summon_frost_crit: '소환 빙결 치명타 %',
  summon_frost_crit_dmg: '소환 빙결 치명타 데미지 +%',
  summon_lightning_dmg: '소환 번개 데미지 +%',
  summon_lightning_pen: '소환 번개 관통 %',
  summon_lightning_crit: '소환 번개 치명타 %',
  summon_lightning_crit_dmg: '소환 번개 치명타 데미지 +%',
  summon_earth_dmg: '소환 대지 데미지 +%',
  summon_earth_pen: '소환 대지 관통 %',
  summon_earth_crit: '소환 대지 치명타 %',
  summon_earth_crit_dmg: '소환 대지 치명타 데미지 +%',
  summon_holy_dmg: '소환 신성 데미지 +%',
  summon_holy_pen: '소환 신성 관통 %',
  summon_holy_crit: '소환 신성 치명타 %',
  summon_holy_crit_dmg: '소환 신성 치명타 데미지 +%',
  summon_holy_heal: '소환 신성 회복',
  summon_dark_dmg: '소환 암흑 데미지 +%',
  summon_dark_pen: '소환 암흑 관통 %',
  summon_dark_crit: '소환 암흑 치명타 %',
  summon_dark_crit_dmg: '소환 암흑 치명타 데미지 +%',
  summon_dark_lifesteal: '소환 암흑 흡혈 %',
  aura_dmg: '오오라 데미지 +%',
  aura_heal: '오오라 회복',
  aura_pen: '오오라 관통',
  aura_crit: '오오라 치명타 %',
  aura_lifesteal: '오오라 흡혈 %',
  aura_multiplier: '오오라 배율 2배',
  element_synergy: '원소 시너지 +%',
  war_god: '전쟁의 신 (ATK +%)',
  shadow_dance: '그림자 춤 (회피 +)',
  trickster: '트릭스터 (치명타 +)',
  iron_will: '강철의 의지 (DEF +%)',
  mana_overload: '마나 과부하 (MATK +%)',
  focus_mastery: '집중 숙련 (명중 +)',
  berserker_heart: '광전사의 심장 (ATK+/DEF-)',
  sanctuary_guard: '성역의 수호 (HP +%)',
  balance_apostle: '균형의 사도 (전스탯 +%)',
  counter_incarnation: '반격의 화신 (반사)',
  dot_to_crit: '도트→치명타 변환 (도트1%당 치명타+0.5%)',
  dot_penalty: '도트 데미지 감소 %',
  assassin_execute: '즉사 확률 % (적 HP 15% 이하 치명타 시)',
  blade_storm_amp: 'multi_hit 타격당 누적 데미지 +%',
  speed_to_dmg: 'SPD→ATK 변환 %',
  combo_kill_bonus: '연속킬 데미지 보너스 % (최대 5중첩)',
  blade_flurry: '칼날 추가타 확률 %',
  lethal_tempo: '킬 시 쿨다운 감소 (행동)',
  shadow_strike: '첫 스킬 데미지 +%',
};

type BonusCategory = { label: string; entries: [string, number, string][] };
function categorizeBonuses(prefixes: Record<string, number>, passives: Record<string, number>): BonusCategory[] {
  const cats: BonusCategory[] = [];
  const prefixEntries: [string, number, string][] = [];
  for (const [k, v] of Object.entries(prefixes)) {
    if (v === 0) continue;
    prefixEntries.push([k, v, PREFIX_LABEL[k] || k]);
  }
  if (prefixEntries.length > 0) cats.push({ label: '장비 접두사', entries: prefixEntries });

  const passiveEntries: [string, number, string][] = [];
  for (const [k, v] of Object.entries(passives)) {
    if (v === 0) continue;
    passiveEntries.push([k, v, PASSIVE_LABEL[k] || k]);
  }
  if (passiveEntries.length > 0) cats.push({ label: '노드 패시브', entries: passiveEntries });

  return cats;
}

const STAT_ORDER: (keyof Stats)[] = ['str', 'dex', 'int', 'vit', 'spd', 'cri'];

// 전투 능력치 클릭 설명
const COMBAT_STAT_DESC: Record<string, string> = {
  'HP': '캐릭터의 생명력. 0이 되면 사망하여 HP 100% 회복 후 마을 귀환.',
  '물리 공격': '물리 데미지 = 힘(STR) × 1.5 + 장비 ATK 보너스. 전사/도적이 사용.',
  '마법 공격': '마법 데미지 = 지능(INT) × 1.5 + 장비 MATK 보너스. 마법사/성직자/소환사가 사용.',
  '방어력': '물리 피해 감소 = 체력(VIT) × 0.8 + 장비 DEF. 데미지 계산: ATK - 방어 × 0.5',
  '마법 방어': '마법 피해 감소 = 지능(INT) × 0.5 + 장비 MDEF. 데미지 계산: MATK - 마방 × 0.5',
  '회피율': '공격을 회피할 확률. 민첩(DEX) × 0.2 + 장비. 상한 70%.',
  '명중률': '공격이 적중할 확률. 기본 80% + 민첩(DEX) × 0.3 + 장비. 상한 100%.',
  '스피드': '게이지 충전 스피드. 높을수록 빠르게 행동. 게이지 MAX=1000, 매 틱 SPD × 0.2 충전.',
  '치명타 확률': '크리티컬 발동 확률. 발동 시 데미지 2배. 상한 100%. 노드/장비로 상승.',
};

export function StatusScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const [status, setStatus] = useState<CharStatus | null>(null);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    if (!active) return;
    api<CharStatus>(`/characters/${active.id}/status`).then(setStatus).catch(() => {});
  }
  useEffect(reload, [active?.id]);

  async function spendStat(stat: keyof Stats, amount: number = 1) {
    if (!active || busy) return;
    setBusy(true);
    try {
      await api(`/characters/${active.id}/spend-stat`, { method: 'POST', body: JSON.stringify({ stat, amount }) });
      reload();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); } finally { setBusy(false); }
  }

  async function resetStats() {
    if (!active || busy) return;
    if (!confirm('분배한 STR/DEX/INT/VIT를 초기화합니다. (무료)\nVIT로 얻은 HP는 함께 사라지며, 현재 HP가 최대 HP를 넘으면 그만큼 깎입니다.\n계속하시겠습니까?')) return;
    setBusy(true);
    try {
      const r = await api<{ refunded: number; hpReduced: number }>(`/characters/${active.id}/reset-stats`, { method: 'POST' });
      alert(`초기화 완료\n환불된 포인트: ${r.refunded}\n감소한 HP: ${r.hpReduced}`);
      reload();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); } finally { setBusy(false); }
  }

  if (!status || !active) return <div style={{ color: 'var(--text-dim)' }}>로딩...</div>;

  return (
    <div>
      <h2 style={{ marginBottom: 20, color: 'var(--accent)' }}>캐릭터 상태</h2>

      {/* 기본 정보 */}
      <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ClassIcon className={status.className as ClassName} size={36} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{active.name}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                Lv.{status.level} {CLASS_LABEL[status.className]}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 13 }}>
            <div style={{ color: 'var(--accent)' }}>{status.gold.toLocaleString()}G</div>
          </div>
        </div>
        {/* EXP bar */}
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>
          경험치 {status.exp.toLocaleString()} / {status.expToNext.toLocaleString()} ({status.expPercent}%)
        </div>
        <div style={{ height: 6, background: 'var(--bg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ width: `${status.expPercent}%`, height: '100%', background: 'var(--accent)' }} />
        </div>
      </div>

      <div className="status-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* 전투 능력치 (클릭 시 설명) */}
        <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 14, marginBottom: 10, color: 'var(--accent)' }}>전투 능력치 <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 400 }}>클릭 시 설명</span></h3>
          <CombatRow label="HP" value={`${status.hp} / ${status.effective.maxHp}`} onClick={() => setTooltip(tooltip === 'HP' ? null : 'HP')} active={tooltip === 'HP'} />
          {tooltip === 'HP' && <Desc text={COMBAT_STAT_DESC['HP']} />}
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />
          {[
            { label: '물리 공격', value: status.effective.atk },
            { label: '마법 공격', value: status.effective.matk },
            { label: '방어력', value: status.effective.def },
            { label: '마법 방어', value: status.effective.mdef },
            { label: '회피율', value: `${status.effective.dodge}%` },
            { label: '명중률', value: `${status.effective.accuracy}%` },
            { label: '스피드', value: status.effective.spd },
            { label: '치명타 확률', value: `${status.effective.cri}%` },
          ].map(s => (
            <div key={s.label}>
              <CombatRow label={s.label} value={s.value} onClick={() => setTooltip(tooltip === s.label ? null : s.label)} active={tooltip === s.label} />
              {tooltip === s.label && <Desc text={COMBAT_STAT_DESC[s.label]} />}
            </div>
          ))}
        </div>

        {/* 스탯 */}
        <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, color: 'var(--accent)', margin: 0 }}>스탯</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={resetStats}
                disabled={busy}
                style={{ fontSize: 11, padding: '4px 8px', background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text-dim)', cursor: busy ? 'not-allowed' : 'pointer' }}
              >
                초기화 (무료)
              </button>
              <div style={{ fontSize: 12, color: status.statPoints > 0 ? 'var(--accent)' : 'var(--text-dim)', fontWeight: 700 }}>
                스탯 포인트: {status.statPoints}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 50px 50px 55px 130px', gap: 4, fontSize: 12, alignItems: 'center' }}>
            <div style={{ color: 'var(--text-dim)' }}></div>
            <div style={{ color: 'var(--text-dim)', textAlign: 'right' }}>기본</div>
            <div style={{ color: 'var(--text-dim)', textAlign: 'right' }}>장비</div>
            <div style={{ color: '#8b8bef', textAlign: 'right' }}>노드</div>
            <div style={{ color: 'var(--text-dim)', textAlign: 'right' }}>합계</div>
            <div></div>
            {STAT_ORDER.map((k) => {
              const base = status.baseStats[k] || 0;
              const eq = (status.equipBonus[k] || 0) as number;
              const node = (status.nodeBonus?.[k] || 0) as number;
              const total = status.effective[k] || 0;
              const spendable = k === 'str' || k === 'dex' || k === 'int' || k === 'vit';
              return (
                <StatRow key={k} label={STAT_LABEL[k]} base={base} eq={eq} node={node} total={total}
                  canSpend={spendable && status.statPoints > 0 && !busy}
                  spendable={spendable}
                  statPoints={status.statPoints}
                  onSpend={(amt: number) => spendStat(k, amt)}
                />
              );
            })}
          </div>
          {status.statPoints > 0 && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-dim)' }}>+1 / +5 / +10 / 전체 버튼으로 스탯을 분배할 수 있습니다.</div>
          )}
        </div>
      </div>

      {status.guildBuff && (
        <div style={{ marginTop: 14, padding: 12, background: 'var(--bg-panel)', border: '1px solid var(--accent)', fontSize: 13 }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>길드 버프</span>{' '}
          <span style={{ color: 'var(--text-dim)' }}>({status.guildBuff.name})</span>{' '}
          모든 전투 능력치 +{status.guildBuff.pct}%
        </div>
      )}

      {/* 획득 보너스 요약 — gold/exp/drop 소스별 */}
      {status.gainBonuses && (
        <div style={{ marginTop: 14, padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 14, marginBottom: 10, color: 'var(--accent)' }}>획득 보너스 합산</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: '6px 10px', fontSize: 12, alignItems: 'center' }}>
            {([
              ['gold', '골드', '#e0a040', status.gainBonuses.gold],
              ['exp', '경험치', '#8b8bef', status.gainBonuses.exp],
              ['drop', '드랍률', '#66dd66', status.gainBonuses.drop],
            ] as const).map(([k, label, color, b]) => {
              const parts: string[] = [];
              if (b.prefix > 0) parts.push(`접두사 +${b.prefix}%`);
              if (b.guild > 0) parts.push(`길드 +${b.guild}%`);
              if (b.territory && b.territory > 0) parts.push(`영토 +${b.territory}%`);
              if (b.personal > 0) parts.push(`개인 +${b.personal}%`);
              if (b.event > 0) parts.push(`이벤트 +${b.event}%`);
              return (
                <div key={k} style={{ display: 'contents' }}>
                  <span style={{ color, fontWeight: 700 }}>{label}</span>
                  <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{parts.length > 0 ? parts.join(' · ') : '—'}</span>
                  <span style={{ color, fontWeight: 700, textAlign: 'right' }}>{b.total > 0 ? `+${b.total}%` : '0%'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 추가 능력치 (접두사 + 노드 패시브) */}
      {(() => {
        const cats = categorizeBonuses(status.prefixBonuses || {}, status.passiveBonuses || {});
        if (cats.length === 0) return null;
        return (
          <div style={{ marginTop: 14, padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 14, marginBottom: 12, color: 'var(--accent)' }}>추가 능력치</h3>
            {cats.map(cat => (
              <div key={cat.label} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700, marginBottom: 6, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                  {cat.label}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '3px 12px', fontSize: 12 }}>
                  {cat.entries.map(([key, val, label]) => (
                    <div key={key} style={{ display: 'contents' }}>
                      <span style={{ color: 'var(--text)' }}>{label}</span>
                      <span style={{ color: 'var(--accent)', fontWeight: 700, textAlign: 'right' }}>{val > 0 ? `+${val}` : val}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      <div style={{ marginTop: 14, padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-dim)' }}>
        <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8, fontSize: 13 }}>스탯 안내</div>
        <div className="stat-guide-grid" style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '4px 8px' }}>
          <span style={{ color: 'var(--text)' }}>힘 (STR)</span><span>물리 공격력 = 힘 × 1.5 + 장비 ATK. 전사/도적 핵심 스탯</span>
          <span style={{ color: 'var(--text)' }}>민첩 (DEX)</span><span>회피율 = 민첩 × 0.2% (상한 70%) · 명중률 = 80% + 민첩 × 0.3% (상한 100%)</span>
          <span style={{ color: 'var(--text)' }}>지능 (INT)</span><span>마법 공격 = 지능 × 1.5 + 장비 MATK · 마법 방어 = 지능 × 0.5 + 장비 MDEF · 마법사/성직자/소환사 핵심 스탯</span>
          <span style={{ color: 'var(--text)' }}>체력 (VIT)</span><span>방어력 = 체력 × 0.8 + 장비 DEF · <span style={{ color: 'var(--danger)' }}>기본 14 고정</span> (노드/장비로만 상승)</span>
          <span style={{ color: 'var(--text)' }}>스피드 (SPD)</span><span>게이지 충전 스피드 · <span style={{ color: 'var(--danger)' }}>기본 200 고정</span> (노드/장비로만 상승)</span>
          <span style={{ color: 'var(--text)' }}>치명타 (CRI)</span><span>크리 확률 % (상한 100%). 발동 시 데미지 2배. <span style={{ color: 'var(--danger)' }}>기본 5% 고정</span> (노드/장비로만 상승)</span>
        </div>
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>전투 팁</div>
          <div>· <span style={{ color: 'var(--text)' }}>전사/도적</span>은 ATK(물리), <span style={{ color: 'var(--text)' }}>마법사/성직자/소환사</span>는 MATK(마법) 고정 사용</div>
          <div>· 데미지 공식: <span style={{ color: 'var(--text)' }}>(ATK/MATK) × 스킬배율 − (DEF/MDEF × 0.5) + 고정피해 ± 10%</span></div>
          <div>· 게이지 MAX = 1000 · SPD 300 → 약 1.7초 주기 · 자동/수동 전환 가능</div>
          <div>· <span style={{ color: 'var(--text)' }}>레벨업</span>: HP +25, 노드포인트 +1, 스탯포인트 +2 (힘/민첩/지능만 수동 분배 — 체력/스피드/치명타는 고정)</div>
          <div>· <span style={{ color: 'var(--text)' }}>CC 면역</span>: 스턴/동결이 걸린 후 지속시간 + 3턴 동안 추가 CC 차단</div>
          <div>· <span style={{ color: 'var(--text)' }}>사망</span>: HP 100% 회복 후 마을 귀환, 패널티 없음</div>
          <div>· <span style={{ color: 'var(--text)' }}>품질</span>: 드롭 시 0~100% 랜덤, 기본 스탯에 추가 배율 (품질/100 만큼 덧셈)</div>
          <div>· <span style={{ color: 'var(--text)' }}>강화</span>: 단계당 +7.5% 스탯 / +1~3(100%) → +19~20(5%/파괴 40%)</div>
          <div>· <span style={{ color: 'var(--text)' }}>접두사</span>: 1~3옵(1옵 90%/2옵 9%/3옵 1%), T1~T4 등급 (T4 0.1%), 강화당 수치 +5%</div>
          <div>· <span style={{ color: 'var(--text)' }}>길드 버프</span>: 체력/골드/경험/드랍 4종 스킬, 영토 점령 시 경험/드랍 +15% 추가</div>
          <div>· <span style={{ color: 'var(--text)' }}>일일 임무</span>: 3개 완료 시 EXP/골드/드랍 +50% 3시간 + 찢어진 스크롤 1개 (KST 자정 초기화)</div>
        </div>
      </div>
    </div>
  );
}

function CombatRow({ label, value, onClick, active }: { label: string; value: string | number; onClick: () => void; active: boolean }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 6px', cursor: 'pointer',
        background: active ? 'rgba(201,162,77,0.08)' : 'transparent',
        borderRadius: 4, transition: 'background 0.15s',
      }}
    >
      <span style={{ color: active ? 'var(--accent)' : 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function Desc({ text }: { text: string }) {
  return (
    <div style={{
      padding: '6px 10px', marginBottom: 4, fontSize: 11, lineHeight: 1.5,
      color: '#ccc', background: 'rgba(201,162,77,0.06)',
      borderLeft: '3px solid var(--accent)', borderRadius: '0 4px 4px 0',
    }}>
      {text}
    </div>
  );
}

function StatRow({ label, base, eq, node, total, canSpend, spendable = true, statPoints = 0, onSpend }: { label: string; base: number; eq: number; node: number; total: number; canSpend?: boolean; spendable?: boolean; statPoints?: number; onSpend?: (amount: number) => void }) {
  const btnStyle = (amt: number) => {
    const ok = canSpend && statPoints >= amt;
    return {
      padding: '2px 4px', fontSize: 10, fontWeight: 700 as const,
      background: ok ? 'var(--accent)' : 'transparent',
      color: ok ? '#000' : 'var(--text-dim)',
      border: `1px solid ${ok ? 'var(--accent)' : 'var(--border)'}`,
      cursor: ok ? 'pointer' : 'not-allowed', borderRadius: 3,
      opacity: ok ? 1 : 0.4, minWidth: 22,
    };
  };
  return (
    <>
      <div style={{ color: 'var(--text)' }}>{label}</div>
      <div style={{ textAlign: 'right' }}>{base}</div>
      <div style={{ textAlign: 'right', color: eq > 0 ? 'var(--success)' : 'var(--text-dim)' }}>
        {eq > 0 ? `+${eq}` : '-'}
      </div>
      <div style={{ textAlign: 'right', color: node > 0 ? '#8b8bef' : 'var(--text-dim)' }}>
        {node > 0 ? `+${node}` : '-'}
      </div>
      <div style={{ textAlign: 'right', color: 'var(--accent)', fontWeight: 700 }}>{total}</div>
      {spendable ? (
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={() => onSpend?.(1)} disabled={!canSpend || statPoints < 1} style={btnStyle(1)}>+1</button>
          <button onClick={() => onSpend?.(5)} disabled={!canSpend || statPoints < 5} style={btnStyle(5)}>+5</button>
          <button onClick={() => onSpend?.(10)} disabled={!canSpend || statPoints < 10} style={btnStyle(10)}>+10</button>
          <button onClick={() => onSpend?.(statPoints)} disabled={!canSpend || statPoints < 1} style={{
            ...btnStyle(1), minWidth: 40,
            background: canSpend && statPoints > 0 ? '#daa520' : 'transparent',
          }}>전체</button>
        </div>
      ) : (
        <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center' }}>–</div>
      )}
    </>
  );
}
