import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io as socketIo, type Socket } from 'socket.io-client';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

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

export function PvPCombatScreen() {
  const { battleId } = useParams();
  const navigate = useNavigate();
  const active = useCharacterStore((s) => s.activeCharacter);
  const [state, setState] = useState<PvPSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const [logVisible, setLogVisible] = useState(() => localStorage.getItem('combatLogVisible') !== '0');
  function toggleLog() {
    const next = !logVisible;
    setLogVisible(next);
    localStorage.setItem('combatLogVisible', next ? '1' : '0');
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

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

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state?.log.length]);

  async function useSkill(skillId: number) {
    if (!active || !battleId) return;
    try {
      await api(`/pvp/battle/${battleId}/use-skill`, { method: 'POST', body: JSON.stringify({ attackerId: active.id, skillId }) });
    } catch (e) { setErr(e instanceof Error ? e.message : 'use failed'); setTimeout(() => setErr(null), 2000); }
  }
  async function toggleAuto() {
    if (!active || !battleId) return;
    try { await api(`/pvp/battle/${battleId}/toggle-auto`, { method: 'POST', body: JSON.stringify({ attackerId: active.id }) }); }
    catch (e) { setErr(e instanceof Error ? e.message : 'toggle failed'); }
  }
  async function forfeit() {
    if (!active || !battleId) return;
    if (!confirm('기권하시겠습니까? (패배 처리)')) return;
    try { await api(`/pvp/battle/${battleId}/forfeit`, { method: 'POST', body: JSON.stringify({ attackerId: active.id }) }); }
    catch (e) { setErr(e instanceof Error ? e.message : 'forfeit failed'); }
  }

  if (!state) return <div style={{ padding: 20, color: '#aaa' }}>{err ? `에러: ${err}` : '전투 세션 연결 중...'}</div>;

  const me = state.attacker;
  const foe = state.defender;
  const isDone = state.ended;
  const remainingMs = Math.max(0, state.timeLimitMs - state.elapsedMs);
  const won = isDone && state.winnerId === me.id;
  const lost = isDone && state.winnerId === foe.id;

  return (
    <div style={{ padding: 16, maxWidth: 920, margin: '0 auto', color: '#ddd' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: '#ff6b88' }}>⚔ PvP 전투</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: remainingMs < 30_000 ? '#ff4444' : '#ccc' }}>남은 시간 {fmtTime(remainingMs)}</div>
          {!isDone && (
            <>
              <button onClick={toggleAuto} style={{ padding: '6px 12px', background: state.attackerAuto ? '#4ca74c' : '#2a2520', color: '#fff', border: '1px solid #4ca74c', cursor: 'pointer' }}>
                {state.attackerAuto ? '자동' : '수동'}
              </button>
              <button onClick={forfeit} style={{ padding: '6px 12px', background: '#2a1e1e', color: '#ff6666', border: '1px solid #884444', cursor: 'pointer' }}>기권</button>
            </>
          )}
        </div>
      </div>

      {err && <div style={{ padding: 8, marginBottom: 10, background: '#2a1e1e', border: '1px solid #884444', color: '#ff6666', fontSize: 12 }}>{err}</div>}

      {/* 종료 배너 */}
      {isDone && (
        <div style={{
          padding: 14, marginBottom: 12, textAlign: 'center',
          background: won ? '#1a3a1a' : lost ? '#3a1a1a' : '#2a2a1a',
          border: `2px solid ${won ? '#4ca74c' : lost ? '#aa4444' : '#aaaa44'}`,
          fontSize: 18, fontWeight: 700,
        }}>
          {won ? '🏆 승리!' : lost ? '💀 패배' : '🤝 무승부'}
          <span style={{ fontSize: 12, color: '#aaa', marginLeft: 10 }}>
            ({state.endReason === 'hp' ? 'HP 승부' : state.endReason === 'timeout' ? '시간 만료' : state.endReason === 'forfeit' ? '기권' : '연결 끊김'})
          </span>
          <div style={{ marginTop: 10 }}>
            <button onClick={() => navigate('/pvp')} style={{ padding: '8px 20px', background: '#daa520', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 700 }}>PvP 메뉴로</button>
          </div>
        </div>
      )}

      {/* 양측 HP + 게이지 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <FighterPanel fighter={me} side="me" waiting={state.attackerWaitingInput && !state.attackerAuto} />
        <FighterPanel fighter={foe} side="foe" />
      </div>

      {/* 스킬 슬롯 (공격자) */}
      {!isDone && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>
            내 스킬 {state.attackerWaitingInput && !state.attackerAuto && <span style={{ color: '#daa520' }}>— 3초 내 선택하지 않으면 자동 발동</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {me.skills.map(sk => {
              const cooldownPct = sk.cooldown > 0 ? (sk.cooldownLeft / sk.cooldown) : 0;
              const canUse = state.attackerWaitingInput && !state.attackerAuto && sk.cooldownLeft === 0 && me.gauge >= GAUGE_MAX;
              return (
                <button
                  key={sk.id}
                  onClick={() => canUse && useSkill(sk.id)}
                  disabled={!canUse}
                  style={{
                    padding: '8px 12px', fontSize: 12, minWidth: 90,
                    background: canUse ? '#4a3a1a' : '#1a1612',
                    border: `1px solid ${sk.cooldownLeft > 0 ? '#444' : '#daa520'}`,
                    color: canUse ? '#ffd66b' : sk.cooldownLeft > 0 ? '#666' : '#888',
                    cursor: canUse ? 'pointer' : 'not-allowed',
                    position: 'relative', overflow: 'hidden',
                  }}
                >
                  <div>{sk.name}</div>
                  <div style={{ fontSize: 9, color: '#888' }}>CD {sk.cooldown}</div>
                  {sk.cooldownLeft > 0 && (
                    <div style={{
                      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#ff8800', fontSize: 14, fontWeight: 700,
                    }}>{sk.cooldownLeft}</div>
                  )}
                  {cooldownPct > 0 && (
                    <div style={{
                      position: 'absolute', left: 0, bottom: 0, height: 2,
                      width: `${cooldownPct * 100}%`, background: '#ff8800',
                    }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 로그 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <button
          onClick={toggleLog}
          style={{
            fontSize: 11, padding: '3px 10px',
            background: logVisible ? '#daa520' : 'transparent',
            color: logVisible ? '#000' : '#888',
            border: '1px solid #daa520', borderRadius: 3, cursor: 'pointer',
          }}
        >
          📜 전투 로그 {logVisible ? 'ON' : 'OFF'}
        </button>
      </div>
      {logVisible && (
        <div style={{ background: '#1a1612', border: '1px solid #333', padding: 10, height: 220, overflowY: 'auto', fontSize: 12 }}>
          {state.log.map((line, i) => (
            <div key={i} style={{ marginBottom: 3, color: line.includes('치명타') ? '#ff8844' : line.includes('빗나감') ? '#888' : '#ccc' }}>
              {line}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}

function FighterPanel({ fighter, side, waiting }: { fighter: FighterSnapshot; side: 'me' | 'foe'; waiting?: boolean }) {
  const hpPct = Math.max(0, (fighter.hp / fighter.maxHp) * 100);
  const gaugePct = (fighter.gauge / GAUGE_MAX) * 100;
  const color = side === 'me' ? '#4caf50' : '#e94560';
  return (
    <div style={{ padding: 12, background: '#1a1612', border: `2px solid ${color}`, borderRadius: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, color }}>{fighter.name}</div>
        <div style={{ fontSize: 10, color: '#888' }}>Lv.{fighter.level} · {fighter.className}</div>
      </div>
      {/* HP 바 */}
      <div style={{ position: 'relative', height: 18, background: '#0e0c0a', border: '1px solid #333', marginBottom: 4 }}>
        <div style={{ height: '100%', width: `${hpPct}%`, background: color, transition: 'width 0.15s' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: 10, color: '#fff', fontWeight: 700, textShadow: '0 0 2px #000' }}>
          {Math.round(fighter.hp)} / {fighter.maxHp}
          {fighter.shieldAmount > 0 && <span style={{ marginLeft: 6, color: '#6aa4ff' }}>🛡 {fighter.shieldAmount}</span>}
        </div>
      </div>
      {/* 게이지 바 */}
      <div style={{ position: 'relative', height: 10, background: '#0e0c0a', border: '1px solid #333' }}>
        <div style={{ height: '100%', width: `${gaugePct}%`, background: waiting ? '#daa520' : '#66aaff', transition: 'width 0.1s linear' }} />
        {waiting && <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: 9, color: '#000', fontWeight: 700 }}>수동 입력 대기</div>}
      </div>
      <div style={{ fontSize: 9, color: '#666', marginTop: 4 }}>스피드 {fighter.speed}</div>
    </div>
  );
}
