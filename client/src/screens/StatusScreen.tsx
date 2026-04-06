import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { STAT_LABEL } from '../components/ui/ItemStats';
import { ClassIcon } from '../components/ui/ClassIcon';
import type { Stats, ClassName } from '../types';

interface CharStatus {
  level: number; exp: number; expToNext: number; expPercent: number;
  gold: number; hp: number; mp: number; className: string;
  baseStats: Stats; baseMaxHp: number; baseMaxMp: number;
  equipBonus: Partial<Stats>;
  effective: Stats & { maxHp: number; maxMp: number; atk: number; matk: number; def: number; mdef: number; dodge: number; accuracy: number; tickMs: number };
  guildBuff: { name: string; pct: number } | null;
}

const CLASS_LABEL: Record<string, string> = {
  warrior: '전사', swordsman: '검사', archer: '궁수', rogue: '도적',
  assassin: '암살자', mage: '마법사', priest: '사제', druid: '드루이드',
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* HP/MP + 유효 전투 능력치 */}
        <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 14, marginBottom: 10, color: 'var(--accent)' }}>전투 능력치</h3>
          <Row label="HP" value={`${status.hp} / ${status.effective.maxHp}`} />
          <Row label="MP" value={`${status.mp} / ${status.effective.maxMp}`} />
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />
          <Row label="물리 공격" value={status.effective.atk} />
          <Row label="마법 공격" value={status.effective.matk} />
          <Row label="방어력" value={status.effective.def} />
          <Row label="마법 방어" value={status.effective.mdef} />
          <Row label="회피율" value={`${status.effective.dodge}%`} />
          <Row label="명중률" value={`${status.effective.accuracy}%`} />
          <Row label="행동 주기" value={`${(status.effective.tickMs / 1000).toFixed(2)}초`} />
        </div>

        {/* 기본 + 장비 + 합계 스탯 */}
        <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 14, marginBottom: 10, color: 'var(--accent)' }}>스탯 분해</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px', gap: 4, fontSize: 12, alignItems: 'center' }}>
            <div style={{ color: 'var(--text-dim)' }}></div>
            <div style={{ color: 'var(--text-dim)', textAlign: 'right' }}>기본</div>
            <div style={{ color: 'var(--text-dim)', textAlign: 'right' }}>장비</div>
            <div style={{ color: 'var(--text-dim)', textAlign: 'right' }}>합계</div>
            {STAT_ORDER.map((k) => {
              const base = status.baseStats[k] || 0;
              const eq = (status.equipBonus[k] || 0) as number;
              const total = status.effective[k] || 0;
              return (
                <ContinuedRow key={k} label={STAT_LABEL[k]} base={base} eq={eq} total={total} />
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

function ContinuedRow({ label, base, eq, total }: { label: string; base: number; eq: number; total: number }) {
  return (
    <>
      <div style={{ color: 'var(--text)' }}>{label}</div>
      <div style={{ textAlign: 'right' }}>{base}</div>
      <div style={{ textAlign: 'right', color: eq > 0 ? 'var(--success)' : 'var(--text-dim)' }}>
        {eq > 0 ? `+${eq}` : '-'}
      </div>
      <div style={{ textAlign: 'right', color: 'var(--accent)', fontWeight: 700 }}>{total}</div>
    </>
  );
}
