import { useEffect, useState, useRef, useCallback, memo, type CSSProperties } from 'react';
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
  const [offlinePreview, setOfflinePreview] = useState<any>(null);
  // 종언의 기둥 — fieldName === '종언의 기둥' 일 때만 사용 (HUD/사망 모달)
  const [endlessState, setEndlessState] = useState<{
    currentFloor: number; highestFloor: number; dailyHighestFloor: number;
    nextBossFloor: number; isCurrentBossFloor: boolean; totalKills: number; totalDeaths: number;
  } | null>(null);
  const [endlessFloorStartedAt, setEndlessFloorStartedAt] = useState<number>(0);
  const [endlessNowTick, setEndlessNowTick] = useState<number>(Date.now());
  const [damagePopups, setDamagePopups] = useState<{ id: number; value: number; crit: boolean; x: number }[]>([]);
  const [skillFlash, setSkillFlash] = useState<{ icon: string; color: string } | null>(null);
  const skillFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupIdRef = useRef(0);
  const socketRef = useRef<Socket | null>(null);
  const prevMonsterHp = useRef<number>(0);
  const prevLogRef = useRef<string[] | null>(null);

  // 데미지 팝업 이펙트 토글 (localStorage 저장 — 기본 ON)
  const [fxEnabled, setFxEnabled] = useState(() => localStorage.getItem('combatFxEnabled') !== '0');
  function toggleFx() {
    const next = !fxEnabled;
    setFxEnabled(next);
    localStorage.setItem('combatFxEnabled', next ? '1' : '0');
    if (!next) setDamagePopups([]);
  }

  // 전투 로그 텍스트 창 표시 토글 (기본 ON)
  const [logVisible, setLogVisible] = useState(() => localStorage.getItem('combatLogVisible') !== '0');
  function toggleLog() {
    const next = !logVisible;
    setLogVisible(next);
    localStorage.setItem('combatLogVisible', next ? '1' : '0');
  }

  // BGM — 자동재생 X, 토글 ON 시 localStorage 영구 저장
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [bgmPlaying, setBgmPlaying] = useState(false);
  const [bgmEnabled, setBgmEnabled] = useState(() => localStorage.getItem('bgmEnabled') === '1');
  const [bgmVolume, setBgmVolume] = useState(() => {
    const saved = localStorage.getItem('bgmVolume');
    return saved ? Number(saved) : 0.3;
  });

  useEffect(() => () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
  }, []);

  useEffect(() => {
    if (bgmEnabled) {
      if (!audioRef.current) {
        const audio = new Audio('/bgm.mp3');
        audio.loop = true;
        audio.volume = bgmVolume;
        audioRef.current = audio;
      }
      audioRef.current.play().then(() => setBgmPlaying(true)).catch(() => setBgmPlaying(false));
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        setBgmPlaying(false);
      }
    }
  }, [bgmEnabled]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = bgmVolume;
      localStorage.setItem('bgmVolume', String(bgmVolume));
    }
  }, [bgmVolume]);

  function toggleBgm() {
    const next = !bgmEnabled;
    setBgmEnabled(next);
    localStorage.setItem('bgmEnabled', next ? '1' : '0');
  }

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
      if (snapshot.monster) prevMonsterHp.current = snapshot.monster.hp;

      const prevLog = prevLogRef.current;

      // 첫 수신: 저장만 하고 파싱 스킵
      if (prevLog === null) {
        prevLogRef.current = [...snapshot.log];
        setState(snapshot);
        return;
      }

      // 새 로그 라인 찾기: 이전 로그의 마지막 메시지 이후 부분
      let newLines: string[] = [];
      if (prevLog.length === 0) {
        newLines = snapshot.log;
      } else {
        const lastPrev = prevLog[prevLog.length - 1];
        const lastIdx = snapshot.log.lastIndexOf(lastPrev);
        if (lastIdx === -1) {
          // 로그 완전 리셋 (새 몬스터) — 전부 새 로그
          newLines = snapshot.log;
        } else if (lastIdx < snapshot.log.length - 1) {
          newLines = snapshot.log.slice(lastIdx + 1);
        }
      }

      if (newLines.length > 0) {
        const pops: { id: number; value: number; crit: boolean; x: number }[] = [];
        for (const line of newLines) {
          const dotMatch = line.match(/\[도트\] 몬스터에게 (\d+)/);
          if (dotMatch) {
            pops.push({ id: ++popupIdRef.current, value: parseInt(dotMatch[1]), crit: false, x: 20 + Math.random() * 40 });
            continue;
          }
          const skillDmgMatch = line.match(/\[(.+?)\]\s+(?:\d+타\s+)?(?:추가 고정\s+)?(\d+)\s*(?:데미지)?(!)?/);
          if (skillDmgMatch && skillDmgMatch[1] !== '도트') {
            const crit = !!skillDmgMatch[3];
            pops.push({ id: ++popupIdRef.current, value: parseInt(skillDmgMatch[2]), crit, x: 10 + Math.random() * 60 });
          }
          const extraMatch = line.match(/추가 타격! (\d+)/);
          if (extraMatch) {
            pops.push({ id: ++popupIdRef.current, value: parseInt(extraMatch[1]), crit: false, x: 30 + Math.random() * 40 });
          }
          const fxMatch = line.match(/\[(.+?)\]/);
          if (fxMatch) {
            const fx = SKILL_EFFECTS[fxMatch[1]];
            if (fx) {
              setSkillFlash({ icon: getSkillIcon(fxMatch[1]) || fx.icon, color: fx.glow });
              // 이전 타이머 취소 → setTimeout 누적 방지
              if (skillFlashTimerRef.current) clearTimeout(skillFlashTimerRef.current);
              skillFlashTimerRef.current = setTimeout(() => { setSkillFlash(null); skillFlashTimerRef.current = null; }, 600);
            }
          }
        }
        if (pops.length > 0 && fxEnabled) {
          // 최대 5개 유지: 오래된 것 제거 후 새 팝업 추가
          const MAX_POPUPS = 5;
          setDamagePopups(p => {
            const merged = [...p, ...pops];
            return merged.length > MAX_POPUPS ? merged.slice(merged.length - MAX_POPUPS) : merged;
          });
          const ids = pops.map(p => p.id);
          setTimeout(() => setDamagePopups(p => p.filter(v => !ids.includes(v.id))), 1200);
        }
      }

      prevLogRef.current = [...snapshot.log];
      setState(snapshot);
    });

    // 초기 상태 폴백 (WebSocket보다 먼저 도착할 때만)
    api<CombatSnapshot>(`/characters/${active.id}/combat/state`).then(s => {
      if (prevLogRef.current === null) {
        setState(s);
        if (s.monster) prevMonsterHp.current = s.monster.hp;
        prevLogRef.current = [...s.log];
      }
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

  // 종언의 기둥 — 진행 상태 폴링 (5초 간격, fieldName 매치 시만). 카운트다운은 500ms tick.
  const isEndless = state?.fieldName === '종언의 기둥';
  // 시공의 균열 — 30분 영속 타이머 카운트다운에도 endlessNowTick 재활용
  const isRift = state?.fieldName === '시공의 균열';
  useEffect(() => {
    if (!isEndless || !active) { setEndlessState(null); return; }
    let cancelled = false;
    const tick = async () => {
      try {
        const d = await api<NonNullable<typeof endlessState>>(`/endless/${active.id}/state`);
        if (!cancelled) setEndlessState(d);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isEndless, active]);
  useEffect(() => {
    if (!isEndless) return;
    setEndlessFloorStartedAt(Date.now());
  }, [isEndless, state?.monster?.name]);
  useEffect(() => {
    if (!isEndless && !isRift) return;
    const id = setInterval(() => setEndlessNowTick(Date.now()), 500);
    return () => clearInterval(id);
  }, [isEndless, isRift]);

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

  // 스킬 슬롯 드래그 reorder
  const reorderSkills = useCallback(async (orderedIds: number[]) => {
    if (!active) return;
    await api(`/characters/${active.id}/skills/reorder`, {
      method: 'POST', body: JSON.stringify({ skillIds: orderedIds }),
    }).catch(() => {});
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

  // AFK 모드 자동 해제 (deprecate) — 구 클라/오래된 세션이 afk.mode 를 true 로
  // 유지한 경우 유저가 "흑백 화면" 만 보는 상황 방지.
  useEffect(() => {
    if (state?.afk?.mode && active) {
      api(`/characters/${active.id}/combat/afk-mode`, {
        method: 'POST', body: JSON.stringify({ enabled: false }),
      }).catch(() => {});
    }
  }, [state?.afk?.mode, active?.id]);

  async function leave() {
    if (!active) return;
    // 길드 보스 세션이면 먼저 /guild-boss/exit 호출 → 세션 엔진 정리는 서버에서 endGuildBossCombatSession 담당
    const gbRunId = state?.guildBossRunId;
    if (gbRunId) {
      try {
        // 연습 모드는 DB run 이 없으므로 별도 엔드포인트로 세션만 종료
        if (gbRunId.startsWith('practice-')) {
          await api(`/guild-boss/practice-exit/${active.id}`, { method: 'POST' });
        } else {
          await api(`/guild-boss/exit/${gbRunId}`, { method: 'POST', body: JSON.stringify({ reason: 'exit' }) });
        }
      } catch (e) {
        console.error('[guild-boss] exit fail', e);
      }
      await refreshActive();
      nav('/guild-boss');
      return;
    }
    await api(`/characters/${active.id}/leave-field`, { method: 'POST' });
    await refreshActive();
    nav('/village');
  }

  // 오프라인 전환 — 명시적 클릭 시 커스텀 모달로 미리보기 표시 후 진행/취소.
  async function goOffline() {
    if (!active) return;
    try {
      const preview: any = await api(`/characters/${active.id}/combat/offline-preview`);
      setOfflinePreview(preview);
    } catch (e: any) {
      // preview 실패 시에도 진행 가능하도록 fallback 모달
      setOfflinePreview({ failed: true });
    }
  }

  async function confirmGoOffline() {
    if (!active) return;
    setOfflinePreview(null);
    try {
      await api(`/characters/${active.id}/combat/go-offline`, { method: 'POST' });
      await refreshActive();
      nav('/village');
    } catch (e: any) {
      alert(e?.message || '오프라인 전환 실패');
    }
  }

  // 오프라인 사냥중 — 명시적 중단 클릭까지 일반 전투 비활성. 정산도 중단 클릭 시점에만.
  if (state && (state as any).offlineMode) {
    const since = (state as any).offlineSince as string | undefined;
    const elapsedLabel = (() => {
      if (!since) return '';
      const ms = Date.now() - new Date(since).getTime();
      const totalMin = Math.max(0, Math.floor(ms / 60000));
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
    })();
    const stopOffline = async () => {
      if (!active) return;
      if (!confirm(`오프라인 사냥을 중단하고 즉시 보상을 정산받습니다.\n경과 시간: ${elapsedLabel}\n\n진행하시겠습니까?`)) return;
      try {
        const r = await api<{ ok: boolean; offlineReward: any }>(
          `/characters/${active.id}/combat/resume-from-offline`,
          { method: 'POST' }
        );
        if (r.offlineReward?.applied) {
          const d = r.offlineReward;
          alert(
            `오프라인 정산 완료\n\n` +
            `경과: ${Math.floor((d.elapsedSec || 0) / 60)}분\n` +
            `경험치: +${(d.expGain || 0).toLocaleString()}\n` +
            `골드: +${(d.goldGain || 0).toLocaleString()}\n` +
            `처치: +${d.killsInc || 0}마리\n` +
            `드랍: ${(d.drops || []).reduce((s: number, x: any) => s + (x.qty || 0), 0)}개 (종류 ${d.drops?.length || 0})\n` +
            (d.filteredCount > 0 ? `드랍필터 자동 폐기: ${d.filteredCount}개\n` : '') +
            (d.levelsGained > 0 ? `레벨업! Lv.${d.newLevel}\n` : '')
          );
        }
        await refreshActive();
        // /combat/state 재폴링 — useCombatState 훅이 자동 갱신할 것이므로 별도 처리 불필요
      } catch (e: any) {
        alert(e?.message || '오프라인 사냥 중단 실패');
      }
    };
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 20, padding: 20,
      }}>
        <div style={{
          maxWidth: 480, width: '100%',
          background: 'linear-gradient(180deg, #001a2a, #000a1a)',
          border: '3px solid #88c8ff',
          boxShadow: '0 0 40px rgba(136,200,255,0.5)',
          padding: '30px 28px', textAlign: 'center',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#88c8ff', marginBottom: 8, letterSpacing: 2 }}>
            오프라인 사냥중
          </div>
          <div style={{ fontSize: 14, color: '#aaccff', marginBottom: 6 }}>
            이 캐릭터는 현재 오프라인 모드입니다.
          </div>
          {since && (
            <div style={{ fontSize: 13, color: '#88c8ff', marginTop: 16, marginBottom: 6, fontWeight: 700 }}>
              경과 시간: {elapsedLabel}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 10, marginBottom: 20, lineHeight: 1.6 }}>
            · 사냥 효율은 최근 100초 평균값으로 계속 누적 중<br/>
            · 최대 24시간까지 누적 가능<br/>
            · 중단 시 즉시 보상이 정산됩니다
          </div>
          <button onClick={stopOffline} style={{
            padding: '14px 36px', fontSize: 16, fontWeight: 800,
            background: '#88c8ff', color: '#000', border: 'none', cursor: 'pointer',
            borderRadius: 4, letterSpacing: 2,
            boxShadow: '0 2px 12px rgba(136,200,255,0.4)',
          }}>
            오프라인 사냥 중단
          </button>
          <div style={{ marginTop: 14 }}>
            <button onClick={() => nav('/village')} style={{
              padding: '8px 20px', fontSize: 12,
              background: 'transparent', color: 'var(--text-dim)',
              border: '1px solid var(--border)', cursor: 'pointer', borderRadius: 3,
            }}>
              마을로 돌아가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!state || !state.inCombat) {
    return <div style={{ color: 'var(--text-dim)' }}>전투 준비 중...</div>;
  }

  if (state.player.hp <= 0) {
    const goVillage = async () => {
      if (!active) return;
      try { await api(`/characters/${active.id}/leave-field`, { method: 'POST' }); } catch {}
      await refreshActive();
      nav('/village');
    };
    // 종언의 기둥 사망 모달 — 1층 하락 + 다시 도전 / 마을로
    if (state.fieldName === '종언의 기둥' && active) {
      const reachedFloor = endlessState?.currentFloor ?? 1;
      const dailyMax = endlessState?.dailyHighestFloor ?? 0;
      const allTimeMax = endlessState?.highestFloor ?? 0;
      const retry = async () => {
        try {
          await api(`/endless/${active.id}/enter`, { method: 'POST' });
          // 페이지 새로고침으로 세션 재구성
          window.location.reload();
        } catch (e) { alert(e instanceof Error ? e.message : '재도전 실패'); }
      };
      return (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 20, padding: 20,
        }}>
          <div style={{
            maxWidth: 480, width: '100%',
            background: 'linear-gradient(180deg, #1a0030, #0a0020)',
            border: '3px solid #a24bff',
            boxShadow: '0 0 40px rgba(162,75,255,0.5)',
            padding: '30px 28px', textAlign: 'center', borderRadius: 8,
          }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#c97bff', marginBottom: 8, letterSpacing: 2 }}>
              종언의 기둥
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#ff5050', marginBottom: 12 }}>
              1층 하락합니다
            </div>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20,
              padding: '14px 16px', background: 'rgba(0,0,0,0.5)',
              border: '1px solid rgba(162,75,255,0.3)', borderRadius: 6, fontSize: 13,
            }}>
              <div style={{ color: '#fff' }}>도달했던 층: <b style={{ color: '#ffcc66' }}>{reachedFloor}층</b></div>
              <div style={{ color: '#fff' }}>당일 최고: <b style={{ color: '#88c8ff' }}>{dailyMax}층</b></div>
              <div style={{ color: '#fff' }}>역대 최고: <b style={{ color: '#c97bff' }}>{allTimeMax}층</b></div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={retry} style={{
                padding: '12px 28px', fontSize: 14, fontWeight: 800,
                background: '#a24bff', color: '#fff', border: 'none', cursor: 'pointer',
                borderRadius: 4, letterSpacing: 1,
              }}>
                다시 도전
              </button>
              <button onClick={goVillage} style={{
                padding: '12px 28px', fontSize: 14, fontWeight: 800,
                background: 'transparent', color: 'var(--text-dim)',
                border: '1px solid var(--border)', cursor: 'pointer', borderRadius: 4,
              }}>
                마을로
              </button>
            </div>
          </div>
        </div>
      );
    }
    // 최근 로그에서 사망 원인 찾기 (최근 5줄에서 "사망" 포함 라인 + 직전 라인)
    const recentLog = (state.log || []).slice(-5);
    const deathLine = recentLog.find(l => l.includes('사망')) || '';
    const lastHitLine = recentLog.filter(l => l.includes('몬스터')).slice(-1)[0] || '';
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 20, padding: 20,
      }}>
        <div style={{
          maxWidth: 480, width: '100%',
          background: 'linear-gradient(180deg, #2a0000, #1a0000)',
          border: '3px solid #ff3030',
          boxShadow: '0 0 40px rgba(255,48,48,0.5)',
          padding: '30px 28px', textAlign: 'center',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 72, marginBottom: 12, filter: 'drop-shadow(0 2px 8px rgba(255,48,48,0.7))' }}>💀</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#ff5050', marginBottom: 8, letterSpacing: 2 }}>
            사망했습니다
          </div>
          <div style={{ fontSize: 13, color: '#ffaaaa', marginBottom: 6 }}>
            몬스터에게 당해 쓰러졌습니다.
          </div>
          {(deathLine || lastHitLine) && (
            <div style={{
              marginTop: 14, padding: '10px 12px',
              background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,80,80,0.3)',
              fontSize: 11, color: 'var(--text-dim)', textAlign: 'left',
              fontFamily: 'monospace', lineHeight: 1.6, borderRadius: 4,
            }}>
              {lastHitLine && <div>{lastHitLine}</div>}
              {deathLine && <div style={{ color: '#ff5050' }}>{deathLine}</div>}
            </div>
          )}
          {(state.sessionDamage ?? 0) > 0 && (
            <div style={{
              marginTop: 12, padding: '10px 14px',
              background: 'rgba(218,165,32,0.12)', border: '1px solid rgba(218,165,32,0.4)',
              borderRadius: 4, fontSize: 13,
            }}>
              <span style={{ color: 'var(--text-dim)' }}>이번 전투 누적 데미지 </span>
              <b style={{ color: '#ffcc66' }}>{(state.sessionDamage ?? 0).toLocaleString()}</b>
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 16, marginBottom: 20, lineHeight: 1.5 }}>
            · 마을로 돌아가면 전투 세션이 종료됩니다<br/>
            · HP는 자동으로 100% 회복됩니다<br/>
            · 방치 중이었다면 이후 시간은 보상 없음
          </div>
          <button onClick={goVillage} style={{
            padding: '14px 36px', fontSize: 16, fontWeight: 800,
            background: 'var(--accent)', color: '#000', border: 'none', cursor: 'pointer',
            borderRadius: 4, letterSpacing: 2,
            boxShadow: '0 2px 12px rgba(218,165,32,0.4)',
          }}>
            확인 — 마을로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const playerGaugePct = Math.min(100, (localGauges.player / 1000) * 100);
  const monsterGaugePct = Math.min(100, (localGauges.monster / 1000) * 100);

  // 경험치 계산
  const exp = state.exp ?? 0;
  const expMax = state.expMax ?? 1;
  const expPct = Math.min(100, (exp / expMax) * 100);


  // 종언의 기둥 — HUD 정보 (현재 층/진척도/카운트다운/최고기록)
  const endlessHud = isEndless && endlessState ? (() => {
    const floor = endlessState.currentFloor;
    const isBoss = endlessState.isCurrentBossFloor;
    const nextBoss = endlessState.nextBossFloor;
    const progress = ((floor - 1) % 100); // 0~99 (다음 보스까지 카운터)
    const elapsedMs = endlessFloorStartedAt > 0 ? Math.max(0, endlessNowTick - endlessFloorStartedAt) : 0;
    const remainSec = Math.max(0, Math.ceil((60_000 - elapsedMs) / 1000));
    const timeFracPct = Math.min(100, Math.max(0, (elapsedMs / 60_000) * 100));
    const timeColor = remainSec > 30 ? '#3ddc84' : remainSec > 10 ? '#daa520' : '#ff5050';
    return (
      <div style={{
        margin: '0 0 12px', padding: '12px 14px',
        background: 'linear-gradient(180deg, rgba(40,10,80,0.9), rgba(20,5,40,0.95))',
        border: '2px solid #a24bff', borderRadius: 6,
        boxShadow: '0 0 20px rgba(162,75,255,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: '#c97bff', fontWeight: 700 }}>종언의 기둥</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: isBoss ? '#ff5050' : '#ffcc66' }}>
              {floor}층 {isBoss && <span style={{ color: '#ff5050' }}>(보스)</span>}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#aaa', textAlign: 'right' }}>
            <div>당일 최고: <b style={{ color: '#88c8ff' }}>{endlessState.dailyHighestFloor}층</b></div>
            <div>역대 최고: <b style={{ color: '#c97bff' }}>{endlessState.highestFloor}층</b></div>
          </div>
        </div>
        {/* 다음 보스 진척도 */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 10, color: '#aaa', marginBottom: 2 }}>다음 보스까지: {nextBoss - floor}층</div>
          <div style={{ height: 6, background: 'rgba(0,0,0,0.5)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              width: `${progress}%`, height: '100%',
              background: 'linear-gradient(90deg, #a24bff, #c97bff)',
            }} />
          </div>
        </div>
        {/* 1분 카운트다운 */}
        <div>
          <div style={{ fontSize: 10, color: timeColor, marginBottom: 2, fontWeight: 700 }}>
            남은 시간: {remainSec}초
          </div>
          <div style={{ height: 4, background: 'rgba(0,0,0,0.5)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${100 - timeFracPct}%`, height: '100%', background: timeColor,
              transition: 'width 0.5s linear',
            }} />
          </div>
        </div>
      </div>
    );
  })() : null;

  // 종언의 기둥 — 어두운 탑 배경 (DCSS stone_dark0 타일 반복 + 보라/검정 그라디언트)
  const endlessBgStyle: CSSProperties | undefined = isEndless ? {
    backgroundImage: 'linear-gradient(180deg, rgba(20,5,35,0.85), rgba(5,2,15,0.92)), url(/images/fields/stone_dark0.png)',
    backgroundRepeat: 'repeat',
    backgroundSize: 'auto, 64px 64px',
    boxShadow: 'inset 0 0 120px rgba(162,75,255,0.2)',
    minHeight: '100vh',
    margin: '-16px -16px 0',
    padding: '16px 16px 0',
  } : undefined;

  return (
    <div style={endlessBgStyle}>
      {endlessHud}
      {/* 오프라인 전환 미리보기 모달 */}
      {offlinePreview && (() => {
        const p = offlinePreview;
        const failed = !!p.failed;
        const eligible = !failed && p.eligible;
        const fmt = (n: number) => Math.round(n).toLocaleString();
        const accent = eligible ? '#3ddc84' : '#ff4444';
        const accentBg = eligible ? 'rgba(61,220,132,0.12)' : 'rgba(255,68,68,0.12)';
        const accentBorder = eligible ? 'rgba(61,220,132,0.5)' : 'rgba(255,68,68,0.5)';
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}>
            <div style={{
              maxWidth: 520, width: '100%',
              background: 'var(--bg-panel)', border: `2px solid ${accent}`,
              boxShadow: `0 0 30px ${accentBg}`,
              borderRadius: 8, padding: '22px 24px',
            }}>
              <h3 style={{ margin: 0, marginBottom: 12, color: 'var(--accent)', fontSize: 18 }}>
                오프라인 전환 — 정산 미리보기
              </h3>

              {failed ? (
                <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 16, lineHeight: 1.7 }}>
                  현재 EMA 조회 실패 — 그래도 진행 가능합니다.
                </div>
              ) : (
                <>
                  {/* 상태 강조 박스 */}
                  <div style={{
                    padding: '12px 14px', marginBottom: 14,
                    background: accentBg,
                    border: `2px solid ${accent}`,
                    borderRadius: 6,
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: accent, letterSpacing: 1 }}>
                      {eligible ? '✓ 정산 가능' : '✗ 보상 없음'}
                    </div>
                    <div style={{ fontSize: 12, color: accent, marginTop: 4, opacity: 0.9 }}>
                      {eligible
                        ? `현재 평균 효율로 정산됩니다 (효율이 낮으면 보상도 적습니다)`
                        : `현재 사냥터 ${p.currentFieldKills ?? 0}/${p.minFieldKillsRequired}킬 미달 — 정산 0`}
                    </div>
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
                    현재 사냥터 처치: <span style={{ color: 'var(--text)', fontWeight: 700 }}>{fmt(p.currentFieldKills ?? 0)}킬</span>
                    <span style={{ marginLeft: 6, opacity: 0.7 }}>
                      / 정산 가능 최소 {p.minFieldKillsRequired}킬
                    </span>
                  </div>

                  <div style={{
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    padding: '10px 12px', borderRadius: 4, marginBottom: 10, fontSize: 12, lineHeight: 1.7,
                  }}>
                    <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>현재 평균 효율 (최근 100초)</div>
                    <div>· 경험치 {p.rates.expPerSec}/초</div>
                    <div>· 골드 {p.rates.goldPerSec}/초</div>
                    <div>· 처치 {p.rates.killsPerSec}/초</div>
                    <div>· 드랍 {p.rates.dropsPerSec}/초</div>
                  </div>

                  <div style={{
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    padding: '10px 12px', borderRadius: 4, marginBottom: 10, fontSize: 12, lineHeight: 1.7,
                  }}>
                    <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>예상 보상</div>
                    <div>시간당: EXP +{fmt(p.perHour.exp)}, 골드 +{fmt(p.perHour.gold)}</div>
                    <div>8시간: EXP +{fmt(p.cap8h.exp)}, 골드 +{fmt(p.cap8h.gold)}</div>
                    <div style={{ color: '#ffcc00', fontWeight: 700 }}>
                      24시간(상한): EXP +{fmt(p.cap24h.exp)}, 골드 +{fmt(p.cap24h.gold)}
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 16 }}>
                    · 보상은 위에 표시된 평균 효율 × 경과 시간 (낮으면 적게, 높으면 많이)<br/>
                    · 계정당 최대 2캐릭만 오프라인 가능<br/>
                    · 부스트 적용 중엔 EMA 정지 (위 수치는 base 효율)<br/>
                    · 사냥터 이동 시 EMA + 사냥터 킬카운트 리셋<br/>
                    · 현재 사냥터에서 최소 {p.minFieldKillsRequired}킬 잡아야 정산 가능
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setOfflinePreview(null)}
                  style={{
                    padding: '10px 22px', fontSize: 13, fontWeight: 700,
                    background: 'transparent', color: 'var(--text-dim)',
                    border: '1px solid var(--border)', cursor: 'pointer', borderRadius: 4,
                  }}
                >
                  취소
                </button>
                <button
                  onClick={confirmGoOffline}
                  style={{
                    padding: '10px 22px', fontSize: 14, fontWeight: 800,
                    background: accent, color: '#000',
                    border: 'none', cursor: 'pointer', borderRadius: 4,
                    letterSpacing: 1,
                    boxShadow: `0 2px 12px ${accentBorder}`,
                  }}
                >
                  {failed || eligible ? '오프라인 전환' : '그래도 진행'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 시공의 균열 — 30분 영속 타이머 표시 (남은 시간) */}
      {state.fieldName === '시공의 균열' && state.riftExpiresAt && (() => {
        const remainMs = Math.max(0, state.riftExpiresAt - endlessNowTick);
        const totalSec = Math.floor(remainMs / 1000);
        const m = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        const lowTime = remainMs < 5 * 60_000; // 5분 미만 강조
        return (
          <div style={{
            marginBottom: 10, padding: '8px 12px',
            background: lowTime ? 'rgba(255,80,80,0.15)' : 'rgba(170,120,255,0.10)',
            border: `1px solid ${lowTime ? '#ff5050' : '#a24bff'}`,
            borderRadius: 4,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 12,
          }}>
            <span style={{ color: lowTime ? '#ff8888' : '#c97bff', fontWeight: 700 }}>
              ⌛ 시공의 균열 — 던전 제한시간
            </span>
            <span style={{
              fontSize: 16, fontWeight: 900,
              color: lowTime ? '#ff5050' : '#fff',
              fontFamily: 'monospace',
              letterSpacing: 1,
            }}>
              {m.toString().padStart(2, '0')}:{sec.toString().padStart(2, '0')}
            </span>
          </div>
        );
      })()}

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
          {!state.guildBossRunId && state.fieldName !== '시공의 균열' && state.fieldName !== '종언의 기둥' && (
            <button
              onClick={goOffline}
              title="오프라인 보상 누적 시작 (계정당 최대 2캐릭)"
              style={{
                background: 'transparent',
                color: '#88c8ff',
                border: '1px solid #88c8ff',
                fontWeight: 700,
              }}
            >
              오프라인 전환
            </button>
          )}
          {state.fieldName === '종언의 기둥' && active && (
            <button
              onClick={async () => {
                if (!confirm('현재 층 진행을 포기하고 1층 하락합니다. 진행하시겠습니까?')) return;
                try {
                  await api(`/endless/${active.id}/give-up`, { method: 'POST' });
                  await refreshActive();
                  nav('/village');
                } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
              }}
              title="자진 포기 — 1층 하락"
              style={{
                background: 'transparent', color: '#ff5050',
                border: '1px solid #ff5050', fontWeight: 700,
              }}
            >
              자진 포기
            </button>
          )}
          <button onClick={leave} style={state.guildBossRunId ? {
            background: 'var(--danger)', color: '#fff', border: 'none', fontWeight: 700,
          } : undefined}>
            {state.guildBossRunId ? '길드 보스 퇴장' : '마을 귀환'}
          </button>
        </div>
      </div>

      {/* Combat log (상단 배치) — 터치/휠/클릭 시 자동스크롤 정지 · 토글 가능 */}
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
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {active?.className && <ClassIcon className={active.className as ClassName} size={22} />}
            {active?.name} <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>Lv.{active?.level}</span>
            {(state.summons && state.summons.length > 0) && (
              <div style={{ display: 'flex', gap: 4, marginLeft: 6 }}>
                {state.summons.map((sm, i) => {
                  const icon = getSkillIcon(sm.skillName);
                  const elColor: Record<string, string> = {
                    fire: '#ff6644', frost: '#66ccff', lightning: '#ffee66',
                    earth: '#aa8855', holy: '#ffffaa', dark: '#aa66ee',
                  };
                  const border = sm.element && elColor[sm.element] ? elColor[sm.element] : '#44cc88';
                  return (
                    <div key={`${sm.skillName}-${i}`} title={`${sm.skillName}${sm.element ? ` (${sm.element})` : ''} · ${sm.remainingActions}행동`}
                      style={{
                        width: 26, height: 26, border: `2px solid ${border}`, borderRadius: 4,
                        background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden', flexShrink: 0,
                      }}>
                      {icon ? (
                        <img src={icon} alt={sm.skillName} width={22} height={22} style={{ imageRendering: 'pixelated' }} />
                      ) : (
                        <span style={{ fontSize: 9, color: border }}>{sm.skillName.slice(0, 2)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <Bar
            cur={state.player.hp}
            max={state.player.maxHp}
            color="var(--success)"
            label="HP"
            shield={(state.player.effects || []).filter(e => e.type === 'shield' && e.value > 0).reduce((sum, e) => sum + e.value, 0)}
          />
          {/* 경험치바 */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8b8bef' }}>
              <span>EXP</span><span>{exp.toLocaleString()} / {expMax.toLocaleString()} ({Math.round(expPct)}%)</span>
            </div>
            <div style={{ height: 6, background: 'var(--bg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${expPct}%`, background: '#8b8bef', transition: 'width 0.3s' }} />
            </div>
          </div>
          {state.rage !== undefined && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: state.rage >= 100 ? '#ff4444' : '#ff8844' }}>
                <span>🔥 분노</span><span>{state.rage}/100{state.rage >= 100 ? ' — 다음 공격 ×3!' : ''}</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${state.rage}%`, background: state.rage >= 100 ? '#ff4444' : '#ff8844', transition: 'width 0.3s' }} />
              </div>
            </div>
          )}
          {state.poisonResonance !== undefined && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: state.poisonResonance >= 10 ? '#8fff88' : '#4faf44' }}>
                <span>💀 독의 공명</span>
                <span>{state.poisonResonance}/10{state.poisonResonance >= 10 ? ' — 다음 행동에 폭발!' : ''}</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(state.poisonResonance / 10) * 100}%`, background: state.poisonResonance >= 10 ? '#8fff88' : '#4faf44', transition: 'width 0.3s' }} />
              </div>
            </div>
          )}
          {state.manaFlow !== undefined && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: state.manaFlow.active > 0 ? '#66ddff' : '#6688cc' }}>
                <span>✨ 마나의 흐름</span>
                <span>{state.manaFlow.active > 0
                  ? `버스트! ${state.manaFlow.active}행동 — 쿨다운 무시`
                  : `${state.manaFlow.stacks}/5`}</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: state.manaFlow.active > 0
                    ? `${(state.manaFlow.active / 5) * 100}%`
                    : `${(state.manaFlow.stacks / 5) * 100}%`,
                  background: state.manaFlow.active > 0 ? '#66ddff' : '#6688cc',
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          )}
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
                {state.monster.name}
                {state.guildBossRunId
                  ? <span style={{ fontSize: 11, color: '#daa520', marginLeft: 6 }}>[길드 보스]</span>
                  : <span style={{ fontSize: 13 }}>Lv.{state.monster.level}</span>}
              </div>
              {state.guildBossRunId ? (
                <div style={{
                  padding: '8px 12px', background: '#2a1a0a', border: '1px solid #daa520',
                  fontSize: 14, fontWeight: 700, color: '#daa520', marginBottom: 6,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span>HP ∞</span>
                  <span style={{ fontSize: 11, color: '#a09888' }}>데미지 누적 → 퇴장 시 상자</span>
                </div>
              ) : (
                <Bar cur={state.monster.hp} max={state.monster.maxHp} color="var(--danger)" label="HP" />
              )}
              <GaugeBar percent={monsterGaugePct} color="var(--danger)" label="게이지" />
              <EffectIcons effects={state.monster.effects} />
              {state.killStats && (
                <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text-dim)', marginTop: 4, flexWrap: 'wrap' }}>
                  <span>현재 <b style={{ color: '#ffaa66' }}>{state.killStats.current.toFixed(1)}s</b></span>
                  {state.killStats.last > 0 && <span>마지막 <b style={{ color: '#fff' }}>{state.killStats.last.toFixed(2)}s</b></span>}
                  {state.killStats.count > 0 && <span>평균 <b style={{ color: '#66ddff' }}>{state.killStats.avg.toFixed(2)}s</b> ({state.killStats.count}킬)</span>}
                </div>
              )}
              <AnimatePresence>
                {damagePopups.map(p => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0.8, y: 0 }}
                    animate={{ opacity: 1, y: -30 }}
                    exit={{ opacity: 0, y: -50 }}
                    transition={{ duration: 0.6 }}
                    style={{
                      position: 'absolute', top: 10, left: `${p.x}%`,
                      transform: 'translateX(-50%)',
                      pointerEvents: 'none', textAlign: 'center',
                      whiteSpace: 'nowrap',
                      fontSize: 20, fontWeight: 800,
                      color: p.crit ? '#ff2222' : '#ffd700',
                      textShadow: p.crit
                        ? '0 0 6px rgba(255,34,34,0.7), 0 2px 3px rgba(0,0,0,0.8)'
                        : '0 0 8px rgba(255,215,0,0.5), 0 2px 3px rgba(0,0,0,0.7)',
                    }}
                  >
                    -{p.value.toLocaleString()}{p.crit ? '!' : ''}
                  </motion.div>
                ))}
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
                  >{skillFlash.icon.startsWith('/') ? (
                    <img src={skillFlash.icon} alt="" width={48} height={48} style={{ imageRendering: 'pixelated' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : skillFlash.icon}</motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <div style={{ color: 'var(--text-dim)' }}>적을 찾는 중...</div>
          )}
        </div>
      </div>

      {/* 허수아비 존 딜 체크 패널 */}
      {state.dummy && (() => {
        const total = state.dummy.totalDamage;
        const elapsedSec = state.dummy.elapsedMs / 1000;
        const dps = elapsedSec > 0 ? Math.round(total / elapsedSec) : 0;
        return (
          <div style={{
            padding: 12, marginBottom: 8,
            background: 'rgba(100,220,255,0.08)',
            border: '1px solid #66ddff', borderRadius: 4,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#66ddff' }}>딜 체크</span>
              <button onClick={async () => {
                if (!active) return;
                try { await api(`/characters/${active.id}/combat/dummy-reset`, { method: 'POST' }); } catch {}
              }} style={{ fontSize: 10, padding: '3px 10px' }}>측정 초기화</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 12 }}>
              <div>
                <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>누적 데미지</div>
                <div style={{ color: '#ffcc66', fontWeight: 700, fontSize: 14 }}>{total.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>경과 시간</div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{elapsedSec.toFixed(1)}s</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>DPS</div>
                <div style={{ color: '#66ddff', fontWeight: 700, fontSize: 14 }}>{dps.toLocaleString()}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 길드 + 영토 + 접두사 획득 보너스 */}
      {(() => {
        const gb = state.guildBuffs;
        const tb = state.territoryBuffs;
        const pb = state.prefixBuffs;
        const items: { label: string; pct: number; color: string; icon?: string }[] = [];
        if (gb) {
          if (gb.hp > 0) items.push({ label: '길드 체력', pct: gb.hp, color: '#e07070' });
          if (gb.gold > 0) items.push({ label: '길드 골드', pct: gb.gold, color: '#e0a040' });
          if (gb.exp > 0) items.push({ label: '길드 경험', pct: gb.exp, color: '#8b8bef' });
          if (gb.drop > 0) items.push({ label: '길드 드랍', pct: gb.drop, color: '#66dd66' });
        }
        if (tb) {
          if (tb.expPct > 0) items.push({ label: '영토 경험', pct: tb.expPct, color: '#daa520', icon: '/images/skills/spells/shields.png' });
          if (tb.dropPct > 0) items.push({ label: '영토 드랍', pct: tb.dropPct, color: '#daa520', icon: '/images/skills/spells/shields.png' });
        }
        if (pb) {
          if (pb.gold > 0) items.push({ label: '접두사 골드', pct: pb.gold, color: '#e0a040' });
          if (pb.exp > 0) items.push({ label: '접두사 경험', pct: pb.exp, color: '#8b8bef' });
          if (pb.drop > 0) items.push({ label: '접두사 드랍', pct: pb.drop, color: '#66dd66' });
        }
        if (items.length === 0) return null;
        return (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6, alignItems: 'center' }}>
            {items.map((x, i) => (
              <span key={i} style={{
                padding: '2px 7px', fontSize: 10, fontWeight: 700, borderRadius: 3,
                background: `${x.color}15`, color: x.color, border: `1px solid ${x.color}40`,
                display: 'inline-flex', alignItems: 'center', gap: 3,
              }}>
                {x.icon && <img src={x.icon} alt="" width={10} height={10} style={{ imageRendering: 'pixelated' }} />}
                {x.label} +{x.pct}%
              </span>
            ))}
          </div>
        );
      })()}

      {/* 활성 버프 */}
      {state.boosts && state.boosts.length > 0 && (
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8,
        }}>
          {state.boosts.map((b: { name: string; until: string }, i: number) => {
            let timeLeft = '';
            if (b.until) {
              const sec = Math.max(0, Math.floor((new Date(b.until).getTime() - Date.now()) / 1000));
              const h = Math.floor(sec / 3600);
              const m = Math.floor((sec % 3600) / 60);
              timeLeft = h > 0 ? `${h}시간 ${m}분` : `${m}분`;
            }
            const color = b.name.includes('EXP') ? '#8b8bef' : b.name.includes('골드') ? '#e0a040' : b.name.includes('드롭') ? '#66dd66' : 'var(--accent)';
            return (
              <span key={i} style={{
                padding: '3px 8px', fontSize: 10, fontWeight: 700, borderRadius: 3,
                background: `${color}15`, color, border: `1px solid ${color}40`,
              }}>
                {b.name}{timeLeft ? ` (${timeLeft})` : ' (상시)'}
              </span>
            );
          })}
        </div>
      )}

      {/* Skill bar */}
      <SkillBar
        skills={state.skills}
        waitingInput={state.waitingInput}
        autoMode={state.autoMode}
        onUse={useSkill}
        onReorder={reorderSkills}
      />

      {/* 딜미터기 */}
      <DamageMeter log={state.log} />

      {/* 보유 물약 */}
      {state.potions && (() => {
        const p = state.potions;
        const items: { label: string; qty: number; src: string }[] = [
          { label: '소', qty: p.small, src: '/images/items/potion/ruby.png' },
          { label: '중', qty: p.mid, src: '/images/items/potion/ruby.png' },
          { label: '고', qty: p.high, src: '/images/items/potion/ruby.png' },
          { label: '최상', qty: p.max, src: '/images/items/potion/ruby.png' },
          { label: '최고', qty: p.supreme || 0, src: '/images/items/potion/magenta.png' },
        ];
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', marginTop: 8,
            background: 'var(--bg-panel)', border: '1px solid var(--border)', fontSize: 11,
            flexWrap: 'wrap',
          }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>HP 물약</span>
            {items.map((it, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                color: it.qty > 0 ? 'var(--text)' : 'var(--text-dim)',
                opacity: it.qty > 0 ? 1 : 0.4,
              }}>
                <img src={it.src} alt="" width={16} height={16}
                  style={{ imageRendering: 'pixelated' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{it.label}</span>
                <span style={{ fontWeight: 700 }}>{it.qty}</span>
              </span>
            ))}
            <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: 10 }}>
              총 {items.reduce((s, x) => s + x.qty, 0)}개
            </span>
          </div>
        );
      })()}

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

      {/* BGM 토글 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', marginTop: 8,
        background: 'var(--bg-panel)', border: '1px solid var(--border)', fontSize: 12,
      }}>
        <button onClick={toggleBgm} style={{
          width: 28, height: 28, borderRadius: '50%', fontSize: 13,
          background: bgmPlaying ? 'var(--accent)' : 'transparent',
          color: bgmPlaying ? '#000' : 'var(--accent)',
          border: '2px solid var(--accent)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {bgmPlaying ? '\u23F8' : '\u25B6'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>전투 BGM</span>
        <input type="range" min={0} max={100} step={1}
          value={Math.round(bgmVolume * 100)}
          onChange={e => setBgmVolume(Number(e.target.value) / 100)}
          style={{ width: 100, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 10, color: 'var(--text-dim)', minWidth: 30 }}>{Math.round(bgmVolume * 100)}%</span>
        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
        <button onClick={toggleFx} style={{
          padding: '4px 10px', fontSize: 11, fontWeight: 700,
          background: fxEnabled ? 'var(--accent)' : 'transparent',
          color: fxEnabled ? '#000' : 'var(--accent)',
          border: '1px solid var(--accent)', cursor: 'pointer',
        }}>
          데미지 팝업 {fxEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
}

export function Bar({ cur, max, color, label, shield = 0 }: { cur: number; max: number; color: string; label: string; shield?: number }) {
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  // 쉴드는 HP 위에 추가 게이지로 표시 (HP를 초과해도 비례 폭으로 표시)
  const shieldPct = shield > 0 ? Math.max(0, Math.min(100, (shield / max) * 100)) : 0;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)' }}>
        <span>
          {label}
          {shield > 0 && (
            <span style={{ marginLeft: 6, color: '#66ccff', fontWeight: 700 }}>
              + 쉴드 {shield.toLocaleString()}
            </span>
          )}
        </span>
        <span>{cur} / {max}</span>
      </div>
      <div style={{ position: 'relative', height: 10, background: 'var(--bg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <motion.div animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }}
          style={{ height: '100%', background: color }} />
        {/* 쉴드 오버레이 — HP 바 위에 푸른 줄무늬 */}
        {shield > 0 && (
          <div style={{
            position: 'absolute', left: `${pct}%`, top: 0,
            width: `${Math.min(100 - pct, shieldPct)}%`, height: '100%',
            background: 'repeating-linear-gradient(45deg, rgba(102,204,255,0.7), rgba(102,204,255,0.7) 4px, rgba(102,204,255,0.4) 4px, rgba(102,204,255,0.4) 8px)',
            borderLeft: '1px solid #66ccff',
          }} />
        )}
      </div>
    </div>
  );
}


