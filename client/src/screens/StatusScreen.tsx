import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { STAT_LABEL } from '../components/ui/ItemStats';
import { ClassIcon } from '../components/ui/ClassIcon';
import type { Stats, ClassName } from '../types';

interface CharStatus {
  level: number; exp: number; expToNext: number; expPercent: number;
  gold: number; hp: number; className: string;
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

export function StatusScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const [status, setStatus] = useState<CharStatus | null>(null);

  useEffect(() => {
    if (!active) return;
    api<CharStatus>(`/characters/${active.id}/status`).then(setStatus).catch(() => {});
  }, [active?.id]);

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
        {/* HP/MP + 유효 전투 능력치 */}
        <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 14, marginBottom: 10, color: 'var(--accent)' }}>전투 능력치</h3>
          <Row label="HP" value={`${status.hp} / ${status.effective.maxHp}`} />
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />
          <Row label="물리 공격" value={status.effective.atk} />
          <Row label="마법 공격" value={status.effective.matk} />
          <Row label="방어력" value={status.effective.def} />
          <Row label="마법 방어" value={status.effective.mdef} />
          <Row label="회피율" value={`${status.effective.dodge}%`} />
          <Row label="명중률" value={`${status.effective.accuracy}%`} />
          <Row label="스피드" value={status.effective.spd} />
          <Row label="치명타" value={`${status.effective.cri}%`} />
        </div>

        {/* 기본 + 장비 + 노드 + 합계 스탯 */}
        <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 14, marginBottom: 10, color: 'var(--accent)' }}>스탯 분해</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 55px 55px 55px 60px', gap: 4, fontSize: 12, alignItems: 'center' }}>
            <div style={{ color: 'var(--text-dim)' }}></div>
            <div style={{ color: 'var(--text-dim)', textAlign: 'right' }}>기본</div>
            <div style={{ color: 'var(--text-dim)', textAlign: 'right' }}>장비</div>
            <div style={{ color: '#8b8bef', textAlign: 'right' }}>노드</div>
            <div style={{ color: 'var(--text-dim)', textAlign: 'right' }}>합계</div>
            {STAT_ORDER.map((k) => {
              const base = status.baseStats[k] || 0;
              const eq = (status.equipBonus[k] || 0) as number;
              const node = (status.nodeBonus?.[k] || 0) as number;
              const total = status.effective[k] || 0;
              return (
                <StatRow key={k} label={STAT_LABEL[k]} base={base} eq={eq} node={node} total={total} />
              );
            })}
          </div>
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
        <div className="stat-guide-grid" style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '4px 8px' }}>
          <span style={{ color: 'var(--text)' }}>힘</span><span>물리 공격력에 영향 (공격력 = 힘 × 1.0)</span>
          <span style={{ color: 'var(--text)' }}>민첩</span><span>회피율과 명중률에 영향 (회피 = 민첩 × 0.4%, 명중 = 80 + 민첩 × 0.5%)</span>
          <span style={{ color: 'var(--text)' }}>지능</span><span>마법 공격력, 마법 방어에 영향 (마공 = 지능 × 1.2)</span>
          <span style={{ color: 'var(--text)' }}>체력</span><span>방어력과 HP에 영향 (방어 = 체력 × 0.8, HP +10/체력)</span>
          <span style={{ color: 'var(--text)' }}>스피드</span><span>행동 속도에 영향 (높을수록 빠르게 공격)</span>
          <span style={{ color: 'var(--text)' }}>치명타</span><span>치명타 확률 (발동 시 1.5배 데미지)</span>
        </div>
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>전투 팁</div>
          <div>· 마법사, 사제, 드루이드는 스킬 데미지가 <span style={{ color: 'var(--text)' }}>지능(마법공격력)</span> 기반</div>
          <div>· 전사, 검사, 궁수, 도적, 암살자는 스킬 데미지가 <span style={{ color: 'var(--text)' }}>힘(물리공격력)</span> 기반</div>
          <div>· 회복 스킬은 모든 클래스가 <span style={{ color: 'var(--text)' }}>마법공격력</span> 기반으로 회복량 결정</div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function StatRow({ label, base, eq, node, total }: { label: string; base: number; eq: number; node: number; total: number }) {
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
    </>
  );
}
