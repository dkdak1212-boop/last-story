import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

interface PartyMember { id: number; name: string; level: number; className: string }
interface MyParty { id: number; isLeader: boolean; members: PartyMember[] }
interface Invite { id: number; party_id: number; from_name: string }

const CLASS_LABEL: Record<string, string> = {
  warrior: '전사', swordsman: '검사', archer: '궁수', rogue: '도적',
  assassin: '암살자', mage: '마법사', priest: '사제', druid: '드루이드',
};

export function PartyScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const [my, setMy] = useState<MyParty | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteName, setInviteName] = useState('');

  async function load() {
    if (!active) return;
    const res = await api<{ party: MyParty | null; invites: Invite[] }>(`/party/my/${active.id}`);
    setMy(res.party); setInvites(res.invites);
  }
  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, [active?.id]);

  async function invite() {
    if (!active || !inviteName.trim()) return;
    try {
      await api('/party/invite', { method: 'POST', body: JSON.stringify({ fromCharacterId: active.id, toName: inviteName.trim() }) });
      setInviteName(''); load();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }
  async function accept(inviteId: number) {
    if (!active) return;
    try {
      await api(`/party/invite/${inviteId}/accept`, { method: 'POST', body: JSON.stringify({ characterId: active.id }) });
      load();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }
  async function decline(inviteId: number) {
    await api(`/party/invite/${inviteId}/decline`, { method: 'POST' });
    load();
  }
  async function leave() {
    if (!active) return;
    if (!confirm('파티에서 나가시겠습니까?')) return;
    await api(`/party/leave/${active.id}`, { method: 'POST' });
    load();
  }
  async function kick(targetId: number) {
    if (!active) return;
    await api(`/party/kick/${active.id}`, { method: 'POST', body: JSON.stringify({ targetId }) });
    load();
  }

  return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>파티</h2>

      {invites.length > 0 && (
        <div style={{ padding: 12, background: 'var(--bg-panel)', border: '1px solid var(--accent)', marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-dim)' }}>받은 초대</div>
          {invites.map(inv => (
            <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
              <span><b>{inv.from_name}</b>님이 파티에 초대했습니다.</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="primary" onClick={() => accept(inv.id)}>수락</button>
                <button onClick={() => decline(inv.id)}>거절</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {my ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>인원 {my.members.length}/4</div>
            <button onClick={leave}>나가기</button>
          </div>
          {my.isLeader && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <input placeholder="초대할 캐릭터 이름" value={inviteName} onChange={e => setInviteName(e.target.value)} maxLength={12} style={{ flex: 1 }} />
              <button className="primary" onClick={invite} disabled={!inviteName.trim() || my.members.length >= 4}>초대</button>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {my.members.map(m => (
              <div key={m.id} style={{
                padding: '8px 12px', background: 'var(--bg-panel)', border: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <span style={{ fontWeight: 700 }}>{m.name}</span>
                  <span style={{ color: 'var(--text-dim)', marginLeft: 10, fontSize: 13 }}>
                    Lv.{m.level} {CLASS_LABEL[m.className]}
                  </span>
                </div>
                {my.isLeader && m.id !== active?.id && (
                  <button onClick={() => kick(m.id)} style={{ fontSize: 11, padding: '2px 8px' }}>추방</button>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ color: 'var(--text-dim)', marginBottom: 12 }}>파티가 없다. 다른 캐릭터를 초대하면 파티가 생성된다.</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input placeholder="초대할 캐릭터 이름" value={inviteName} onChange={e => setInviteName(e.target.value)} maxLength={12} style={{ flex: 1 }} />
            <button className="primary" onClick={invite} disabled={!inviteName.trim()}>초대</button>
          </div>
        </div>
      )}
    </div>
  );
}