export function GaugeBar({ percent, color, label, highlight }: {
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
  // 소환수는 닉네임 옆 전용 UI 로 표시 — effect 바에서 제외
  const noSummon = effects.filter(e => (e.type as string) !== 'summon');
  if (noSummon.length === 0) return null;

  // 타입별 스택 집계: 같은 타입 버프/디버프를 1개로 머지해 x스택 수로 표시.
  // (독·확정치명 등 다수 스택으로 UI 도배되는 문제 해결)
  // speed_mod 는 +/-가 다른 의미라 부호로 분리해서 집계.
  const keyOf = (e: StatusEffect): string =>
    e.type === 'speed_mod' ? `speed_mod:${e.value >= 0 ? '+' : '-'}` : e.type;
  const byKey = new Map<string, StatusEffect[]>();
  for (const e of noSummon) {
    const k = keyOf(e);
    const arr = byKey.get(k) || [];
    arr.push(e);
    byKey.set(k, arr);
  }
  const filtered: (StatusEffect & { stackCount?: number })[] = [];
  for (const arr of byKey.values()) {
    if (arr.length === 1) {
      filtered.push(arr[0]);
    } else {
      const maxRem = Math.max(...arr.map(e => e.remainingActions));
      filtered.push({ ...arr[0], remainingActions: maxRem, stackCount: arr.length });
    }
  }

  const typeLabels: Record<string, string> = {
    dot: '도트', shield: '실드', stun: '기절',
    gauge_freeze: '동결', damage_reflect: '반사', damage_reduce: '피해감소',
    accuracy_debuff: '명중-', invincible: '무적', resurrect: '부활', poison: '독',
    atk_buff: '공격+', damage_taken_up: '약점',
    cc_immune: '제어면역', crit_guaranteed: '확정치명', def_buff: '방어+',
    summon_buff_active: '소환강화', summon_frenzy_active: '소환광폭',
  };

  const getLabel = (e: StatusEffect): string => {
    if (e.type === 'speed_mod') return e.value >= 0 ? '스피드+' : '스피드-';
    return typeLabels[e.type] || '효과';
  };

  const getColor = (e: StatusEffect): string => {
    if (e.type === 'stun' || e.type === 'gauge_freeze') return 'var(--danger)';
    if (e.type === 'shield' || e.type === 'invincible') return 'var(--success)';
    if (e.type === 'speed_mod' && e.value < 0) return 'var(--danger)';
    return 'var(--accent)';
  };

  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
      {filtered.map((e, i) => {
        const stackSuffix = e.stackCount && e.stackCount > 1 ? ` x${e.stackCount}` : '';
        return (
          <span key={i} style={{
            padding: '2px 6px', fontSize: 10, fontWeight: 700,
            background: 'var(--bg)', border: '1px solid var(--border)',
            color: getColor(e),
          }}>
            {getLabel(e)}{stackSuffix} {e.remainingActions > 0 && e.remainingActions < 999 ? `(${e.remainingActions})` : ''}
          </span>
        );
      })}
    </div>
  );
}

