import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { ClassIcon } from '../components/ui/ClassIcon';
import { MonsterIcon } from '../components/ui/MonsterIcon';
import type { PotionSettings } from '../types';
import type { ClassName } from '../types';

interface CombatState {
  inCombat: boolean;
  fieldName?: string;
  player: { hp: number; maxHp: number; mp: number; maxMp: number };
  monster?: { name: string; hp: number; maxHp: number; level: number };
  log: string[];
  now?: number;
  nextPlayerAt?: number;
  nextMonsterAt?: number;
  playerTickMs?: number;
  monsterTickMs?: number;
  potions?: { hpSmall: number; hpMid: number; mpSmall: number; mpMid: number };
}

export function CombatScreen() {
  const nav = useNavigate();
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [state, setState] = useState<CombatState | null>(null);
  const [damageFlash, setDamageFlash] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<PotionSettings | null>(active?.potionSettings ?? null);
  const [tickOffset, setTickOffset] = useState(0); // 로컬 시간 - 서버 시간 보정
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => { setSettings(active?.potionSettings ?? null); }, [active?.id]);

  useEffect(() => {
    if (!active) return;
    let stop = false;

    async function tick() {
      if (!active) return;
      try {
        const res = await api<CombatState>(`/characters/${active.id}/combat/tick`, { method: 'POST' });
        if (stop) return;
        if (res.now) setTickOffset(Date.now() - res.now);
        setState((prev) => {
          if (prev && res.monster && prev.monster && res.monster.hp < prev.monster.hp) {
            setDamageFlash(prev.monster.hp - res.monster.hp);
            setTimeout(() => setDamageFlash(null), 500);
          }
          return res;
        });
      } catch { /* noop */ }
    }
    tick();
    const id = setInterval(tick, 1500);
    return () => { stop = true; clearInterval(id); };
  }, [active]);

  // 턴게이지 애니메이션용 로컬 시간 업데이트 (60fps 대신 10fps)
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  async function leave() {
    if (!active) return;
    await api(`/characters/${active.id}/leave-field`, { method: 'POST' });
    await refreshActive();
    nav('/village');
  }

  async function saveSettings(next: PotionSettings) {
    if (!active) return;
    setSettings(next);
    await api(`/characters/${active.id}/potion-settings`, {
      method: 'POST', body: JSON.stringify(next),
    });
    refreshActive();
  }

  if (!state) return <div style={{ color: 'var(--text-dim)' }}>전투 준비 중...</div>;

  // 턴게이지 계산 (서버 기준 시각 → 로컬 보정)
  const serverNow = nowTick - tickOffset;
  const playerGauge = state.nextPlayerAt && state.playerTickMs
    ? Math.max(0, Math.min(100, 100 - ((state.nextPlayerAt - serverNow) / state.playerTickMs) * 100))
    : 0;
  const monsterGauge = state.nextMonsterAt && state.monsterTickMs
    ? Math.max(0, Math.min(100, 100 - ((state.nextMonsterAt - serverNow) / state.monsterTickMs) * 100))
    : 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--accent)' }}>{state.fieldName || '전투 중'}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowSettings(!showSettings)}>포션 설정</button>
          <button onClick={leave}>마을 귀환</button>
        </div>
      </div>

      {showSettings && settings && (
        <PotionSettingsPanel settings={settings} onChange={saveSettings} onClose={() => setShowSettings(false)} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Player */}
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            {active?.className && <ClassIcon className={active.className as ClassName} size={22} />}
            {active?.name}
          </div>
          <Bar cur={state.player.hp} max={state.player.maxHp} color="var(--success)" label="HP" />
          <Bar cur={state.player.mp} max={state.player.maxMp} color="#5b8ecc" label="MP" />
          <TurnGauge percent={playerGauge} tickMs={state.playerTickMs ?? 2000} color="var(--accent)" />
        </div>

        {/* Monster */}
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', position: 'relative' }}>
          {state.monster ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <MonsterIcon name={state.monster.name} size={22} />
                {state.monster.name} · Lv.{state.monster.level}
              </div>
              <Bar cur={state.monster.hp} max={state.monster.maxHp} color="var(--danger)" label="HP" />
              <TurnGauge percent={monsterGauge} tickMs={state.monsterTickMs ?? 2000} color="var(--danger)" />
              <AnimatePresence>
                {damageFlash !== null && (
                  <motion.div
                    initial={{ opacity: 1, y: 0, scale: 0.8 }}
                    animate={{ opacity: 1, y: -30, scale: 1.2 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    style={{ position: 'absolute', top: 20, right: 20, color: 'var(--accent)', fontSize: 24, fontWeight: 900, pointerEvents: 'none' }}
                  >-{damageFlash}</motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <div style={{ color: 'var(--text-dim)' }}>적을 찾는 중...</div>
          )}
        </div>
      </div>

      {/* 포션 보유량 */}
      {state.potions && (
        <div style={{
          display: 'flex', gap: 12, padding: 10, marginBottom: 16,
          background: 'var(--bg-panel)', border: '1px solid var(--border)', fontSize: 13,
        }}>
          <PotionChip name="작은 체력" qty={state.potions.hpSmall} color="var(--success)" />
          <PotionChip name="중급 체력" qty={state.potions.hpMid} color="var(--success)" />
          <PotionChip name="작은 마나" qty={state.potions.mpSmall} color="#5b8ecc" />
          <PotionChip name="중급 마나" qty={state.potions.mpMid} color="#5b8ecc" />
        </div>
      )}

      {/* Combat log */}
      <div style={{
        padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)',
        maxHeight: 260, overflowY: 'auto', fontFamily: 'monospace', fontSize: 13,
      }}>
        {state.log.map((line, i) => (
          <div key={i} style={{ color: 'var(--text-dim)', marginBottom: 2 }}>{line}</div>
        ))}
      </div>
    </div>
  );
}

function Bar({ cur, max, color, label }: { cur: number; max: number; color: string; label: string }) {
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)' }}>
        <span>{label}</span><span>{cur} / {max}</span>
      </div>
      <div style={{ height: 8, background: 'var(--bg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <motion.div animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }}
          style={{ height: '100%', background: color }} />
      </div>
    </div>
  );
}

function TurnGauge({ percent, tickMs, color }: { percent: number; tickMs: number; color: string }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)' }}>
        <span>행동 게이지</span><span>{(tickMs / 1000).toFixed(1)}s</span>
      </div>
      <div style={{ height: 4, background: 'var(--bg)', border: '1px solid var(--border)', overflow: 'hidden', marginTop: 2 }}>
        <div style={{
          height: '100%', width: `${percent}%`, background: color,
          transition: 'width 100ms linear',
        }} />
      </div>
    </div>
  );
}

