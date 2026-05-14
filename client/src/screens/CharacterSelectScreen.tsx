import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { useMeStore } from '../stores/meStore';
import { ClassIcon } from '../components/ui/ClassIcon';
import type { ClassName } from '../types';

interface DailySummary {
  characterId: number;
  questsCompleted: number;
  questsTotal: number;
  questRewardClaimed: boolean;
  gbKeysUsed: number;
  passShopBought: boolean;
  unreadMail: number;
  riftActive: boolean;
}
interface DailySummaryResponse {
  eventActive: boolean;
  eventName: string | null;
  characters: DailySummary[];
}

type DotColor = 'green' | 'yellow' | 'red';
const DOT_HEX: Record<DotColor, string> = {
  green: '#3ddc84',
  yellow: '#daa520',
  red: '#ff5050',
};

function questDotColor(s: DailySummary): DotColor {
  if (s.questsTotal === 0) return 'red';
  if (s.questRewardClaimed) return 'green';
  if (s.questsCompleted >= s.questsTotal) return 'yellow'; // 완료했지만 보상 미수령
  if (s.questsCompleted > 0) return 'yellow';
  return 'red';
}
function gbDotColor(s: DailySummary): DotColor {
  if (s.gbKeysUsed >= 2) return 'green';
  if (s.gbKeysUsed > 0) return 'yellow';
  return 'red';
}
function passDotColor(s: DailySummary): DotColor {
  return s.passShopBought ? 'green' : 'red';
}
function mailDotColor(s: DailySummary): DotColor {
  if (s.unreadMail > 0) return 'yellow';
  return 'green';
}
function riftDotColor(s: DailySummary): DotColor {
  return s.riftActive ? 'green' : 'red';
}

function Dot({ color, label }: { color: DotColor; label: string }) {
  return (
    <span title={label} style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: DOT_HEX[color],
      boxShadow: `0 0 4px ${DOT_HEX[color]}`,
    }} />
  );
}

interface ClassEntry { name: ClassName; label: string; desc: string; adminOnly?: boolean }
const ALL_CLASSES: ClassEntry[] = [
  { name: 'warrior', label: '전사', desc: '압도적 물리, 흡혈 지속전투' },
  { name: 'mage', label: '마법사', desc: '원소 파괴 + 게이지 조작 제어' },
  { name: 'cleric', label: '성직자', desc: '보조/공격 양면, 신성 실드와 심판' },
  { name: 'rogue', label: '도적', desc: '스피드와 제어, 독 스택 연속행동' },
  { name: 'summoner', label: '소환사', desc: '소환수 1체를 신수·정령·괴수·마도로 변환·강화' },
  { name: 'archer' as ClassName, label: '궁수', desc: '카이팅 저격수 — 처치 누적으로 사거리 강화', adminOnly: true },
];

// 궁수 일반 공개 시각 — KST 2026-05-10 09:00. 이전엔 어드민만, 이후 자동 공개.
const ARCHER_PUBLIC_KST_MS = new Date('2026-05-10T09:00:00+09:00').getTime();

