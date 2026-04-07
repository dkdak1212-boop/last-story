import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { ClassIcon } from '../components/ui/ClassIcon';
import { MonsterIcon } from '../components/ui/MonsterIcon';
import type { ClassName, CombatSnapshot, CombatSkillInfo, StatusEffect } from '../types';
import { io as socketIo, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

const API_BASE = '';

export function CombatScreen() {
  const nav = useNavigate();
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const token = useAuthStore((s) => s.token);
  const [state, setState] = useState<CombatSnapshot | null>(null);
  const [damageFlash, setDamageFlash] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const prevMonsterHp = useRef<number>(0);

  // WebSocket 연결
  useEffect(() => {
    if (!active || !token) return;

    const wsUrl = API_BASE || window.location.origin;
    const socket = socketIo(wsUrl, { auth: { token } });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('combat:subscribe', active.id);
    });

    socket.on(`combat:${active.id}`, (snapshot: CombatSnapshot) => {
      setState(_prev => {
        if (_prev?.monster && snapshot.monster && snapshot.monster.hp < prevMonsterHp.current) {
          const dmg = prevMonsterHp.current - snapshot.monster.hp;
          setDamageFlash(dmg);
          setTimeout(() => setDamageFlash(null), 500);
        }
        if (snapshot.monster) prevMonsterHp.current = snapshot.monster.hp;
        return snapshot;
      });
    });

    // 초기 상태 폴백
    api<CombatSnapshot>(`/characters/${active.id}/combat/state`).then(s => {
      setState(s);
      if (s.monster) prevMonsterHp.current = s.monster.hp;
    }).catch(() => {});

    return () => {
      socket.emit('combat:unsubscribe', active.id);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [active?.id, token]);

  // 게이지 보간용 로컬 업데이트
  const [localGauges, setLocalGauges] = useState({ player: 0, monster: 0 });
  useEffect(() => {
    if (!state?.inCombat) return;
    const interval = setInterval(() => {
      setLocalGauges(_prev => ({
        player: state.waitingInput ? 1000 : Math.min(1000, (state.player.gauge || 0) + (state.player.speed || 0) * 0.1),
        monster: Math.min(1000, (state.monster?.gauge || 0) + (state.monster?.speed || 0) * 0.1),
      }));
    }, 100);
    return () => clearInterval(interval);
  }, [state?.inCombat, state?.player.gauge, state?.monster?.gauge]);

  // 실제 상태 업데이트 시 로컬 게이지도 동기화
  useEffect(() => {
    if (state) {
      setLocalGauges({
        player: state.player.gauge,
        monster: state.monster?.gauge || 0,
      });
    }
  }, [state?.player.gauge, state?.monster?.gauge]);

  const toggleAuto = useCallback(async () => {
    if (!active) return;
    const res = await api<{ autoMode: boolean }>(`/characters/${active.id}/combat/toggle-auto`, { method: 'POST' });
    setState(prev => prev ? { ...prev, autoMode: res.autoMode, waitingInput: false } : prev);
  }, [active]);

  const useSkill = useCallback(async (skillId: number) => {
    if (!active) return;
    await api(`/characters/${active.id}/combat/use-skill`, {
      method: 'POST',
      body: JSON.stringify({ skillId }),
    });
  }, [active]);

  async function leave() {
    if (!active) return;
    await api(`/characters/${active.id}/leave-field`, { method: 'POST' });
    await refreshActive();
    nav('/village');
  }

  if (!state || !state.inCombat) {
    return <div style={{ color: 'var(--text-dim)' }}>전투 준비 중...</div>;
  }

  const playerGaugePct = Math.min(100, (localGauges.player / 1000) * 100);
  const monsterGaugePct = Math.min(100, (localGauges.monster / 1000) * 100);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--accent)' }}>{state.fieldName || '전투 중'}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={toggleAuto}
            style={{
              background: state.autoMode ? 'var(--accent)' : 'transparent',
              color: state.autoMode ? '#000' : 'var(--accent)',
              border: '1px solid var(--accent)',
              fontWeight: 700,
            }}
          >
            {state.autoMode ? '자동' : '수동'}
          </button>
          <button onClick={leave}>마을 귀환</button>
        </div>
      </div>

      {/* Combat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Player */}
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            {active?.className && <ClassIcon className={active.className as ClassName} size={22} />}
            {active?.name} <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>Lv.{active?.level}</span>
          </div>
          <Bar cur={state.player.hp} max={state.player.maxHp} color="var(--success)" label="HP" />
          <GaugeBar percent={playerGaugePct} color="var(--accent)" label="게이지"
            highlight={state.waitingInput} />
          <EffectIcons effects={state.player.effects} />
        </div>

        {/* Monster */}
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', position: 'relative' }}>
          {state.monster ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <MonsterIcon name={state.monster.name} size={22} />
                {state.monster.name} <span style={{ fontSize: 13 }}>Lv.{state.monster.level}</span>
              </div>
              <Bar cur={state.monster.hp} max={state.monster.maxHp} color="var(--danger)" label="HP" />
              <GaugeBar percent={monsterGaugePct} color="var(--danger)" label="게이지" />
              <EffectIcons effects={state.monster.effects} />
              <AnimatePresence>
                {damageFlash !== null && (
                  <motion.div
                    initial={{ opacity: 1, y: 0, scale: 0.8 }}
                    animate={{ opacity: 1, y: -30, scale: 1.2 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    style={{
                      position: 'absolute', top: 20, right: 20,
                      color: 'var(--accent)', fontSize: 24, fontWeight: 900, pointerEvents: 'none',
                    }}
                  >-{damageFlash}</motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <div style={{ color: 'var(--text-dim)' }}>적을 찾는 중...</div>
          )}
        </div>
      </div>

      {/* Skill bar */}
      <SkillBar
        skills={state.skills}
        waitingInput={state.waitingInput}
        autoMode={state.autoMode}
        onUse={useSkill}
      />

      {/* Combat log */}
      <div style={{
        padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)',
        maxHeight: 200, overflowY: 'auto', fontFamily: 'monospace', fontSize: 13, marginTop: 12,
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

function GaugeBar({ percent, color, label, highlight }: {
  percent: number; color: string; label: string; highlight?: boolean;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)' }}>
        <span>{label}</span>
        <span>{Math.round(percent * 10)}‰</span>
      </div>
      <div style={{
        height: 6, background: 'var(--bg)', border: '1px solid var(--border)',
        overflow: 'hidden', marginTop: 2,
        boxShadow: highlight ? `0 0 8px ${color}` : 'none',
        animation: highlight ? 'pulse 0.5s ease-in-out infinite alternate' : 'none',
      }}>
        <div style={{
          height: '100%', width: `${percent}%`, background: color,
          transition: 'width 100ms linear',
        }} />
      </div>
    </div>
  );
}

function EffectIcons({ effects }: { effects: StatusEffect[] }) {
  if (!effects || effects.length === 0) return null;

  const typeLabels: Record<string, string> = {
    dot: 'DoT', shield: '실드', speed_mod: '속도', stun: '기절',
    gauge_freeze: '동결', damage_reflect: '반사', damage_reduce: '감소',
    accuracy_debuff: '명중-', invincible: '무적', resurrect: '부활', poison: '독',
  };

  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
      {effects.map((e, i) => (
        <span key={i} style={{
          padding: '2px 6px', fontSize: 10, fontWeight: 700,
          background: 'var(--bg)', border: '1px solid var(--border)',
          color: e.type === 'stun' || e.type === 'gauge_freeze' ? 'var(--danger)' :
            e.type === 'shield' || e.type === 'invincible' ? 'var(--success)' : 'var(--accent)',
        }}>
          {typeLabels[e.type] || e.type} {e.remainingActions > 0 && e.remainingActions < 999 ? `(${e.remainingActions})` : ''}
        </span>
      ))}
    </div>
  );
}

function SkillBar({ skills, waitingInput, autoMode, onUse }: {
  skills: CombatSkillInfo[];
  waitingInput: boolean;
  autoMode: boolean;
  onUse: (id: number) => void;
}) {
  const canUse = waitingInput && !autoMode;

  return (
    <div style={{
      display: 'flex', gap: 6, padding: 10,
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      opacity: canUse ? 1 : 0.6,
      flexWrap: 'wrap',
    }}>
      {skills.map(sk => {
        const onCooldown = sk.cooldownLeft > 0;
        const usable = canUse && sk.usable && !onCooldown;

        return (
          <button
            key={sk.id}
            onClick={() => usable && onUse(sk.id)}
            disabled={!usable}
            style={{
              padding: '8px 12px', fontSize: 13, fontWeight: 700,
              position: 'relative', minWidth: 80,
              background: usable ? 'var(--accent)' : 'var(--bg)',
              color: usable ? '#000' : 'var(--text-dim)',
              border: `1px solid ${usable ? 'var(--accent)' : 'var(--border)'}`,
              cursor: usable ? 'pointer' : 'default',
              animation: canUse && sk.usable && !onCooldown ? 'pulse 0.6s ease-in-out infinite alternate' : 'none',
            }}
          >
            {sk.name}
            {onCooldown && (
              <span style={{
                position: 'absolute', top: -6, right: -6,
                background: 'var(--danger)', color: '#fff',
                fontSize: 10, padding: '1px 4px', borderRadius: 3,
              }}>
                {sk.cooldownLeft}
              </span>
            )}
          </button>
        );
      })}
      {!autoMode && !waitingInput && (
        <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-dim)' }}>
          게이지 충전 중...
        </span>
      )}
      {autoMode && (
        <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-dim)' }}>
          자동 전투 중
        </span>
      )}
    </div>
  );
}
