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
  const [skillFlash, setSkillFlash] = useState<{ icon: string; color: string } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const prevMonsterHp = useRef<number>(0);
  const prevLogLen = useRef<number>(0);

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

        // 스킬 사용 이펙트 감지
        if (snapshot.log.length > prevLogLen.current) {
          const newLines = snapshot.log.slice(prevLogLen.current);
          for (const line of newLines) {
            const match = line.match(/\[(.+?)\]/);
            if (match) {
              const fx = SKILL_EFFECTS[match[1]];
              if (fx) {
                setSkillFlash({ icon: fx.icon, color: fx.glow });
                setTimeout(() => setSkillFlash(null), 600);
                break;
              }
            }
          }
        }
        prevLogLen.current = snapshot.log.length;

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
        player: state.waitingInput ? 1000 : Math.min(1000, (state.player.gauge || 0) + (state.player.speed || 0) * 0.01),
        monster: Math.min(1000, (state.monster?.gauge || 0) + (state.monster?.speed || 0) * 0.01),
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

  const [autoPotionEnabled, setAutoPotionEnabled] = useState(true);
  const [autoPotionThreshold, setAutoPotionThreshold] = useState(30);

  // autoPotion 상태 동기화
  useEffect(() => {
    if (state?.autoPotion) {
      setAutoPotionEnabled(state.autoPotion.enabled);
      setAutoPotionThreshold(state.autoPotion.threshold);
    }
  }, [state?.autoPotion?.enabled, state?.autoPotion?.threshold]);

  const updateAutoPotion = useCallback(async (enabled: boolean, threshold: number) => {
    if (!active) return;
    await api(`/characters/${active.id}/combat/auto-potion`, {
      method: 'POST',
      body: JSON.stringify({ enabled, threshold }),
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
                {skillFlash && (
                  <motion.div
                    initial={{ opacity: 0, scale: 2 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ duration: 0.4 }}
                    style={{
                      position: 'absolute', top: '50%', left: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: 48, pointerEvents: 'none',
                      filter: `drop-shadow(0 0 12px ${skillFlash.color})`,
                    }}
                  >{skillFlash.icon}</motion.div>
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

      {/* Auto potion settings */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', marginTop: 8,
        background: 'var(--bg-panel)', border: '1px solid var(--border)', fontSize: 12,
      }}>
        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>자동 물약</span>
        <button
          onClick={() => {
            const next = !autoPotionEnabled;
            setAutoPotionEnabled(next);
            updateAutoPotion(next, autoPotionThreshold);
          }}
          style={{
            padding: '3px 10px', fontSize: 11, fontWeight: 700,
            background: autoPotionEnabled ? 'var(--success)' : 'transparent',
            color: autoPotionEnabled ? '#000' : 'var(--text-dim)',
            border: `1px solid ${autoPotionEnabled ? 'var(--success)' : 'var(--border)'}`,
          }}
        >
          {autoPotionEnabled ? 'ON' : 'OFF'}
        </button>
        <span style={{ color: 'var(--text-dim)' }}>HP</span>
        <input
          type="range" min={5} max={80} step={5}
          value={autoPotionThreshold}
          onChange={(e) => {
            const v = Number(e.target.value);
            setAutoPotionThreshold(v);
          }}
          onMouseUp={() => updateAutoPotion(autoPotionEnabled, autoPotionThreshold)}
          onTouchEnd={() => updateAutoPotion(autoPotionEnabled, autoPotionThreshold)}
          style={{ width: 100, accentColor: 'var(--accent)' }}
        />
        <span style={{ color: 'var(--accent)', fontWeight: 700, minWidth: 36 }}>{autoPotionThreshold}%</span>
        <span style={{ color: 'var(--text-dim)' }}>이하 시 사용</span>
      </div>

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
        <span>{Math.round(percent)}%</span>
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

// 스킬별 이펙트 매핑 (아이콘 + 색상)
const SKILL_EFFECTS: Record<string, { icon: string; color: string; glow: string }> = {
  // 전사
  '강타':         { icon: '⚔', color: '#e04040', glow: '#ff4444' },
  '분노의 일격':   { icon: '💢', color: '#ff2020', glow: '#ff0000' },
  '철벽':         { icon: '🛡', color: '#4488cc', glow: '#4488ff' },
  '흡혈 참격':     { icon: '🩸', color: '#cc2244', glow: '#ff2266' },
  '반격의 의지':   { icon: '↩', color: '#ff8800', glow: '#ffaa00' },
  '무쌍난무':      { icon: '⚡', color: '#ff4400', glow: '#ff6600' },
  '불굴':         { icon: '✦', color: '#ffcc00', glow: '#ffee00' },
  // 마법사
  '화염구':       { icon: '🔥', color: '#ff6600', glow: '#ff8800' },
  '냉기 창':      { icon: '❄', color: '#44bbff', glow: '#66ddff' },
  '게이지 폭발':   { icon: '💥', color: '#ff44ff', glow: '#ff66ff' },
  '번개 사슬':     { icon: '⚡', color: '#ffee00', glow: '#ffff44' },
  '빙결 감옥':     { icon: '🧊', color: '#00ccff', glow: '#44eeff' },
  '유성 낙하':     { icon: '☄', color: '#ff4400', glow: '#ff6622' },
  '마력 과부하':   { icon: '🌀', color: '#aa44ff', glow: '#cc66ff' },
  // 성직자
  '신성 방벽':     { icon: '✝', color: '#ffdd44', glow: '#ffee66' },
  '심판의 철퇴':   { icon: '🔨', color: '#ffffff', glow: '#ffffaa' },
  '치유의 빛':     { icon: '💚', color: '#44dd44', glow: '#66ff66' },
  '신성 화염':     { icon: '🕯', color: '#ffcc00', glow: '#ffdd44' },
  '신의 가호':     { icon: '🌟', color: '#ffee88', glow: '#ffffaa' },
  '천벌':         { icon: '⚡', color: '#ffffff', glow: '#ffffcc' },
  '부활의 기적':   { icon: '♱', color: '#44ff88', glow: '#66ffaa' },
  // 도적
  '급소 찌르기':   { icon: '🗡', color: '#cc44cc', glow: '#ee66ee' },
  '독 투척':       { icon: '☠', color: '#44cc44', glow: '#66ee44' },
  '백스텝':       { icon: '💨', color: '#88ccff', glow: '#aaeeff' },
  '연막탄':       { icon: '🌫', color: '#888888', glow: '#aaaaaa' },
  '맹독 강화':     { icon: '☣', color: '#22cc22', glow: '#44ff22' },
  '그림자 연격':   { icon: '🌑', color: '#8844aa', glow: '#aa66cc' },
  '사신의 낫':     { icon: '💀', color: '#aa00aa', glow: '#cc22cc' },
};

function SkillBar({ skills, waitingInput, autoMode, onUse }: {
  skills: CombatSkillInfo[];
  waitingInput: boolean;
  autoMode: boolean;
  onUse: (id: number) => void;
}) {
  const canUse = waitingInput && !autoMode;

  return (
    <div style={{
      padding: 12, background: 'var(--bg-panel)', border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>스킬</span>
        {!autoMode && !waitingInput && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>
            게이지 충전 중...
          </span>
        )}
        {autoMode && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>
            자동 전투 중
          </span>
        )}
        {canUse && (
          <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, animation: 'pulse 0.6s ease-in-out infinite alternate' }}>
            스킬을 선택하세요!
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {skills.map(sk => {
          const onCooldown = sk.cooldownLeft > 0;
          const usable = canUse && sk.usable && !onCooldown;
          const isBasic = sk.cooldownMax === 0;
          const fx = SKILL_EFFECTS[sk.name] || { icon: '⚔', color: 'var(--accent)', glow: 'var(--accent)' };

          return (
            <div
              key={sk.id}
              onClick={() => usable && onUse(sk.id)}
              style={{
                position: 'relative', minWidth: 100, padding: '10px 14px',
                background: usable
                  ? `linear-gradient(135deg, ${fx.color}cc, ${fx.color}88)`
                  : onCooldown ? 'var(--bg)' : `linear-gradient(135deg, var(--bg-panel), ${fx.color}22)`,
                color: usable ? '#fff' : 'var(--text-dim)',
                border: `1px solid ${usable ? fx.color : onCooldown ? 'var(--border)' : `${fx.color}44`}`,
                borderRadius: 6,
                cursor: usable ? 'pointer' : 'default',
                opacity: onCooldown ? 0.5 : canUse ? 1 : 0.7,
                transition: 'all 0.15s ease',
                animation: usable ? 'pulse 0.6s ease-in-out infinite alternate' : 'none',
                textAlign: 'center',
                boxShadow: usable ? `0 0 12px ${fx.glow}88, inset 0 0 8px ${fx.glow}44` : 'none',
              }}
            >
              <div style={{ fontSize: 18, lineHeight: 1, marginBottom: 4 }}>
                {fx.icon}
              </div>
              <div style={{
                fontSize: 12, fontWeight: 700, marginBottom: isBasic ? 0 : 3,
                textShadow: usable ? `0 0 6px ${fx.glow}` : 'none',
              }}>
                {sk.name}
              </div>
              {!isBasic && (
                <div style={{ fontSize: 10, color: usable ? 'rgba(255,255,255,0.7)' : 'var(--text-dim)' }}>
                  {onCooldown ? `${sk.cooldownLeft}턴 남음` : `CD ${sk.cooldownMax}턴`}
                </div>
              )}
              {onCooldown && (
                <div style={{
                  position: 'absolute', top: -8, right: -8,
                  background: 'var(--danger)', color: '#fff',
                  fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                }}>
                  {sk.cooldownLeft}턴
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