function PotionChip({ name, qty, color }: { name: string; qty: number; color: string }) {
  return (
    <div style={{
      padding: '4px 10px', border: `1px solid ${qty > 0 ? color : 'var(--border)'}`,
      opacity: qty > 0 ? 1 : 0.4,
    }}>
      <span style={{ color: 'var(--text-dim)' }}>{name}</span>
      <span style={{ marginLeft: 6, fontWeight: 700, color: qty > 0 ? color : 'var(--text-dim)' }}>×{qty}</span>
    </div>
  );
}

function PotionSettingsPanel({
  settings, onChange, onClose,
}: { settings: PotionSettings; onChange: (s: PotionSettings) => void; onClose: () => void }) {
  return (
    <div style={{
      padding: 16, marginBottom: 16, background: 'var(--bg-panel)', border: '1px solid var(--accent)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15 }}>자동 포션 설정</h3>
        <button onClick={onClose} style={{ fontSize: 12, padding: '2px 10px' }}>닫기</button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox" checked={settings.hpEnabled}
              onChange={(e) => onChange({ ...settings, hpEnabled: e.target.checked })}
            />
            <span style={{ color: 'var(--success)', fontWeight: 700 }}>체력 물약 자동 사용</span>
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-dim)' }}>
          HP
          <input
            type="range" min="0" max="100" step="5" value={settings.hpThreshold}
            disabled={!settings.hpEnabled}
            onChange={(e) => onChange({ ...settings, hpThreshold: Number(e.target.value) })}
            style={{ flex: 1, maxWidth: 300 }}
          />
          <span style={{ minWidth: 40, textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{settings.hpThreshold}%</span>
          이하
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox" checked={settings.mpEnabled}
              onChange={(e) => onChange({ ...settings, mpEnabled: e.target.checked })}
            />
            <span style={{ color: '#5b8ecc', fontWeight: 700 }}>마나 물약 자동 사용</span>
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-dim)' }}>
          MP
          <input
            type="range" min="0" max="100" step="5" value={settings.mpThreshold}
            disabled={!settings.mpEnabled}
            onChange={(e) => onChange({ ...settings, mpThreshold: Number(e.target.value) })}
            style={{ flex: 1, maxWidth: 300 }}
          />
          <span style={{ minWidth: 40, textAlign: 'right', color: '#5b8ecc', fontWeight: 700 }}>{settings.mpThreshold}%</span>
          이하
        </div>
      </div>
    </div>
  );
}
