import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io as socketIo, type Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { Bar, GaugeBar, CombatLog, getSkillIcon } from './CombatScreen';
import { ClassIcon } from '../components/ui/ClassIcon';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '';

interface FighterSnapshot {
  id: number; name: string; className: string; level: number;
  hp: number; maxHp: number; gauge: number; shieldAmount: number; speed: number;
  skills: { id: number; name: string; kind: string; cooldown: number; cooldownLeft: number; slotOrder: number }[];
}

interface PvPSnapshot {
  battleId: string;
  attacker: FighterSnapshot;
  defender: FighterSnapshot;
  attackerAuto: boolean;
  attackerWaitingInput: boolean;
  elapsedMs: number;
  timeLimitMs: number;
  log: string[];
  ended: boolean;
  winnerId: number | null;
  endReason: 'hp' | 'timeout' | 'forfeit' | 'dc' | null;
}

const GAUGE_MAX = 1000;

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface DamagePop { id: number; side: 'me' | 'foe'; value: number; crit?: boolean; x: number }

export function PvPCombatScreen() {
  const { battleId } = useParams();
  const navigate = useNavigate();
  const active = useCharacterStore((s) => s.activeCharacter);
  const [state, setState] = useState<PvPSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [logVisible, setLogVisible] = useState(() => localStorage.getItem('combatLogVisible') !== '0');
  const [popups, setPopups] = useState<DamagePop[]>([]);
  const popupIdRef = useRef(0);
  const prevHpRef = useRef<{ meHp: number; foeHp: number } | null>(null);
  const prevLogLenRef = useRef<number>(0);

  function toggleLog() {
    const next = !logVisible;
    setLogVisible(next);
    localStorage.setItem('combatLogVisible', next ? '1' : '0');
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  // 스냅샷 변화 감지 → 데미지 팝업 생성
  useEffect(() => {
    if (!state) return;
    const prev = prevHpRef.current;
    const meHp = state.attacker.hp;
    const foeHp = state.defender.hp;

    if (prev) {
      // 새 로그 라인에서 crit 여부 추출
      const newLogs = state.log.slice(prevLogLenRef.current);
      const hasCrit = newLogs.some(l => l.includes('치명타'));

      if (foeHp < prev.foeHp) {
        const delta = prev.foeHp - foeHp;
        popupIdRef.current += 1;
        setPopups(ps => [...ps, { id: popupIdRef.current, side: 'foe', value: Math.round(delta), crit: hasCrit, x: 40 + Math.random() * 20 }]);
      }
      if (meHp < prev.meHp) {
        const delta = prev.meHp - meHp;
        popupIdRef.current += 1;
        setPopups(ps => [...ps, { id: popupIdRef.current, side: 'me', value: Math.round(delta), crit: hasCrit, x: 40 + Math.random() * 20 }]);
      }
    }
    prevHpRef.current = { meHp, foeHp };
    prevLogLenRef.current = state.log.length;
  }, [state]);

  // 팝업 자동 제거 (0.9초 후)
  useEffect(() => {
    if (popups.length === 0) return;
    const t = setTimeout(() => {
      setPopups(ps => ps.slice(1));
    }, 900);
    return () => clearTimeout(t);
  }, [popups]);

  useEffect(() => {
    if (!battleId || !active || !token) return;

    // 초기 스냅샷
    api<PvPSnapshot>(`/pvp/battle/${battleId}`).then(setState).catch(e => setErr(e?.message || 'load failed'));

    // WS 구독
    const wsUrl = API_BASE || window.location.origin;
    const socket = socketIo(wsUrl, { auth: { token } });
    socketRef.current = socket;
    socket.on(`pvp:${battleId}`, (snap: PvPSnapshot) => setState(snap));

    // DC 방지 ping
    const pingTimer = setInterval(() => {
      api(`/pvp/battle/${battleId}/ping`, { method: 'POST', body: JSON.stringify({ attackerId: active.id }) }).catch(() => {});
    }, 5000);

    return () => {
      socket.disconnect();
      clearInterval(pingTimer);
    };
  }, [battleId, active?.id, token]);

  async function useSkill(skillId: number) {
    if (!active || !battleId) return;
    try {
      await api(`/pvp/battle/${battleId}/use-skill`, { method: 'POST', body: JSON.stringify({ attackerId: active.id, skillId }) });
    } catch (e) { setErr(e instanceof Error ? e.message : 'use failed'); setTimeout(() => setErr(null), 2000); }
  }
  async function forfeit() {
    if (!active || !battleId) return;
    if (!confirm('기권하시겠습니까? (패배 처리)')) return;
    try { await api(`/pvp/battle/${battleId}/forfeit`, { method: 'POST', body: JSON.stringify({ attackerId: active.id }) }); }
    catch (e) { setErr(e instanceof Error ? e.message : 'forfeit failed'); }
  }

  if (!state) return <div style={{ padding: 20, color: 'var(--text-dim)' }}>{err ? `에러: ${err}` : '전투 세션 연결 중...'}</div>;

  const me = state.attacker;
  const foe = state.defender;
  const isDone = state.ended;
  const remainingMs = Math.max(0, state.timeLimitMs - state.elapsedMs);
  const won = isDone && state.winnerId === me.id;
  const lost = isDone && state.winnerId === foe.id;

  const playerGaugePct = Math.min(100, (me.gauge / GAUGE_MAX) * 100);
  const foeGaugePct = Math.min(100, (foe.gauge / GAUGE_MAX) * 100);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--danger)' }}>⚔ PvP 아레나 <span style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 400 }}>vs {foe.name}</span></h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: remainingMs < 30_000 ? 'var(--danger)' : 'var(--text-dim)' }}>
            남은 시간 {fmtTime(remainingMs)}
          </div>
          {!isDone && (
            <button onClick={forfeit} style={{
              background: 'transparent', color: 'var(--danger)',
              border: '1px solid var(--danger)', fontWeight: 700,
            }}>기권</button>
          )}
          {isDone && (
            <button onClick={() => navigate('/pvp')} style={{
              background: 'var(--accent)', color: '#000', border: 'none', fontWeight: 700,
            }}>PvP 메뉴로</button>
          )}
        </div>
      </div>

      {err && <div style={{ padding: 8, marginBottom: 10, background: 'rgba(200,60,60,0.1)', border: '1px solid rgba(200,60,60,0.3)', color: 'var(--danger)', fontSize: 12 }}>{err}</div>}

      {/* 종료 배너 */}
      {isDone && (
        <div style={{
          padding: 14, marginBottom: 16, textAlign: 'center',
          background: won ? 'rgba(76,175,80,0.15)' : lost ? 'rgba(200,60,60,0.15)' : 'rgba(200,200,60,0.15)',
          border: `2px solid ${won ? 'var(--success)' : lost ? 'var(--danger)' : '#daa520'}`,
          fontSize: 20, fontWeight: 800,
          color: won ? 'var(--success)' : lost ? 'var(--danger)' : '#daa520',
        }}>
          {won ? '🏆 승리!' : lost ? '💀 패배' : '🤝 무승부'}
          <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 10, fontWeight: 400 }}>
            ({state.endReason === 'hp' ? 'HP 승부' : state.endReason === 'timeout' ? '시간 만료' : state.endReason === 'forfeit' ? '기권' : '연결 끊김'})
          </span>
        </div>
      )}

      {/* Combat log 토글 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <button
          onClick={toggleLog}
          title="전투 로그 표시 토글"
          style={{
            fontSize: 11, padding: '3px 10px',
            background: logVisible ? 'var(--accent)' : 'transparent',
            color: logVisible ? '#000' : 'var(--text-dim)',
            border: '1px solid var(--accent)', borderRadius: 3, cursor: 'pointer',
          }}
        >
          📜 전투 로그 {logVisible ? 'ON' : 'OFF'}
        </button>
      </div>
      {logVisible && <CombatLog log={state.log} />}

      {/* Combat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Player */}
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', position: 'relative' }}>
          <div style={{ fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClassIcon className={me.className as any} size={22} />
            {me.name} <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>Lv.{me.level}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)' }}>나</span>
          </div>
          <Bar cur={Math.round(me.hp)} max={me.maxHp} color="var(--success)" label="HP" shield={me.shieldAmount} />
          <GaugeBar percent={playerGaugePct} color="var(--accent)" label="게이지" highlight={state.attackerWaitingInput} />
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>스피드 {me.speed}</div>
          <AnimatePresence>
            {popups.filter(p => p.side === 'me').map(p => (
              <motion.div key={p.id}
                initial={{ opacity: 0.9, y: 0 }}
                animate={{ opacity: 1, y: -36 }}
                exit={{ opacity: 0, y: -56 }}
                transition={{ duration: 0.8 }}
                style={{
                  position: 'absolute', top: 10, left: `${p.x}%`,
                  transform: 'translateX(-50%)', pointerEvents: 'none',
                  fontSize: 22, fontWeight: 800, whiteSpace: 'nowrap',
                  color: p.crit ? '#ff2222' : '#ff8844',
                  textShadow: p.crit
                    ? '0 0 6px rgba(255,34,34,0.7), 0 2px 3px rgba(0,0,0,0.8)'
                    : '0 0 6px rgba(255,136,68,0.5), 0 2px 3px rgba(0,0,0,0.7)',
                }}
              >
                -{p.value.toLocaleString()}{p.crit ? '!' : ''}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Opponent */}
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', position: 'relative' }}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClassIcon className={foe.className as any} size={22} />
            {foe.name} <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>Lv.{foe.level}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--danger)' }}>상대 (AI)</span>
          </div>
          <Bar cur={Math.round(foe.hp)} max={foe.maxHp} color="var(--danger)" label="HP" shield={foe.shieldAmount} />
          <GaugeBar percent={foeGaugePct} color="var(--danger)" label="게이지" />
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>스피드 {foe.speed}</div>
          <AnimatePresence>
            {popups.filter(p => p.side === 'foe').map(p => (
              <motion.div key={p.id}
                initial={{ opacity: 0.9, y: 0 }}
                animate={{ opacity: 1, y: -36 }}
                exit={{ opacity: 0, y: -56 }}
                transition={{ duration: 0.8 }}
                style={{
                  position: 'absolute', top: 10, left: `${p.x}%`,
                  transform: 'translateX(-50%)', pointerEvents: 'none',
                  fontSize: 22, fontWeight: 800, whiteSpace: 'nowrap',
                  color: p.crit ? '#ff2222' : '#ffd700',
                  textShadow: p.crit
                    ? '0 0 6px rgba(255,34,34,0.7), 0 2px 3px rgba(0,0,0,0.8)'
                    : '0 0 8px rgba(255,215,0,0.5), 0 2px 3px rgba(0,0,0,0.7)',
                }}
              >
                -{p.value.toLocaleString()}{p.crit ? '!' : ''}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* 스킬 슬롯 (공격자 수동) — 게이지 차면 눌러야 발동 */}
      {!isDone && (
        <PvPSkillBar
          skills={me.skills}
          waitingInput={state.attackerWaitingInput}
          gaugeFull={me.gauge >= GAUGE_MAX}
          onUse={useSkill}
        />
      )}
    </div>
  );
}

function PvPSkillBar({ skills, waitingInput, gaugeFull, onUse }: {
  skills: FighterSnapshot['skills'];
  waitingInput: boolean;
  gaugeFull: boolean;
  onUse: (id: number) => void;
}) {
  const canUse = waitingInput && gaugeFull;
  return (
    <div style={{
      padding: 12, background: 'var(--bg-panel)', border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>스킬 (수동)</span>
        {!gaugeFull && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>게이지 충전 중...</span>
        )}
        {canUse && (
          <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, animation: 'pulse 0.6s ease-in-out infinite alternate' }}>
            ⚡ 스킬을 선택하세요! (3초 내 미선택 시 자동 발동)
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {skills.map(sk => {
          const onCooldown = sk.cooldownLeft > 0;
          const usable = canUse && !onCooldown;
          const iconSrc = getSkillIcon(sk.name);
          return (
            <button
              key={sk.id}
              onClick={() => usable && onUse(sk.id)}
              disabled={!usable}
              style={{
                position: 'relative', minWidth: 100, padding: '10px 14px',
                background: usable
                  ? 'linear-gradient(135deg, var(--accent), var(--accent))'
                  : onCooldown ? 'var(--bg)' : 'var(--bg-panel)',
                color: usable ? '#000' : 'var(--text-dim)',
                border: `1px solid ${usable ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 6,
                cursor: usable ? 'pointer' : 'not-allowed',
                opacity: onCooldown ? 0.4 : canUse ? 1 : 0.7,
                transition: 'all 0.15s ease',
                animation: usable ? 'pulse 0.6s ease-in-out infinite alternate' : 'none',
                textAlign: 'center',
                boxShadow: usable ? '0 0 12px var(--accent)' : 'none',
              }}
            >
              {iconSrc && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                  <img src={iconSrc} alt="" width={32} height={32}
                    style={{ imageRendering: 'pixelated' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
              )}
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{sk.name}</div>
              <div style={{ fontSize: 9, color: usable ? '#000' : 'var(--text-dim)' }}>
                CD {sk.cooldown}{onCooldown ? ` (${sk.cooldownLeft})` : ''}
              </div>
              {onCooldown && (
                <div style={{
                  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--danger)', fontSize: 18, fontWeight: 700, borderRadius: 6,
                }}>{sk.cooldownLeft}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