// 스킬별 이펙트 매핑 (아이콘 + 색상)
// 스킬명 → { 클래스, 레벨 } 매핑 (아이콘 경로 생성용)
const SKILL_CLASS_MAP: Record<string, { cls: string; lv: number }> = {
  '강타': { cls: 'warrior', lv: 1 }, '분노의 일격': { cls: 'warrior', lv: 5 }, '철벽': { cls: 'warrior', lv: 10 },
  '흡혈 참격': { cls: 'warrior', lv: 15 }, '반격의 의지': { cls: 'warrior', lv: 20 }, '무쌍난무': { cls: 'warrior', lv: 25 },
  '불굴': { cls: 'warrior', lv: 30 }, '대지 분쇄': { cls: 'warrior', lv: 35 }, '전쟁의 함성': { cls: 'warrior', lv: 40 },
  '참수': { cls: 'warrior', lv: 45 }, '최후의 일격': { cls: 'warrior', lv: 50 }, '전장의 포효': { cls: 'warrior', lv: 60 },
  '갑옷 분쇄': { cls: 'warrior', lv: 65 }, '지옥의 칼날': { cls: 'warrior', lv: 70 }, '대지의 심판': { cls: 'warrior', lv: 75 },
  '파멸의 일격': { cls: 'warrior', lv: 80 }, '절대 파괴': { cls: 'warrior', lv: 85 }, '전장의 광란': { cls: 'warrior', lv: 90 },
  '피의 향연': { cls: 'warrior', lv: 95 }, '대멸절': { cls: 'warrior', lv: 100 },
  '화염구': { cls: 'mage', lv: 1 }, '냉기 창': { cls: 'mage', lv: 5 }, '게이지 폭발': { cls: 'mage', lv: 10 },
  '번개 사슬': { cls: 'mage', lv: 15 }, '빙결 감옥': { cls: 'mage', lv: 20 }, '유성 낙하': { cls: 'mage', lv: 25 },
  '마력 과부하': { cls: 'mage', lv: 30 }, '연쇄 번개': { cls: 'mage', lv: 35 }, '절대 영도': { cls: 'mage', lv: 40 },
  '운석 폭격': { cls: 'mage', lv: 45 }, '차원 붕괴': { cls: 'mage', lv: 50 }, '마력 집중': { cls: 'mage', lv: 60 },
  '시간 왜곡': { cls: 'mage', lv: 65 }, '태양의 불꽃': { cls: 'mage', lv: 70 }, '별의 종말': { cls: 'mage', lv: 75 },
  '절대 영역': { cls: 'mage', lv: 80 }, '마나 폭주': { cls: 'mage', lv: 85 }, '시공 붕괴': { cls: 'mage', lv: 90 },
  '원소 대폭발': { cls: 'mage', lv: 95 }, '창세의 빛': { cls: 'mage', lv: 100 },
  '신성 타격': { cls: 'cleric', lv: 1 }, '신성 방벽': { cls: 'cleric', lv: 5 }, '심판의 철퇴': { cls: 'cleric', lv: 10 },
  '치유의 빛': { cls: 'cleric', lv: 15 }, '신성 화염': { cls: 'cleric', lv: 20 }, '신의 가호': { cls: 'cleric', lv: 25 },
  '천벌': { cls: 'cleric', lv: 30 }, '부활의 기적': { cls: 'cleric', lv: 35 }, '정화의 빛': { cls: 'cleric', lv: 40 },
  '신성 폭발': { cls: 'cleric', lv: 45 }, '천상의 방벽': { cls: 'cleric', lv: 50 }, '심판의 날': { cls: 'cleric', lv: 55 },
  '신의 축복': { cls: 'cleric', lv: 60 }, '신성 사슬': { cls: 'cleric', lv: 65 }, '신의 타격': { cls: 'cleric', lv: 70 },
  '천상의 낙인': { cls: 'cleric', lv: 75 },
  '대심판의 철퇴': { cls: 'cleric', lv: 80 }, '빛의 축복': { cls: 'cleric', lv: 85 }, '신성의 갑주': { cls: 'cleric', lv: 90 },
  '심판자의 권능': { cls: 'cleric', lv: 95 }, '천상 강림': { cls: 'cleric', lv: 100 },
  '급소 찌르기': { cls: 'rogue', lv: 1 }, '독 투척': { cls: 'rogue', lv: 5 }, '백스텝': { cls: 'rogue', lv: 10 },
  '연막탄': { cls: 'rogue', lv: 15 }, '맹독 강화': { cls: 'rogue', lv: 20 }, '그림자 연격': { cls: 'rogue', lv: 25 },
  '사신의 낫': { cls: 'rogue', lv: 30 }, '암살': { cls: 'rogue', lv: 35 }, '독안개': { cls: 'rogue', lv: 40 },
  '그림자 폭풍': { cls: 'rogue', lv: 45 }, '사신의 포옹': { cls: 'rogue', lv: 50 }, '그림자 은신': { cls: 'rogue', lv: 60 },
  '맹독의 안개': { cls: 'rogue', lv: 65 }, '심장 관통': { cls: 'rogue', lv: 70 }, '죽음의 무도': { cls: 'rogue', lv: 75 },
  '독의 축제': { cls: 'rogue', lv: 80 }, '기습': { cls: 'rogue', lv: 85 }, '천 개의 칼날': { cls: 'rogue', lv: 90 },
  '치명 절격': { cls: 'rogue', lv: 95 }, '암흑의 심판': { cls: 'rogue', lv: 100 },
  '늑대 소환': { cls: 'summoner', lv: 1 }, '골렘 소환': { cls: 'summoner', lv: 5 }, '모든 소환수 공격': { cls: 'summoner', lv: 10 },
  '독수리 소환': { cls: 'summoner', lv: 15 }, '영혼 유대': { cls: 'summoner', lv: 20 }, '불정령 소환': { cls: 'summoner', lv: 25 },
  '정령의 가호': { cls: 'summoner', lv: 30 }, '수호수 소환': { cls: 'summoner', lv: 35 }, '야수의 분노': { cls: 'summoner', lv: 40 },
  '드래곤 소환': { cls: 'summoner', lv: 45 }, '희생': { cls: 'summoner', lv: 50 }, '피닉스 소환': { cls: 'summoner', lv: 55 },
  '군주의 위엄': { cls: 'summoner', lv: 60 }, '하이드라 소환': { cls: 'summoner', lv: 65 }, '정령의 보호': { cls: 'summoner', lv: 70 },
  '고대 용 소환': { cls: 'summoner', lv: 75 },
  '얼음 여왕 소환': { cls: 'summoner', lv: 80 }, '뇌신 소환': { cls: 'summoner', lv: 85 },
  '대지 거신 소환': { cls: 'summoner', lv: 90 }, '천상의 수호자': { cls: 'summoner', lv: 95 },
  '시공의 지배자': { cls: 'summoner', lv: 100 },
};
// 특정 스킬 이름은 spells/ 픽셀 아트로 직접 매핑 (이름에 맞는 외형으로 오버라이드)
const SKILL_ICON_OVERRIDES: Record<string, string> = {
  '정령의 가호': '/images/skills/spells/might.png',
  '정령의 보호': '/images/skills/spells/tso_divine_shield.png',
};

