import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

interface GuildSummary {
  id: number; name: string; description: string;
  memberCount: number; leaderName: string; maxMembers: number; statBuffPct: number;
}
interface GuildMember { id: number; name: string; level: number; className: string; role: string }
interface MyGuild {
  id: number; name: string; description: string; isLeader: boolean; role: string;
  maxMembers: number; statBuffPct: number; members: GuildMember[];
}

const CLASS_LABEL: Record<string, string> = {
  warrior: '전사', swordsman: '검사', archer: '궁수', rogue: '도적',
  assassin: '암살자', mage: '마법사', priest: '사제', druid: '드루이드',
};

export function GuildScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refresh = useCharacterStore((s) => s.refreshActive);
  const [my, setMy] = useState<MyGuild | null>(null);
  const [guilds, setGuilds] = useState<GuildSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [err, setErr] = useState('');

  async function load() {
    if (!active) return;
    const res = await api<{ guild: MyGuild | null }>(`/guilds/my/${active.id}`);
    setMy(res.guild);
    if (!res.guild) {
      const list = await api<GuildSummary[]>('/guilds');
      setGuilds(list);
    }
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
  async function join(id: number) {
    if (!active) return;
    try {
      await api(`/guilds/${id}/join`, { method: 'POST', body: JSON.stringify({ characterId: active.id }) });
      load();
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

  if (my) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <h2 style={{ color: 'var(--accent)' }}>{my.name}</h2>
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{my.description}</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>
              버프: 모든 스탯 +{my.statBuffPct}% · 인원 {my.members.length}/{my.maxMembers}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {my.isLeader && <button onClick={disband}>해산</button>}
            {!my.isLeader && <button onClick={leave}>탈퇴</button>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {my.members.map(m => (
            <div key={m.id} style={{
              padding: '8px 12px', background: 'var(--bg-panel)', border: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                {m.role === 'leader' && <span style={{ color: 'var(--accent)', marginRight: 6 }}>★</span>}
                <span style={{ fontWeight: 700 }}>{m.name}</span>
                <span style={{ color: 'var(--text-dim)', marginLeft: 10, fontSize: 13 }}>
                  Lv.{m.level} {CLASS_LABEL[m.className]}
                </span>
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{m.role}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--accent)' }}>길드</h2>
        <button className="primary" onClick={() => setCreating(!creating)}>
          {creating ? '취소' : '길드 생성 (5,000G)'}
        </button>
      </div>

      {creating && (
        <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--accent)', marginBottom: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input placeholder="길드명 (2~20자)" value={name} onChange={e => setName(e.target.value)} maxLength={20} />
            <input placeholder="소개 (선택)" value={desc} onChange={e => setDesc(e.target.value)} maxLength={200} />
            {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>}
            <button className="primary" onClick={create} disabled={name.length < 2}>생성</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {guilds.length === 0 && <div style={{ color: 'var(--text-dim)' }}>길드가 없다.</div>}
        {guilds.map(g => (
          <div key={g.id} style={{
            padding: 12, background: 'var(--bg-panel)', border: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{g.name}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                길드장 {g.leaderName} · {g.memberCount}/{g.maxMembers} · 버프 +{g.statBuffPct}%
              </div>
              {g.description && <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>{g.description}</div>}
            </div>
            <button onClick={() => join(g.id)} disabled={g.memberCount >= g.maxMembers}>가입</button>
          </div>
        ))}
      </div>
    </div>
  );
}
