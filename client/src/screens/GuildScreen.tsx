import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

interface GuildSummary {
  id: number; name: string; description: string;
  memberCount: number; leaderName: string; maxMembers: number; statBuffPct: number;
  level: number; exp: number;
  levelSum: number;
  skills: { gold: number; exp: number; drop: number; hp: number };
}
interface GuildMember { id: number; name: string; level: number; className: string; role: string; lastOnlineAt?: string | null; goldDonated?: number; todayDonation?: number }
interface GuildSkill {
  key: string; label: string;
  level: number; max: number;
  pctPerLevel: number; currentPct: number;
  nextCost: number; nextReqLevel: number;
}
interface MyGuild {
  id: number; name: string; description: string; isLeader: boolean; role: string;
  maxMembers: number; statBuffPct: number; members: GuildMember[];
  level: number; exp: number; expToNext: number; maxLevel: number;
  treasury: number;
  skills: GuildSkill[];
  myDonationToday: number;
  dailyDonationCap: number;
}
interface TerritoryInfo {
  fieldId: number; fieldName: string; requiredLevel: number;
  ownerGuildId: number | null; ownerGuildName: string | null;
  weekTopGuildName: string | null; weekTopScore: number;
}

const CLASS_LABEL: Record<string, string> = {
  warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적', summoner: '소환사',
};
const CLASS_COLOR: Record<string, string> = {
  warrior: '#e04040', mage: '#4080e0', cleric: '#daa520', rogue: '#a060c0',
};

const SKILL_ICON: Record<string, string> = {
  hp: '/images/items/potion/ruby.png',
  gold: '/images/items/amulet/golden.png',
  exp: '/images/items/potion/brilliant_blue.png',
  drop: '/images/items/ring/diamond.png',
};
const SKILL_COLOR: Record<string, string> = {
  hp: '#e07070', gold: '#e0a040', exp: '#8b8bef', drop: '#66dd66',
};

// 픽셀 아이콘 헬퍼
function PxIcon({ src, size = 18 }: { src: string; size?: number }) {
  return <img src={src} alt="" width={size} height={size}
    style={{ imageRendering: 'pixelated', verticalAlign: 'middle', flexShrink: 0 }} />;
}

const ICON = {
  guild: '/images/items/weapon/double_sword.png',
  leader: '/images/items/amulet/golden.png',
  members: '/images/items/helm/helmet1.png',
  treasury: '/images/items/ring/gold.png',
  level: '/images/items/misc/scroll.png',
  overview: '/images/items/misc/scroll.png',
  skills: '/images/skills/spells/orb_of_electricity.png',
  territory: '/images/skills/spells/shields.png',
  flag: '/images/skills/spells/shields.png',
};

type Tab = 'overview' | 'skills' | 'territory' | 'members' | 'applications';

interface GuildApplication { id: number; characterId: number; name: string; level: number; className: string; appliedAt: string }