export function getSkillIcon(name: string): string {
  if (SKILL_ICON_OVERRIDES[name]) return SKILL_ICON_OVERRIDES[name];
  const m = SKILL_CLASS_MAP[name];
  return m ? `/images/skills/${m.cls}_${m.lv}.png` : '';
}

const SKILL_COLORS: Record<string, { color: string; glow: string }> = {
  warrior: { color: '#e04040', glow: '#ff4444' },
  mage: { color: '#6688ff', glow: '#88aaff' },
  cleric: { color: '#ffcc44', glow: '#ffee66' },
  rogue: { color: '#aa66cc', glow: '#cc88ee' },
  summoner: { color: '#44cc88', glow: '#66eebb' },
};

const SKILL_EFFECTS: Record<string, { icon: string; color: string; glow: string }> = {};
for (const [name, { cls }] of Object.entries(SKILL_CLASS_MAP)) {
  const c = SKILL_COLORS[cls] || { color: 'var(--accent)', glow: 'var(--accent)' };
  SKILL_EFFECTS[name] = { icon: '', color: c.color, glow: c.glow };
}

// 스킬 설명 (툴팁용)
const SKILL_DESCRIPTIONS: Record<string, string> = {
  '강타': '적에게 강력한 일격',
  '분노의 일격': '분노를 담아 대미지 증폭',
  '철벽': '방어 태세로 피해 감소 실드 생성',
  '흡혈 참격': '적에게 피해를 입히고 HP 흡수',
  '반격의 의지': '데미지 반사 효과 부여',
  '무쌍난무': '연속 다중 타격',
  '불굴': '무적 + 부활 준비',
  '화염구': '화염 속성 마법 공격',
  '냉기 창': '냉기로 적 스피드 감소',
  '게이지 폭발': '게이지를 소모하여 대미지 폭발',
  '번개 사슬': '연쇄 번개로 다중 타격',
  '빙결 감옥': '적 게이지 동결',
  '유성 낙하': '초강력 마법 공격',
  '마력 과부하': '마법 공격력 대폭 증가',
  '신성 방벽': '아군에게 피해 흡수 실드',
  '심판의 철퇴': '신성 물리 공격',
  '치유의 빛': 'HP 회복',
  '신성 화염': '신성 속성 지속 피해',
  '신의 가호': '대미지 감소 버프',
  '천벌': '강력한 신성 공격',
  '부활의 기적': '사망 시 자동 부활 준비',
  '급소 찌르기': '높은 치명타 확률 공격',
  '독 투척': '독 지속 피해',
  '백스텝': '자신 게이지 즉시 500 충전 (연속행동)',
  '연막탄': '적 명중률 감소',
  '맹독 강화': '독 피해 강화 + 독 부여',
  '그림자 연격': '다중 타격 + 흡혈',
  '사신의 낫': '적 HP 비례 대미지 10%',
  // 추가 스킬 (Lv.35~55)
  '대지 분쇄': '2.5배 공격 + 적 스피드 30% 감소',
  '전쟁의 함성': '피해 감소 버프',
  '참수': '3.2배 + HP 8% 비례 피해',
  '최후의 일격': '4배 공격 + 50% 흡혈',
  '연쇄 번개': '2배 x 2연타 마법 공격',
  '절대 영도': '1.8배 + 적 게이지 동결',
  '운석 폭격': '3.5배 마법 + 고정100 + 도트',
  '차원 붕괴': '4.5배 마법 + 최대HP 10% 보호막',
  '신성 타격': '1.4배 신성 기본 공격',
  '정화의 빛': 'HP 35% 회복',
  '신성 폭발': '2.8배 신성 + 고정60 + 도트',
  '천상의 방벽': '피해 흡수 실드 40%',
  '심판의 날': '3.8배 실드 파괴 공격',
  '암살': '3배 + 크리 30% 보너스',
  '독안개': '적 명중률 40% 감소',
  '그림자 폭풍': '1.5배 x 5연타 + 독',
  '사신의 포옹': '3.8배 + HP 12% 비례 피해',
  // 신규 (Lv.60~75)
  '전장의 포효': '스피드 40% 증가 (3행동)',
  '갑옷 분쇄': '적 스피드 50% 감소 (3행동)',
  '지옥의 칼날': '4.5배 공격 + 60% 흡혈',
  '대지의 심판': '5배 공격 + HP 15% 비례 피해',
  '마력 집중': '스피드 50% 증가 (3행동)',
  '시간 왜곡': '적 게이지 동결 (3행동)',
  '태양의 불꽃': '4배 마법 + 강력 도트',
  '별의 종말': '5.5배 마법 (자기 스피드 -30%)',
  '신의 축복': '피해 40% 감소 (3행동)',
  '신성 사슬': '적 기절 (2행동)',
  '신의 타격': '본인 최대HP × 25 × 4연타 (크리 발동) — 천상 강림 쿨 -1행동',
  '천상의 낙인': '4.5배 + 반사 100% (3행동)',
  '그림자 은신': '게이지 즉시 충전',
  '맹독의 안개': '적 명중 50% 감소 + 독',
  '심장 관통': '3.5배 + 크리 40% 보너스',
  '죽음의 무도': '1.8배 x 6연타 + 독',
};

