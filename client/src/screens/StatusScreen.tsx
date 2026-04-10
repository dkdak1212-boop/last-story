import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { STAT_LABEL } from '../components/ui/ItemStats';
import { ClassIcon } from '../components/ui/ClassIcon';
import type { Stats, ClassName } from '../types';

interface CharStatus {
  level: number; exp: number; expToNext: number; expPercent: number;
  gold: number; hp: number; className: string;
  statPoints: number;
  baseStats: Stats; baseMaxHp: number;
  equipBonus: Partial<Stats>;
  nodeBonus: Partial<Stats>;
  effective: Stats & { maxHp: number; atk: number; matk: number; def: number; mdef: number; dodge: number; accuracy: number };
  guildBuff: { name: string; pct: number } | null;
}

const CLASS_LABEL: Record<string, string> = {
  warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적',
};

const STAT_ORDER: (keyof Stats)[] = ['str', 'dex', 'int', 'vit', 'spd', 'cri'];

// 전투 능력치 클릭 설명
const COMBAT_STAT_DESC: Record<string, string> = {
  'HP': '캐릭터의 생명력. 0이 되면 사망하여 HP 25% 회복 후 마을 귀환.',
  '물리 공격': '물리 데미지 = 힘(STR) × 1.0 + 장비 ATK 보너스. 전사/도적이 사용.',
  '마법 공격': '마법 데미지 = 지능(INT) × 1.2 + 장비 MATK 보너스. 마법사/성직자가 사용.',
  '방어력': '물리 피해 감소 = 체력(VIT) × 0.8 + 장비 DEF. 데미지 계산: ATK - 방어 × 0.5',
  '마법 방어': '마법 피해 감소 = 지능(INT) × 0.5 + 장비 MDEF. 데미지 계산: MATK - 마방 × 0.5',
  '회피율': '공격을 회피할 확률. 민첩(DEX) × 0.2 + 장비. 상한 30%.',
  '명중률': '공격이 적중할 확률. 기본 80% + 민첩(DEX) × 0.3 + 장비. 상한 100%.',
  '스피드': '게이지 충전 속도. 높을수록 빠르게 행동. 게이지 MAX=1000, 매 틱 SPD × 0.2 충전.',
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

  async function spendStat(stat: keyof Stats) {
    if (!active || busy) return;
    setBusy(true);
    try {
      await api(`/characters/${active.id}/spend-stat`, { method: 'POST', body: JSON.stringify({ stat, amount: 1 }) });
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

        {/* 스탯 분해 */}
        <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, color: 'var(--accent)', margin: 0 }}>스탯 분해</h3>
            <div style={{ fontSize: 12, color: status.statPoints > 0 ? 'var(--accent)' : 'var(--text-dim)', fontWeight: 700 }}>
              스탯 포인트: {status.statPoints}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 50px 50px 55px 28px', gap: 4, fontSize: 12, alignItems: 'center' }}>
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
              const spendable = k !== 'cri'; // 치명타 확률은 수동 분배 불가
              return (
                <StatRow key={k} label={STAT_LABEL[k]} base={base} eq={eq} node={node} total={total}
                  canSpend={spendable && status.statPoints > 0 && !busy}
                  spendable={spendable}
                  onSpend={() => spendStat(k)}
                />
              );
            })}
          </div>
          {status.statPoints > 0 && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-dim)' }}>+ 버튼을 눌러 스탯을 1씩 분배할 수 있습니다.</div>
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

      <div style={{ marginTop: 14, padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-dim)' }}>
        <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8, fontSize: 13 }}>스탯 안내</div>
        <div className="stat-guide-grid" style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '4px 8px' }}>
          <span style={{ color: 'var(--text)' }}>힘 (STR)</span><span>물리 공격력 = 힘 × 1.0 + 장비 ATK. 전사/도적 핵심 스탯</span>
          <span style={{ color: 'var(--text)' }}>민첩 (DEX)</span><span>회피율 = 민첩 × 0.2% (상한 30%) · 명중률 = 80% + 민첩 × 0.3% (상한 100%)</span>
          <span style={{ color: 'var(--text)' }}>지능 (INT)</span><span>마법 공격 = 지능 × 1.2 + 장비 MATK · 마법 방어 = 지능 × 0.5 + 장비 MDEF</span>
          <span style={{ color: 'var(--text)' }}>체력 (VIT)</span><span>방어력 = 체력 × 0.8 + 장비 DEF · 장비/노드 체력 1당 HP +10</span>
          <span style={{ color: 'var(--text)' }}>스피드 (SPD)</span><span>게이지 충전 속도. 300 이하 선형, 이후 소프트캡 + 평방근 감쇠</span>
          <span style={{ color: 'var(--text)' }}>치명타 (CRI)</span><span>크리 확률 % (상한 100%). 발동 시 데미지 2배. <span style={{ color: 'var(--danger)' }}>수동 분배 불가</span> — 노드/장비로만 상승</span>
        </div>
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>전투 팁</div>
          <div>· <span style={{ color: 'var(--text)' }}>전사/도적</span>은 ATK(물리), <span style={{ color: 'var(--text)' }}>마법사/성직자</span>는 MATK(마법) 고정 사용</div>
          <div>· 데미지 공식: <span style={{ color: 'var(--text)' }}>(ATK/MATK) × 스킬배율 − (DEF/MDEF × 0.5) + 고정피해 ± 10%</span></div>
          <div>· 게이지 MAX = 1000 · SPD 300 → 약 1.7초 주기 · 자동/수동 전환 가능</div>
          <div>· <span style={{ color: 'var(--text)' }}>레벨업</span>: HP +25, 노드포인트 +1, 스탯포인트 +2 (힘/민/지/체/속 중 수동 분배, 치명타 제외)</div>
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

function StatRow({ label, base, eq, node, total, canSpend, spendable = true, onSpend }: { label: string; base: number; eq: number; node: number; total: number; canSpend?: boolean; spendable?: boolean; onSpend?: () => void }) {
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
        <button
          onClick={onSpend}
          disabled={!canSpend}
          style={{
            padding: '2px 0', fontSize: 12, fontWeight: 900,
            background: canSpend ? 'var(--accent)' : 'transparent',
            color: canSpend ? '#000' : 'var(--text-dim)',
            border: `1px solid ${canSpend ? 'var(--accent)' : 'var(--border)'}`,
            cursor: canSpend ? 'pointer' : 'not-allowed', borderRadius: 3,
            opacity: canSpend ? 1 : 0.4,
          }}
        >+</button>
      ) : (
        <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center' }}>–</div>
      )}
    </>
  );
}