export function GuildScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refresh = useCharacterStore((s) => s.refreshActive);
  const [my, setMy] = useState<MyGuild | null>(null);
  const [guilds, setGuilds] = useState<GuildSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [err, setErr] = useState('');
  const [donateAmt, setDonateAmt] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [territories, setTerritories] = useState<TerritoryInfo[]>([]);
  const [myScores, setMyScores] = useState<Record<number, { score: number; rank: number }>>({});
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [applications, setApplications] = useState<GuildApplication[]>([]);
  // 'list' = 길드 랭킹 목록, 'my' = 내 길드 상세. 길드 가입자도 랭킹 볼 수 있도록 토글 지원
  const [view, setView] = useState<'list' | 'my'>('my');

  async function load() {
    if (!active) return;
    const res = await api<{ guild: MyGuild | null }>(`/guilds/my/${active.id}`);
    setMy(res.guild);
    // 랭킹 목록은 항상 로드 — 길드원도 다른 길드 확인 가능
    const list = await api<GuildSummary[]>('/guilds');
    setGuilds(list);
    // 길드 미가입이면 자동으로 랭킹 뷰
    if (!res.guild) setView('list');
  }
  useEffect(() => { load(); }, [active?.id]);

  async function create() {
    if (!active) return;
    setErr('');
    try {
      await api('/guilds', {
        method: 'POST',
        body: JSON.stringify({ characterId: active.id, name, description: desc }),
      });
      setCreating(false); setName(''); setDesc('');
      await refresh(); await load();
    } catch (e) { setErr(e instanceof Error ? e.message : '실패'); }
  }
  async function apply(id: number) {
    if (!active) return;
    try {
      const r = await api<{ message?: string }>(`/guilds/${id}/apply`, { method: 'POST', body: JSON.stringify({ characterId: active.id }) });
      alert(r.message || '가입 신청이 접수되었습니다');
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }
  async function loadApplications() {
    if (!active || !my || !my.isLeader) return;
    try {
      const r = await api<{ applications: any[] }>(`/guilds/${my.id}/applications?characterId=${active.id}`);
      setApplications(r.applications.map((a: any) => ({
        id: a.id, characterId: a.character_id, name: a.name,
        level: a.level, className: a.class_name, appliedAt: a.applied_at,
      })));
    } catch { /* silent */ }
  }
  async function approveApp(appId: number) {
    if (!active) return;
    try {
      await api(`/guilds/applications/${appId}/approve`, { method: 'POST', body: JSON.stringify({ characterId: active.id }) });
      await loadApplications(); await load();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }
  async function rejectApp(appId: number) {
    if (!active) return;
    try {
      await api(`/guilds/applications/${appId}/reject`, { method: 'POST', body: JSON.stringify({ characterId: active.id }) });
      await loadApplications();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }
  async function kickMember(targetId: number, name: string) {
    if (!active) return;
    if (!confirm(`${name}님을 정말 추방하시겠습니까?`)) return;
    try {
      await api('/guilds/kick', { method: 'POST', body: JSON.stringify({
        leaderCharacterId: active.id, targetCharacterId: targetId,
      })});
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }
  async function leave() {
    if (!active) return;
    if (!confirm('정말 탈퇴하시겠습니까?')) return;
    try {
      await api(`/guilds/leave/${active.id}`, { method: 'POST' });
      load();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }
  async function disband() {
    if (!active) return;
    if (!confirm('정말 길드를 해산하시겠습니까?')) return;
    await api(`/guilds/disband/${active.id}`, { method: 'POST' });
    load();
  }
  async function donate() {
    if (!active || busy) return;
    const amt = Number(donateAmt);
    if (!amt || amt <= 0) return;
    setBusy(true);
    try {
      await api('/guilds/donate', { method: 'POST', body: JSON.stringify({ characterId: active.id, amount: amt }) });
      setDonateAmt('');
      await refresh(); await load();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); } finally { setBusy(false); }
  }
  async function upgradeSkill(skillKey: string) {
    if (!active || busy) return;
    setBusy(true);
    try {
      await api('/guilds/skill/upgrade', { method: 'POST', body: JSON.stringify({ characterId: active.id, skillKey }) });
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); } finally { setBusy(false); }
  }
  async function saveDescription() {
    if (!active || busy) return;
    setBusy(true);
    try {
      await api('/guilds/description', { method: 'POST', body: JSON.stringify({ characterId: active.id, description: descDraft }) });
      setEditingDesc(false);
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); } finally { setBusy(false); }
  }

  async function loadTerritories() {
    if (!active) return;
    try {
      const t = await api<{ fields: TerritoryInfo[] }>('/guilds/territories');
      setTerritories(t.fields);
      const mine = await api<{ scores: { fieldId: number; score: number; rank: number }[] }>(`/guilds/territories/my/${active.id}`);
      const m: Record<number, { score: number; rank: number }> = {};
      for (const s of mine.scores) m[s.fieldId] = { score: s.score, rank: s.rank };
      setMyScores(m);
    } catch (e) { /* silent */ }
  }
  useEffect(() => { if (tab === 'territory') loadTerritories(); }, [tab, active?.id]);
  useEffect(() => { if (tab === 'applications') loadApplications(); }, [tab, active?.id, my?.id]);

  // ── 길드 랭킹 목록 뷰 (가입자 / 미가입자 공통) ──
  if (!my || view === 'list') {
    return (
      <div>
        <div style={{
          padding: 20, marginBottom: 16, borderRadius: 6,
          background: 'linear-gradient(135deg, rgba(218,165,32,0.12), rgba(218,165,32,0.04))',
          border: '1px solid var(--accent)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ color: 'var(--accent)', margin: 0, fontSize: 22, display: 'flex', alignItems: 'center', gap: 8 }}>
                <PxIcon src={ICON.guild} size={28} /> 길드
              </h2>
              <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>
                길드에 가입해 동료들과 함께 강해지세요. 길드 스킬과 일일 기여로 큰 보너스를 얻습니다.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {my && (
                <button className="primary" onClick={() => setView('my')}>
                  내 길드 가기 ({my.name})
                </button>
              )}
              {!my && (
                <button className="primary" onClick={() => setCreating(!creating)}>
                  {creating ? '취소' : '길드 생성 (100,000G)'}
                </button>
              )}
            </div>
          </div>
        </div>

        {creating && (
          <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--accent)', marginBottom: 12, borderRadius: 4 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input placeholder="길드명 (2~20자)" value={name} onChange={e => setName(e.target.value)} maxLength={20} />
              <input placeholder="소개 (선택)" value={desc} onChange={e => setDesc(e.target.value)} maxLength={200} />
              {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>}
              <button className="primary" onClick={create} disabled={name.length < 2}>생성</button>
            </div>
          </div>
        )}

        <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 700, marginBottom: 8 }}>길드 랭킹 (멤버 레벨 합 기준)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {guilds.length === 0 && <div style={{ color: 'var(--text-dim)', padding: 20, textAlign: 'center' }}>아직 길드가 없습니다.</div>}
          {guilds.map((g, idx) => {
            const full = g.memberCount >= g.maxMembers;
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
            return (
              <div key={g.id} style={{
                padding: 14, background: 'var(--bg-panel)',
                border: '1px solid var(--border)', borderLeft: '3px solid var(--accent)',
                borderRadius: 4,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 700, minWidth: 24 }}>{medal}</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 15 }}>{g.name}</span>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 3,
                      background: 'rgba(218,165,32,0.18)', color: 'var(--accent)', fontWeight: 700,
                    }}>길드 Lv.{g.level}</span>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 3,
                      background: full ? 'rgba(192,90,74,0.15)' : 'rgba(107,163,104,0.15)',
                      color: full ? 'var(--danger)' : 'var(--success)', fontWeight: 700,
                    }}>{g.memberCount}/{g.maxMembers}</span>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 3,
                      background: 'rgba(100,150,200,0.15)', color: '#8ad', fontWeight: 700,
                    }}>레벨합 {g.levelSum.toLocaleString()}</span>
                  </div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <PxIcon src={ICON.leader} size={14} /> {g.leaderName}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, fontSize: 10, color: 'var(--text-dim)' }}>
                    <span>골드 Lv.{g.skills.gold}</span>
                    <span>·</span>
                    <span>경험치 Lv.{g.skills.exp}</span>
                    <span>·</span>
                    <span>드랍 Lv.{g.skills.drop}</span>
                    <span>·</span>
                    <span>HP Lv.{g.skills.hp}</span>
                  </div>
                  {g.description && <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>{g.description}</div>}
                </div>
                {my ? (
                  my.id === g.id ? (
                    <button className="primary" onClick={() => setView('my')}>내 길드</button>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</span>
                  )
                ) : (
                  <button onClick={() => apply(g.id)} disabled={full}>가입 신청</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── 내 길드 화면 ──
  const expPct = my.expToNext > 0 ? Math.min(100, Math.floor((my.exp / my.expToNext) * 100)) : 100;
  const remainingDonation = Math.max(0, my.dailyDonationCap - my.myDonationToday);
  const donationPct = Math.floor((my.myDonationToday / my.dailyDonationCap) * 100);

  return (
    <div>
      {/* ── HERO ── */}
      <div style={{
        padding: 20, marginBottom: 14, borderRadius: 6,
        background: 'linear-gradient(135deg, rgba(218,165,32,0.18), rgba(218,165,32,0.05))',
        border: '1px solid var(--accent)',
        boxShadow: '0 0 20px rgba(218,165,32,0.1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <PxIcon src={ICON.guild} size={32} />
              <h2 style={{ color: 'var(--accent)', margin: 0, fontSize: 24, fontWeight: 800 }}>{my.name}</h2>
              <span style={{
                fontSize: 12, fontWeight: 700, color: '#000',
                background: 'var(--accent)', padding: '3px 9px', borderRadius: 3,
              }}>Lv.{my.level}</span>
              {my.isLeader && (
                <span style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 3,
                  background: 'rgba(218,165,32,0.2)', border: '1px solid var(--accent)',
                  color: 'var(--accent)', fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                }}><PxIcon src={ICON.leader} size={12} /> 길드장</span>
              )}
            </div>
            {!editingDesc ? (
              <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 6, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 6 }}>
                {my.description ? `"${my.description}"` : <span style={{ opacity: 0.5 }}>(소개글 없음)</span>}
                {my.isLeader && (
                  <button
                    onClick={() => { setDescDraft(my.description || ''); setEditingDesc(true); }}
                    style={{ fontSize: 10, padding: '2px 8px', background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 3, cursor: 'pointer' }}
                  >수정</button>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                <input
                  value={descDraft}
                  onChange={e => setDescDraft(e.target.value)}
                  maxLength={200}
                  placeholder="길드 소개글 (최대 200자)"
                  style={{ flex: 1, fontSize: 12 }}
                />
                <button onClick={saveDescription} disabled={busy} className="primary" style={{ fontSize: 11 }}>저장</button>
                <button onClick={() => setEditingDesc(false)} style={{ fontSize: 11 }}>취소</button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setView('list')} style={{ fontSize: 11 }}>길드 랭킹</button>
            {my.isLeader && <button onClick={disband} style={{ fontSize: 11 }}>해산</button>}
            {!my.isLeader && <button onClick={leave} style={{ fontSize: 11 }}>탈퇴</button>}
          </div>
        </div>

        {/* 핵심 지표 3개 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
          <Stat iconSrc={ICON.members} label="멤버" value={`${my.members.length}/${my.maxMembers}`} />
          <Stat iconSrc={ICON.treasury} label="자금" value={`${my.treasury.toLocaleString()}G`} accent />
          <Stat iconSrc={ICON.level} label="레벨" value={`${my.level}/${my.maxLevel}`} />
        </div>

        {/* EXP 바 */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>
            <span>길드 경험치</span>
            <span>
              {my.level >= my.maxLevel
                ? <span style={{ color: 'var(--accent)' }}>최대 레벨</span>
                : <>{my.exp.toLocaleString()} / {my.expToNext.toLocaleString()} ({expPct}%)</>}
            </span>
          </div>
          <div style={{ height: 10, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${expPct}%`, height: '100%',
              background: 'linear-gradient(90deg, var(--accent), #ffd66b)',
              boxShadow: '0 0 6px rgba(218,165,32,0.5)',
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      </div>

      {/* ── 탭 ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border)' }}>
        {(([
          ['overview', '개요', ICON.overview],
          ['skills', '스킬', ICON.skills],
          // ['territory', '영토', ICON.territory], // 영토 점령전 일시 비활성
          ['members', '멤버', ICON.members],
          ...(my.isLeader ? [['applications', '가입신청', ICON.members] as [Tab, string, string]] : []),
        ]) as [Tab, string, string][]).map(([k, label, icon]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '8px 14px', fontSize: 12, fontWeight: 700,
            background: tab === k ? 'var(--bg-panel)' : 'transparent',
            color: tab === k ? 'var(--accent)' : 'var(--text-dim)',
            border: 'none',
            borderBottom: tab === k ? '2px solid var(--accent)' : '2px solid transparent',
            cursor: 'pointer', borderRadius: '4px 4px 0 0',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}><PxIcon src={icon} size={16} /> {label}</button>
        ))}
      </div>

      {/* ── 탭 내용 ── */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 기부 카드 */}
          <Card iconSrc={ICON.treasury} title="길드 자금 기부" subtitle={`일일 한도 ${my.dailyDonationCap.toLocaleString()}G`}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: 'var(--text-dim)' }}>오늘 내 기부</span>
                <span style={{ color: donationPct >= 100 ? 'var(--danger)' : 'var(--success)' }}>
                  {my.myDonationToday.toLocaleString()} / {my.dailyDonationCap.toLocaleString()}G
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, donationPct)}%`, height: '100%',
                  background: donationPct >= 100 ? 'var(--danger)' : 'var(--success)',
                }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="number" placeholder="기부 금액 (G)"
                value={donateAmt} onChange={e => setDonateAmt(e.target.value)}
                max={remainingDonation} disabled={remainingDonation <= 0}
                style={{ flex: 1 }}
              />
              <button className="primary" onClick={donate} disabled={busy || remainingDonation <= 0 || !donateAmt}>
                기부
              </button>
            </div>
            {[10000, 100000, 1000000].map(v => (
              <button key={v} onClick={() => setDonateAmt(String(Math.min(v, remainingDonation)))}
                style={{ marginTop: 6, marginRight: 4, fontSize: 10, padding: '3px 8px' }}>
                {v.toLocaleString()}G
              </button>
            ))}
          </Card>

          {/* 활성 스킬 요약 */}
          <Card iconSrc={ICON.skills} title="활성 길드 버프">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {my.skills.map(sk => (
                <div key={sk.key} style={{
                  padding: '8px 10px', background: 'var(--bg)',
                  borderLeft: `3px solid ${SKILL_COLOR[sk.key]}`, borderRadius: 3,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <PxIcon src={SKILL_ICON[sk.key]} size={18} />
                    {sk.label}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: SKILL_COLOR[sk.key] }}>
                    +{sk.currentPct}%
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'skills' && (
        <Card iconSrc={ICON.skills} title="길드 스킬" subtitle={my.isLeader ? '자금을 사용해 업그레이드' : '리더만 업그레이드 가능'}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {my.skills.map(sk => {
              const maxed = sk.level >= sk.max;
              const lvOk = my.level >= sk.nextReqLevel;
              const goldOk = my.treasury >= sk.nextCost;
              const canUpgrade = my.isLeader && !maxed && lvOk && goldOk && !busy;
              const color = SKILL_COLOR[sk.key];
              return (
                <div key={sk.key} style={{
                  padding: 12, background: 'var(--bg)',
                  border: `1px solid ${color}40`, borderTop: `3px solid ${color}`,
                  borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <PxIcon src={SKILL_ICON[sk.key]} size={22} />
                      {sk.label}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{sk.level}/{sk.max}</span>
                  </div>

                  {/* 단계 막대 */}
                  <div style={{ display: 'flex', gap: 2 }}>
                    {Array.from({ length: sk.max }).map((_, i) => (
                      <div key={i} style={{
                        flex: 1, height: 6,
                        background: i < sk.level ? color : 'var(--bg-panel)',
                        border: `1px solid ${i < sk.level ? color : 'var(--border)'}`,
                        borderRadius: 1,
                      }} />
                    ))}
                  </div>

                  <div style={{ fontSize: 12, color, fontWeight: 700, textAlign: 'center', padding: '4px 0', background: `${color}10`, borderRadius: 2 }}>
                    현재 +{sk.currentPct}%
                    {!maxed && <span style={{ color: 'var(--text-dim)', margin: '0 6px', fontWeight: 400 }}>→</span>}
                    {!maxed && <span style={{ color: 'var(--success)' }}>+{sk.currentPct + sk.pctPerLevel}%</span>}
                  </div>

                  {!maxed ? (
                    <>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.4 }}>
                        다음 단계 요구사항<br />
                        <span style={{ color: lvOk ? 'var(--text)' : 'var(--danger)' }}>길드 Lv.{sk.nextReqLevel}</span>
                        {' · '}
                        <span style={{ color: goldOk ? 'var(--text)' : 'var(--danger)' }}>{sk.nextCost.toLocaleString()}G</span>
                      </div>
                      {my.isLeader && (
                        <button onClick={() => upgradeSkill(sk.key)} disabled={!canUpgrade}
                          style={{
                            fontSize: 11, fontWeight: 700, padding: '6px',
                            background: canUpgrade ? color : 'transparent',
                            color: canUpgrade ? '#000' : 'var(--text-dim)',
                            border: `1px solid ${canUpgrade ? color : 'var(--border)'}`,
                            cursor: canUpgrade ? 'pointer' : 'not-allowed',
                            borderRadius: 3, opacity: canUpgrade ? 1 : 0.5,
                          }}>
                          {!lvOk ? '레벨 부족' : !goldOk ? '자금 부족' : '업그레이드'}
                        </button>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color, textAlign: 'center', fontWeight: 700, padding: '6px 0' }}>
                      ★ 최대 단계 ★
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {tab === 'territory' && (
        <Card iconSrc={ICON.territory} title="영토 점령전" subtitle="매주 일요일 23:50 (UTC) 결산 · 점령 시 EXP +15%, 드랍 +15%">
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10, padding: '8px 10px', background: 'var(--bg)', borderLeft: '3px solid var(--accent)', borderRadius: 2 }}>
            1주일간 사냥터에서 가장 많이 사냥한 길드(100점 이상)가 점령. 매주 월요일 점수 리셋.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
            {territories.map(t => {
              const mine = myScores[t.fieldId];
              const owned = t.ownerGuildId === my.id;
              const occupied = !!t.ownerGuildName;
              return (
                <div key={t.fieldId} style={{
                  padding: 10, background: 'var(--bg)',
                  border: `1px solid ${owned ? 'var(--accent)' : occupied ? '#666' : 'var(--border)'}`,
                  borderLeft: `3px solid ${owned ? 'var(--accent)' : occupied ? '#888' : 'var(--border)'}`,
                  borderRadius: 3,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: owned ? 'var(--accent)' : 'var(--text)' }}>
                      {t.fieldName}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Lv.{t.requiredLevel}+</span>
                  </div>
                  <div style={{ fontSize: 10, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {occupied ? (
                      <>
                        <PxIcon src={ICON.flag} size={12} />
                        <span style={{ color: owned ? 'var(--accent)' : '#daa520', fontWeight: 700 }}>
                          {t.ownerGuildName} {owned && '(우리)'}
                        </span>
                      </>
                    ) : (
                      <>
                        <PxIcon src={ICON.guild} size={12} />
                        <span style={{ color: 'var(--text-dim)' }}>무점령</span>
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--border)' }}>
                    <span>1위: {t.weekTopGuildName || '-'}</span>
                    <span>{t.weekTopScore.toLocaleString()}점</span>
                  </div>
                  {mine && (
                    <div style={{ fontSize: 10, color: '#66ccff', marginTop: 3 }}>
                      우리: {mine.score.toLocaleString()}점 ({mine.rank}위)
                    </div>
                  )}
                </div>
              );
            })}
            {territories.length === 0 && (
              <div style={{ color: 'var(--text-dim)', padding: 20, textAlign: 'center', gridColumn: '1 / -1' }}>
                영토 정보 로드 중...
              </div>
            )}
          </div>
        </Card>
      )}

      {tab === 'members' && (
        <Card iconSrc={ICON.members} title={`길드원 (${my.members.length}/${my.maxMembers})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {my.members.map(m => {
              const cls = CLASS_COLOR[m.className] || 'var(--text-dim)';
              const lastOnline = m.lastOnlineAt ? new Date(m.lastOnlineAt).getTime() : 0;
              const diffMs = Date.now() - lastOnline;
              const diffH = Math.floor(diffMs / 3600000);
              const diffD = Math.floor(diffMs / 86400000);
              let onlineLabel: string; let onlineColor: string;
              if (!lastOnline) { onlineLabel = '-'; onlineColor = 'var(--text-dim)'; }
              else if (diffMs < 5 * 60000) { onlineLabel = '온라인'; onlineColor = 'var(--success)'; }
              else if (diffH < 1) { onlineLabel = `${Math.floor(diffMs/60000)}분 전`; onlineColor = 'var(--accent)'; }
              else if (diffH < 24) { onlineLabel = `${diffH}시간 전`; onlineColor = '#88ccff'; }
              else if (diffD < 7) { onlineLabel = `${diffD}일 전`; onlineColor = 'var(--text-dim)'; }
              else { onlineLabel = `${diffD}일 전`; onlineColor = 'var(--danger)'; }

              return (
                <div key={m.id} style={{
                  padding: '10px 12px', background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderLeft: `3px solid ${cls}`,
                  borderRadius: 3,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {m.role === 'leader' && <PxIcon src={ICON.leader} size={18} />}
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</span>
                      <span style={{
                        fontSize: 10, padding: '1px 5px', borderRadius: 2,
                        border: `1px solid ${cls}`, color: cls, fontWeight: 700,
                      }}>
                        Lv.{m.level} {CLASS_LABEL[m.className] || m.className}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2, display: 'flex', gap: 10 }}>
                      <span>오늘 <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{(m.todayDonation || 0).toLocaleString()}G</span></span>
                      <span>누적 <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{(m.goldDonated || 0).toLocaleString()}G</span></span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: onlineColor, fontWeight: 600 }}>{onlineLabel}</span>
                    {m.role === 'leader' && (
                      <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>리더</span>
                    )}
                    {my.isLeader && m.role !== 'leader' && (
                      <button onClick={() => kickMember(m.id, m.name)} style={{
                        fontSize: 10, padding: '3px 8px', background: 'var(--danger)',
                        color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 700,
                      }}>추방</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {tab === 'applications' && my.isLeader && (
        <Card iconSrc={ICON.members} title={`가입 신청 (${applications.length})`}>
          {applications.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', padding: 20, textAlign: 'center', fontSize: 12 }}>
              대기 중인 가입 신청이 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {applications.map(a => {
                const cls = CLASS_COLOR[a.className] || 'var(--text-dim)';
                return (
                  <div key={a.id} style={{
                    padding: '10px 12px', background: 'var(--bg)',
                    border: '1px solid var(--border)', borderLeft: `3px solid ${cls}`,
                    borderRadius: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</span>
                        <span style={{
                          fontSize: 10, padding: '1px 5px', borderRadius: 2,
                          border: `1px solid ${cls}`, color: cls, fontWeight: 700,
                        }}>
                          Lv.{a.level} {CLASS_LABEL[a.className] || a.className}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                        신청일 {new Date(a.appliedAt).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="primary" onClick={() => approveApp(a.id)} style={{ fontSize: 11, padding: '5px 12px' }}>승인</button>
                      <button onClick={() => rejectApp(a.id)} style={{
                        fontSize: 11, padding: '5px 12px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 3,
                      }}>거절</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ── 보조 컴포넌트 ──
function Stat({ iconSrc, label, value, accent }: { iconSrc: string; label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      padding: '10px 12px', background: 'rgba(0,0,0,0.3)',
      border: '1px solid var(--border)', borderRadius: 4,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <PxIcon src={iconSrc} size={28} />
      <div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--text)' }}>{value}</div>
      </div>
    </div>
  );
}

function Card({ iconSrc, title, subtitle, children }: { iconSrc?: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: 14, background: 'var(--bg-panel)',
      border: '1px solid var(--border)', borderRadius: 4,
    }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
          {iconSrc && <PxIcon src={iconSrc} size={20} />}
          {title}
        </div>
        {subtitle && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}