function SkillBar({ skills, waitingInput, autoMode, onUse, onReorder }: {
  skills: CombatSkillInfo[];
  waitingInput: boolean;
  autoMode: boolean;
  onUse: (id: number) => void;
  onReorder: (orderedIds: number[]) => void;
}) {
  const canUse = waitingInput && !autoMode;
  const [tooltip, setTooltip] = useState<CombatSkillInfo | null>(null);
  const [dragSkillId, setDragSkillId] = useState<number | null>(null);

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
        {skills.map((sk, idx) => {
          const onCooldown = sk.cooldownLeft > 0;
          const usable = canUse && sk.usable && !onCooldown;
          const isBasic = sk.cooldownMax === 0;
          const fx = SKILL_EFFECTS[sk.name] || { icon: '⚔', color: 'var(--accent)', glow: 'var(--accent)' };
          const moveSkill = (delta: number) => {
            const ids = skills.map(x => x.id);
            const newIdx = idx + delta;
            if (newIdx < 0 || newIdx >= ids.length) return;
            [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
            onReorder(ids);
          };

          return (
            <div
              key={sk.id}
              draggable
              onDragStart={() => setDragSkillId(sk.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragSkillId === null || dragSkillId === sk.id) { setDragSkillId(null); return; }
                const ids = skills.map(x => x.id);
                const from = ids.indexOf(dragSkillId);
                const to = ids.indexOf(sk.id);
                if (from < 0 || to < 0) { setDragSkillId(null); return; }
                ids.splice(to, 0, ids.splice(from, 1)[0]);
                setDragSkillId(null);
                onReorder(ids);
              }}
              onClick={() => {
                if (usable) {
                  onUse(sk.id);
                  setTooltip(null);
                } else {
                  setTooltip(tooltip?.id === sk.id ? null : sk);
                }
              }}
              style={{
                position: 'relative', minWidth: 100, padding: '10px 14px',
                background: usable
                  ? `linear-gradient(135deg, ${fx.color}cc, ${fx.color}88)`
                  : onCooldown ? 'var(--bg)' : `linear-gradient(135deg, var(--bg-panel), ${fx.color}22)`,
                color: usable ? '#fff' : 'var(--text-dim)',
                border: `1px solid ${dragSkillId === sk.id ? 'var(--accent)' : usable ? fx.color : onCooldown ? 'var(--border)' : `${fx.color}44`}`,
                borderRadius: 6,
                cursor: usable ? 'pointer' : 'grab',
                opacity: onCooldown ? 0.5 : canUse ? 1 : 0.7,
                transition: 'all 0.15s ease',
                animation: usable ? 'pulse 0.6s ease-in-out infinite alternate' : 'none',
                textAlign: 'center',
                boxShadow: usable ? `0 0 12px ${fx.glow}88, inset 0 0 8px ${fx.glow}44` : 'none',
              }}
            >
              {/* 슬롯 이동 버튼 (모바일/PC 공통) */}
              <button
                onClick={(e) => { e.stopPropagation(); moveSkill(-1); }}
                disabled={idx === 0}
                style={{
                  position: 'absolute', left: 2, top: '50%', transform: 'translateY(-50%)',
                  width: 18, height: 22, padding: 0, fontSize: 12, lineHeight: 1,
                  background: 'rgba(0,0,0,0.5)', color: idx === 0 ? '#666' : '#fff',
                  border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3,
                  cursor: idx === 0 ? 'not-allowed' : 'pointer', zIndex: 5,
                }}
                aria-label="왼쪽으로"
              >◀</button>
              <button
                onClick={(e) => { e.stopPropagation(); moveSkill(1); }}
                disabled={idx === skills.length - 1}
                style={{
                  position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)',
                  width: 18, height: 22, padding: 0, fontSize: 12, lineHeight: 1,
                  background: 'rgba(0,0,0,0.5)', color: idx === skills.length - 1 ? '#666' : '#fff',
                  border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3,
                  cursor: idx === skills.length - 1 ? 'not-allowed' : 'pointer', zIndex: 5,
                }}
                aria-label="오른쪽으로"
              >▶</button>
              <div style={{ lineHeight: 1, marginBottom: 4, display: 'flex', justifyContent: 'center' }}>
                {getSkillIcon(sk.name) ? (
                  <img src={getSkillIcon(sk.name)} alt="" width={32} height={32}
                    style={{ imageRendering: 'pixelated' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : <span style={{ fontSize: 18 }}>⚔</span>}
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

              {/* 스킬 툴팁 */}
              {tooltip?.id === sk.id && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--bg-panel)', border: '1px solid var(--accent)',
                    padding: '8px 12px', borderRadius: 6, minWidth: 180, zIndex: 100,
                    textAlign: 'left', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  }}
                >
                  <div style={{ fontWeight: 700, color: fx.color, marginBottom: 4, fontSize: 13 }}>
                    {fx.icon} {sk.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
                    {sk.description || SKILL_DESCRIPTIONS[sk.name] || '스킬 효과'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {isBasic ? '기본기 (쿨다운 없음)' : `쿨다운: ${sk.cooldownMax}턴`}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 딜미터기 ──
// 로그 길이 + 마지막 라인 동일하면 내용 변화 없음으로 간주하여 리렌더 스킵
const logEqual = (prev: { log: string[] }, next: { log: string[] }) =>
  prev.log.length === next.log.length &&
  prev.log[prev.log.length - 1] === next.log[next.log.length - 1];

export const CombatLog = memo(function CombatLog({ log }: { log: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const pauseAutoScroll = useCallback(() => {
    setAutoScroll(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setAutoScroll(true), 5000);
  }, []);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [log.length, autoScroll]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div style={{ position: 'relative', marginBottom: 12 }}>
      <div ref={containerRef}
        onWheel={pauseAutoScroll}
        onTouchStart={pauseAutoScroll}
        onMouseDown={pauseAutoScroll}
        style={{
          padding: 10, background: 'var(--bg-panel)', border: '1px solid var(--border)',
          height: 200, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12,
          display: 'flex', flexDirection: 'column-reverse',
        }}>
        {[...log].slice(-15).reverse().map((line, i) => {
          const isCrit = line.includes('치명타') || /\d+!/.test(line);
          const isDot = line.includes('[도트]');
          const isHeal = line.includes('HP +') || line.includes('회복') || line.includes('흡혈');
          const isPlayerHit = line.includes('데미지를 받았다') || line.includes('피해');
          const isMiss = line.includes('빗나감');
          const isBuff = line.includes('무적') || line.includes('실드') || line.includes('스턴') || line.includes('동결') || line.includes('부활') || line.includes('게이지');
          const isKill = line.includes('처치') || line.includes('나타났다');
          const isDeath = line.includes('사망');
          const color = isDeath ? '#ff2222' : isCrit ? '#ff6644' : isDot ? '#bb88ff' : isHeal ? '#66dd66' : isPlayerHit ? '#ff8888' : isMiss ? '#666' : isBuff ? '#66ccff' : isKill ? '#ffd700' : 'var(--text-dim)';
          const weight = isCrit || isKill || isDeath ? 700 : 400;
          return (
            <div key={i} style={{ color, fontWeight: weight, marginBottom: 3, lineHeight: 1.5, fontSize: isCrit ? 13 : 12 }}>{line}</div>
          );
        })}
      </div>
      {!autoScroll && (
        <button onClick={() => setAutoScroll(true)} style={{
          position: 'absolute', bottom: 8, right: 12, fontSize: 10, padding: '3px 8px',
          background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 3,
          cursor: 'pointer', fontWeight: 700, opacity: 0.9,
        }}>▼ 최신 로그</button>
      )}
    </div>
  );
}, logEqual);

const DamageMeter = memo(function DamageMeter({ log }: { log: string[] }) {
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState(60);
  const resetTimeRef = useRef(Date.now());
  const lastSeenLineRef = useRef<string>(''); // 마지막으로 본 로그 라인
  const accRef = useRef<Map<string, { total: number; hits: number; crits: number; max: number }>>(new Map());
  const dotAccRef = useRef({ total: 0, hits: 0 });
  const totalDmgRef = useRef(0);
  const [, forceUpdate] = useState(0);

  // 1분 타이머
  useEffect(() => {
    const iv = setInterval(() => {
      const elapsed = Math.floor((Date.now() - resetTimeRef.current) / 1000);
      const left = Math.max(0, 60 - elapsed);
      setRemaining(left);
      if (left <= 0) {
        accRef.current = new Map();
        dotAccRef.current = { total: 0, hits: 0 };
        totalDmgRef.current = 0;
        resetTimeRef.current = Date.now();
        lastSeenLineRef.current = log[log.length - 1] || '';
        setRemaining(60);
        forceUpdate(n => n + 1);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [log.length]);

  // 새 로그만 파싱해서 누적
  // log가 MAX_LOG로 자라면 길이가 변하지 않으므로 길이 비교 X.
  // 마지막으로 본 라인의 내용을 저장하고 그 이후 라인만 새 것으로 처리.
  useEffect(() => {
    if (log.length === 0) return;
    let startIdx = 0;
    if (lastSeenLineRef.current) {
      // 마지막으로 본 라인의 인덱스를 끝에서부터 검색
      for (let i = log.length - 1; i >= 0; i--) {
        if (log[i] === lastSeenLineRef.current) {
          startIdx = i + 1;
          break;
        }
      }
      // 못 찾으면 전부 새 것으로 간주 (로그 사이클되었거나 새 세션)
      // startIdx = 0 그대로
    }
    if (startIdx >= log.length) {
      // 새 라인 없음
      return;
    }
    const newLines = log.slice(startIdx);
    lastSeenLineRef.current = log[log.length - 1];

    // 매칭 우선순위:
    //  1) 도트 틱:      "[도트] 몬스터에게 N"
    //  2) 멀티히트 타: "[스킬] Ni타 N!"
    //  3) 2회 발동:    "[스킬] 2회 발동! N"
    //  4) 데미지 라인: "[스킬] ... N 데미지(!)" — 독 폭발/실드 파괴/체력 비례 등 서두 포함
    //  5) 추가 타격:    "추가 타격! N"
    const multiHitRe = /\[([^\]]+?)\]\s+\d+타\s+(\d+)(!?)/;
    const doubleRe = /\[([^\]]+?)\]\s+2회 발동!\s+(\d+)(!?)/;
    const damageRe = /\[([^\]]+?)\][^\[\n]*?(\d+)\s*데미지(!?)/;
    for (const line of newLines) {
      const dotMatch = line.match(/\[도트\]\s+몬스터에게\s+(\d+)/);
      if (dotMatch) {
        const dmg = parseInt(dotMatch[1]);
        dotAccRef.current.total += dmg;
        dotAccRef.current.hits++;
        totalDmgRef.current += dmg;
        continue;
      }
      const skillMatch = multiHitRe.exec(line) || doubleRe.exec(line) || damageRe.exec(line);
      if (skillMatch && skillMatch[1] !== '도트') {
        const name = skillMatch[1];
        const dmg = parseInt(skillMatch[2]);
        const crit = !!skillMatch[3];
        if (!accRef.current.has(name)) accRef.current.set(name, { total: 0, hits: 0, crits: 0, max: 0 });
        const s = accRef.current.get(name)!;
        s.total += dmg; s.hits++; if (crit) s.crits++; if (dmg > s.max) s.max = dmg;
        totalDmgRef.current += dmg;
      }
      const extraMatch = line.match(/추가 타격!\s+(\d+)/);
      if (extraMatch) {
        const dmg = parseInt(extraMatch[1]);
        if (!accRef.current.has('추가 타격')) accRef.current.set('추가 타격', { total: 0, hits: 0, crits: 0, max: 0 });
        const s = accRef.current.get('추가 타격')!;
        s.total += dmg; s.hits++;
        totalDmgRef.current += dmg;
      }
    }
    forceUpdate(n => n + 1);
  }, [log]);

  // 렌더용 데이터 구성
  const map = new Map(accRef.current);
  if (dotAccRef.current.total > 0) {
    map.set('도트 (합산)', { total: dotAccRef.current.total, hits: dotAccRef.current.hits, crits: 0, max: 0 });
  }
  const sorted = [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  const totalDmg = totalDmgRef.current;
  const elapsedSec = Math.max(1, Math.floor((Date.now() - resetTimeRef.current) / 1000));
  const dps = Math.round(totalDmg / elapsedSec);

  if (sorted.length === 0) return null;

  return (
    <div style={{ marginTop: 8, border: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '6px 12px', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
          DPS {dps.toLocaleString()}/s — 총 {totalDmg.toLocaleString()}
        </span>
        <span style={{ fontSize: 10, color: remaining <= 10 ? 'var(--danger)' : 'var(--text-dim)' }}>
          {remaining}초 {open ? '▲' : '▼'}
        </span>
      </div>
      {open && (
        <div style={{ padding: '0 12px 10px' }}>
          {sorted.map(([name, s]) => {
            const pct = totalDmg > 0 ? (s.total / totalDmg * 100) : 0;
            const avg = s.hits > 0 ? Math.round(s.total / s.hits) : 0;
            const critRate = s.hits > 0 ? Math.round(s.crits / s.hits * 100) : 0;
            const barColor = name === '도트 (합산)' ? '#66cc66' : critRate > 30 ? '#ff6644' : '#daa520';
            return (
              <div key={name} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{name}</span>
                  <span style={{ color: 'var(--text-dim)' }}>
                    {s.total.toLocaleString()} ({pct.toFixed(1)}%)
                  </span>
                </div>
                <div style={{ height: 14, background: 'var(--bg)', border: '1px solid var(--border)', overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`, background: barColor,
                    transition: 'width 0.3s', opacity: 0.7,
                  }} />
                  <div style={{
                    position: 'absolute', top: 0, right: 4, lineHeight: '14px',
                    fontSize: 9, color: 'var(--text-dim)',
                  }}>
                    {s.hits}회 · 평균 {avg.toLocaleString()}{s.max > 0 ? ` · 최대 ${s.max.toLocaleString()}` : ''}{critRate > 0 ? ` · 크리 ${critRate}%` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}, logEqual);