export function CharacterSelectScreen() {
  const nav = useNavigate();
  const { characters, fetchCharacters, selectCharacter, createCharacter, deleteCharacter } = useCharacterStore();
  const isAdmin = useMeStore(s => s.me?.isAdmin ?? false);
  // 직업 가시성 — 어드민 전용 직업은 비어드민에게 hide. 궁수는 공개 시각 이후 자동 노출.
  const archerVisible = isAdmin || Date.now() >= ARCHER_PUBLIC_KST_MS;
  const CLASSES = ALL_CLASSES.filter(c => {
    if (c.name === 'archer') return archerVisible;
    return !c.adminOnly || isAdmin;
  });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [pickedClass, setPickedClass] = useState<ClassName>('warrior');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dailyMap, setDailyMap] = useState<Record<number, DailySummary>>({});
  const [eventActive, setEventActive] = useState(false);
  const [eventName, setEventName] = useState<string | null>(null);

  async function handleDelete(id: number, charName: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    if (!confirm(`정말로 "${charName}" 캐릭터를 삭제하시겠습니까?\n\n레벨, 아이템, 골드, 진행도 등 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.`)) return;
    const typed = prompt(`삭제를 확인하려면 캐릭터 이름을 정확히 입력하세요:\n\n"${charName}"`);
    if (typed !== charName) { alert('이름이 일치하지 않아 삭제가 취소되었습니다.'); return; }
    setBusy(true);
    try {
      await deleteCharacter(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    fetchCharacters().catch(() => {});
  }, [fetchCharacters]);

  // 일일 요약 batch 로드 — 캐릭 카드 dot 표시용
  useEffect(() => {
    api<DailySummaryResponse>('/characters/daily-summary')
      .then(resp => {
        const m: Record<number, DailySummary> = {};
        for (const r of resp.characters) m[r.characterId] = r;
        setDailyMap(m);
        setEventActive(resp.eventActive);
        setEventName(resp.eventName);
      })
      .catch(() => {});
  }, [characters.length]);

  async function handleCreate() {
    setError('');
    if (!/^[가-힣A-Za-z0-9]{2,12}$/.test(name)) {
      setError('닉네임은 공백·특수문자 없이 한글/영문/숫자 2~12자만 가능합니다.');
      return;
    }
    try {
      const c = await createCharacter(name, pickedClass);
      await selectCharacter(c.id);
      nav('/village');
    } catch (e) {
      setError(e instanceof Error ? e.message : '생성 실패');
    }
  }

  async function handleSelect(id: number) {
    await selectCharacter(id);
    nav('/village');
  }

  if (creating || characters.length === 0) {
    return (
      <div>
        <h2 style={{ marginBottom: 20 }}>캐릭터 생성</h2>
        <input
          placeholder="캐릭터 이름 (한글/영문/숫자 2~12자, 공백·특수문자 불가)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={12}
          style={{ width: '100%', marginBottom: 20 }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
          {CLASSES.map((c) => (
            <div
              key={c.name}
              onClick={() => setPickedClass(c.name)}
              style={{
                padding: 14,
                background: pickedClass === c.name ? 'var(--bg-elev)' : 'var(--bg-panel)',
                border: `1px solid ${pickedClass === c.name ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ClassIcon className={c.name} size={20} />
                {c.label}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{c.desc}</div>
            </div>
          ))}
        </div>
        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="primary" onClick={handleCreate} disabled={name.length < 2}>
            생성
          </button>
          {characters.length > 0 && <button onClick={() => setCreating(false)}>취소</button>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: 20 }}>캐릭터 선택</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {characters.map((c) => (
          <div
            key={c.id}
            onClick={() => handleSelect(c.id)}
            style={{
              padding: 14,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <ClassIcon className={c.className as ClassName} size={28} />
              <div>
                <div style={{ fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {c.name}
                  {c.lastOfflineAt && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        background: 'rgba(136, 200, 255, 0.15)',
                        color: '#88c8ff',
                        border: '1px solid #88c8ff',
                        borderRadius: 3,
                        letterSpacing: 0.5,
                      }}
                    >
                      오프라인 사냥중
                    </span>
                  )}
                </div>
                <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                  Lv.{c.level} {c.className}
                  {c.lastOfflineAt && (
                    <span style={{ marginLeft: 8, color: '#88c8ff' }}>
                      · 진입 시 정산
                    </span>
                  )}
                </div>
                {dailyMap[c.id] && (() => {
                  const s = dailyMap[c.id];
                  const qc = questDotColor(s);
                  const gc = gbDotColor(s);
                  const pc = passDotColor(s);
                  const mc = mailDotColor(s);
                  const rc = riftDotColor(s);
                  return (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, fontSize: 10, color: 'var(--text-dim)', flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Dot color={qc} label={`일일임무 ${s.questsCompleted}/${s.questsTotal}${s.questRewardClaimed ? ' · 보상수령' : ''}`} />
                        <span>일일임무 {s.questsCompleted}/{s.questsTotal}{s.questRewardClaimed ? '✓' : ''}</span>
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Dot color={gc} label={`길드보스 키 ${s.gbKeysUsed}/2 사용`} />
                        <span>길보 {s.gbKeysUsed}/2</span>
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Dot color={pc} label={s.passShopBought ? '통행증 구매 완료' : '통행증 미구매'} />
                        <span>통행증 {s.passShopBought ? '✓' : '×'}</span>
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Dot color={mc} label={s.unreadMail > 0 ? `미수령 우편 ${s.unreadMail}개` : '우편 없음'} />
                        <span>우편 {s.unreadMail > 0 ? s.unreadMail : '0'}</span>
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Dot color={rc} label={s.riftActive ? '시공 균열 타이머 활성' : '시공 균열 미입장'} />
                        <span>시공 {s.riftActive ? '○' : '×'}</span>
                      </span>
                      {eventActive && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Dot color="green" label={eventName ?? '이벤트 진행 중'} />
                          <span style={{ color: '#daa520' }}>이벤트</span>
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
              {c.gold}G
            </div>
            <button
              onClick={(e) => handleDelete(c.id, c.name, e)}
              disabled={busy}
              style={{
                padding: '5px 10px', fontSize: 11, fontWeight: 700,
                background: 'transparent', color: 'var(--danger)',
                border: '1px solid var(--danger)', cursor: 'pointer', borderRadius: 3,
              }}
            >삭제</button>
          </div>
        ))}
      </div>
      <button style={{ marginTop: 20 }} onClick={() => setCreating(true)}>
        새 캐릭터 만들기
      </button>
    </div>
  );
}
