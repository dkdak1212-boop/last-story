import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

interface Stats {
  totalUsers: number; totalCharacters: number; active24h: number;
  totalGuilds: number; openAuctions: number; openFeedback: number;
  combatSessions: number; pendingMails: number;
  topLevel: string; topGold: string;
}
interface AdminAnnouncement {
  id: number; title: string; body: string; priority: string; active: boolean;
  created_at: string; expires_at: string | null; author: string | null;
}
interface AdminFeedback {
  id: number; category: string; text: string; status: string; admin_note: string | null;
  created_at: string; username: string; character_name: string | null;
}
interface UserRow {
  id: number; username: string; is_admin: boolean; banned: boolean; ban_reason: string | null;
  created_at: string; last_login_at: string | null; char_count: number; max_level: number | null;
  char_names: string | null;
}
interface CharSearchResult {
  id: number; name: string; class_name: string; level: number; exp: string;
  gold: string; hp: number; max_hp: number; node_points: number;
  stats: Record<string, number>; location: string;
  last_online_at: string; created_at: string; username: string; user_id: number;
}
interface CharDetail {
  character: CharSearchResult;
  equipped: Array<{ slot: string; item_id: number; enhance_level: number; prefix_stats: Record<string, number> | null; locked: boolean; name: string; grade: string; type: string; stats: Record<string, number> | null }>;
  inventory: Array<{ slot_index: number; item_id: number; quantity: number; enhance_level: number; prefix_stats: Record<string, number> | null; locked: boolean; name: string; grade: string; type: string; slot: string | null; stats: Record<string, number> | null; description: string }>;
  skills: Array<{ name: string; required_level: number; auto_use: boolean }>;
  guild: { guild_name: string; role: string } | null;
  inCombat: boolean;
}
interface ItemSearchResult {
  id: number; name: string; type: string; grade: string; slot: string | null; stats: Record<string, number> | null; description: string;
}
interface BossInfo { id: number; name: string; level: number; max_hp: number; }
interface ActiveEvent { id: number; name: string; current_hp: number; max_hp: number; ends_at: string; status: string; }

type Tab = 'stats' | 'characters' | 'grant' | 'items' | 'grantAll' | 'users' | 'worldEvent' | 'globalEvent' | 'systemMsg' | 'announcements' | 'feedback';

const GRADE_COLOR: Record<string, string> = { common: '#9a8b75', rare: '#5b8ecc', epic: '#b060cc', legendary: '#e08030' };
const CLASS_LABEL: Record<string, string> = { warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적' };
const SLOT_LABEL: Record<string, string> = { weapon: '무기', helm: '투구', chest: '갑옷', boots: '장화', ring: '반지', amulet: '목걸이' };

export function AdminScreen() {
  const [tab, setTab] = useState<Tab>('stats');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'stats', label: '통계' },
    { id: 'characters', label: '캐릭터 관리' },
    { id: 'grant', label: '개인 지급' },
    { id: 'items', label: '아이템 지급/회수' },
    { id: 'grantAll', label: '전체 보상' },
    { id: 'users', label: '유저 관리' },
    { id: 'worldEvent', label: '월드이벤트' },
    { id: 'globalEvent', label: '글로벌 이벤트' },
    { id: 'systemMsg', label: '시스템 공지' },
    { id: 'announcements', label: '공지 관리' },
    { id: 'feedback', label: '피드백' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--accent)' }}>관리자 대시보드</h2>
        <Link to="/village" style={{ padding: '6px 16px', color: 'var(--text)', border: '1px solid var(--border)', textDecoration: 'none', fontSize: 13 }}>메인으로</Link>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} className={tab === t.id ? 'primary' : ''} onClick={() => setTab(t.id)}
            style={{ fontSize: 12, padding: '5px 10px' }}>{t.label}</button>
        ))}
      </div>
      {tab === 'stats' && <StatsTab />}
      {tab === 'characters' && <CharactersTab />}
      {tab === 'grant' && <GrantTab />}
      {tab === 'items' && <ItemsTab />}
      {tab === 'grantAll' && <GrantAllTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'worldEvent' && <WorldEventTab />}
      {tab === 'globalEvent' && <GlobalEventTab />}
      {tab === 'systemMsg' && <SystemMsgTab />}
      {tab === 'announcements' && <AnnouncementsTab />}
      {tab === 'feedback' && <FeedbackTab />}
    </div>
  );
}

// ========== 통계 ==========
function StatsTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => { api<Stats>('/admin/stats').then(setStats); }, []);
  if (!stats) return <div style={{ color: 'var(--text-dim)' }}>로딩...</div>;
  const items = [
    { label: '총 유저', value: stats.totalUsers },
    { label: '총 캐릭터', value: stats.totalCharacters },
    { label: '24시간 활동', value: stats.active24h },
    { label: '전투 중 세션', value: stats.combatSessions },
    { label: '길드 수', value: stats.totalGuilds },
    { label: '진행 중 경매', value: stats.openAuctions },
    { label: '미수령 우편', value: stats.pendingMails },
    { label: '대기 피드백', value: stats.openFeedback },
    { label: '최고 레벨', value: stats.topLevel },
    { label: '최고 재력', value: stats.topGold },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
      {items.map(i => (
        <div key={i.label} style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>{i.label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{i.value}</div>
        </div>
      ))}
    </div>
  );
}

// ========== 캐릭터 관리 (검색 + 상세 + 수정) ==========
function CharactersTab() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<CharSearchResult[]>([]);
  const [detail, setDetail] = useState<CharDetail | null>(null);
  const [msg, setMsg] = useState('');

  async function doSearch() {
    if (!search) return;
    const r = await api<{ characters: CharSearchResult[] }>(`/admin/characters/search?name=${encodeURIComponent(search)}`);
    setResults(r.characters); setDetail(null);
  }
  async function loadDetail(id: number) {
    const r = await api<CharDetail>(`/admin/characters/${id}/detail`);
    setDetail(r);
  }

  // 수정 폼
  const [editLevel, setEditLevel] = useState('');
  const [editGold, setEditGold] = useState('');
  const [editExp, setEditExp] = useState('');
  const [editHp, setEditHp] = useState('');
  const [editMaxHp, setEditMaxHp] = useState('');
  const [editNodePoints, setEditNodePoints] = useState('');
  // 우편 발송
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');
  const [mailGold, setMailGold] = useState('');

  function fillEdit(c: CharSearchResult) {
    setEditLevel(String(c.level));
    setEditGold(String(c.gold));
    setEditExp(String(c.exp));
    setEditHp(String(c.hp));
    setEditMaxHp(String(c.max_hp));
    setEditNodePoints(String(c.node_points ?? 0));
  }

  async function saveEdit() {
    if (!detail) return;
    setMsg('');
    const c = detail.character;
    const body: Record<string, unknown> = {};
    if (editLevel && Number(editLevel) !== c.level) body.level = Number(editLevel);
    if (editGold && Number(editGold) !== Number(c.gold)) body.gold = Number(editGold);
    if (editExp && Number(editExp) !== Number(c.exp)) body.exp = Number(editExp);
    if (editHp && Number(editHp) !== c.hp) body.hp = Number(editHp);
    if (editMaxHp && Number(editMaxHp) !== c.max_hp) body.maxHp = Number(editMaxHp);
    if (editNodePoints && Number(editNodePoints) !== (c.node_points ?? 0)) body.nodePoints = Number(editNodePoints);
    if (Object.keys(body).length === 0) { setMsg('변경사항 없음'); return; }
    try {
      const r = await api<{ message: string }>(`/admin/characters/${c.id}/modify`, {
        method: 'POST', body: JSON.stringify(body),
      });
      setMsg(r.message);
      loadDetail(c.id);
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  async function kickCombat() {
    if (!detail) return;
    try {
      const r = await api<{ message: string }>(`/admin/characters/${detail.character.id}/kick-combat`, { method: 'POST' });
      setMsg(r.message); loadDetail(detail.character.id);
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  async function sendMail() {
    if (!detail || !mailSubject || !mailBody) return;
    try {
      const r = await api<{ message: string }>(`/admin/characters/${detail.character.id}/send-mail`, {
        method: 'POST', body: JSON.stringify({
          subject: mailSubject, body: mailBody, gold: Number(mailGold) || 0,
        }),
      });
      setMsg(r.message); setMailSubject(''); setMailBody(''); setMailGold('');
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  async function clearInventory() {
    if (!detail) return;
    if (!confirm(`${detail.character.name}의 인벤토리를 초기화합니다. 복구 불가!`)) return;
    try {
      const r = await api<{ message: string }>(`/admin/characters/${detail.character.id}/clear-inventory`, { method: 'POST' });
      setMsg(r.message); loadDetail(detail.character.id);
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  async function teleportVillage() {
    if (!detail) return;
    try {
      await api(`/admin/characters/${detail.character.id}/modify`, {
        method: 'POST', body: JSON.stringify({ location: 'village' }),
      });
      setMsg('마을로 이동 완료'); loadDetail(detail.character.id);
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input placeholder="캐릭터 이름 검색..." value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doSearch()}
          style={{ flex: 1, maxWidth: 300 }} />
        <button className="primary" onClick={doSearch}>검색</button>
      </div>
      {msg && <div style={{ padding: 8, fontSize: 13, color: 'var(--accent)', background: 'var(--bg-panel)', border: '1px solid var(--accent)', marginBottom: 10 }}>{msg}</div>}

      {!detail && results.map(c => (
        <div key={c.id} onClick={() => { loadDetail(c.id); fillEdit(c); }} style={{
          padding: '8px 12px', background: 'var(--bg-panel)', border: '1px solid var(--border)',
          marginBottom: 4, cursor: 'pointer',
        }}>
          <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{c.name}</span>
          <span style={{ marginLeft: 8, color: 'var(--text-dim)', fontSize: 12 }}>
            Lv.{c.level} · {CLASS_LABEL[c.class_name]} · {c.username} · {Number(c.gold).toLocaleString()}G
          </span>
        </div>
      ))}

      {detail && (() => {
        const c = detail.character;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={() => setDetail(null)} style={{ alignSelf: 'flex-start', fontSize: 12 }}>← 목록으로</button>

            {/* 기본 정보 + 수정 */}
            <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--accent)' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>
                {c.name} <span style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 400 }}>({c.username}) ID:{c.id}</span>
                {detail.inCombat && <span style={{ fontSize: 12, color: 'var(--danger)', marginLeft: 8 }}>전투 중</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, fontSize: 13 }}>
                <EditField label="레벨" value={editLevel} onChange={setEditLevel} />
                <EditField label="골드" value={editGold} onChange={setEditGold} />
                <EditField label="경험치" value={editExp} onChange={setEditExp} />
                <EditField label="HP" value={editHp} onChange={setEditHp} />
                <EditField label="최대HP" value={editMaxHp} onChange={setEditMaxHp} />
                <EditField label="노드 포인트" value={editNodePoints} onChange={setEditNodePoints} />
              </div>
              {c.stats && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>
                  스탯: 힘{c.stats.str} 민{c.stats.dex} 지{c.stats.int} 체{c.stats.vit} 속{c.stats.spd} 치{c.stats.cri}
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                위치: {c.location} · 접속: {new Date(c.last_online_at).toLocaleString('ko-KR')}
              </div>
              {detail.guild && (
                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--accent)' }}>길드: {detail.guild.guild_name} ({detail.guild.role})</div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                <button className="primary" onClick={saveEdit}>수정 저장</button>
                <button onClick={teleportVillage}>마을 이동</button>
                {detail.inCombat && <button onClick={kickCombat} style={{ color: 'var(--danger)', border: '1px solid var(--danger)' }}>전투 강제종료</button>}
                <button onClick={clearInventory} style={{ color: 'var(--danger)', border: '1px solid var(--danger)' }}>인벤 초기화</button>
              </div>
            </div>

            {/* 개인 우편 발송 */}
            <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>우편 발송</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input placeholder="제목" value={mailSubject} onChange={e => setMailSubject(e.target.value)} style={{ maxWidth: 300 }} />
                <textarea placeholder="내용" value={mailBody} onChange={e => setMailBody(e.target.value)} rows={2} style={{ maxWidth: 400, fontFamily: 'inherit' }} />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>골드:</span>
                  <input type="number" value={mailGold} onChange={e => setMailGold(e.target.value)} style={{ width: 100 }} placeholder="0" />
                  <button className="primary" onClick={sendMail} disabled={!mailSubject || !mailBody}>발송</button>
                </div>
              </div>
            </div>

            {/* 장착 장비 */}
            <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>장착 장비</div>
              {detail.equipped.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>없음</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
                {detail.equipped.map(e => (
                  <div key={e.slot} style={{ padding: 8, border: `1px solid ${GRADE_COLOR[e.grade] || 'var(--border)'}`, fontSize: 12 }}>
                    <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>{SLOT_LABEL[e.slot] || e.slot}</div>
                    <div style={{ color: GRADE_COLOR[e.grade], fontWeight: 700 }}>
                      {e.name}{e.enhance_level > 0 && <span style={{ color: 'var(--accent)' }}> +{e.enhance_level}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 인벤토리 */}
            <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>인벤토리 ({detail.inventory.length})</div>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {detail.inventory.map(it => (
                  <div key={it.slot_index} style={{
                    padding: '4px 8px', fontSize: 12, borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between',
                  }}>
                    <div>
                      <span style={{ color: 'var(--text-dim)', marginRight: 6 }}>#{it.slot_index}</span>
                      <span style={{ color: GRADE_COLOR[it.grade], fontWeight: 700 }}>{it.name}</span>
                      {it.enhance_level > 0 && <span style={{ color: 'var(--accent)' }}> +{it.enhance_level}</span>}
                      {it.quantity > 1 && <span style={{ color: 'var(--text-dim)' }}> ×{it.quantity}</span>}
                    </div>
                    <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{it.grade}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 스킬 */}
            <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>스킬</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {detail.skills.map(s => (
                  <span key={s.name} style={{ padding: '3px 8px', fontSize: 11, border: `1px solid ${s.auto_use ? 'var(--accent)' : 'var(--border)'}`, color: s.auto_use ? 'var(--accent)' : 'var(--text-dim)' }}>
                    {s.name} (Lv.{s.required_level}){s.auto_use ? ' ✓' : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function EditField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>{label}</div>
      <input type="number" value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%' }} />
    </div>
  );
}

// ========== 개인 지급 (이름 검색 기반) ==========
function GrantTab() {
  const [charSearch, setCharSearch] = useState('');
  const [charResults, setCharResults] = useState<CharSearchResult[]>([]);
  const [selectedChar, setSelectedChar] = useState<CharSearchResult | null>(null);
  const [gold, setGold] = useState('');
  const [exp, setExp] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState<ItemSearchResult[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemSearchResult | null>(null);
  const [itemQty, setItemQty] = useState(1);
  const [msg, setMsg] = useState('');

  async function searchChar() {
    if (!charSearch) return;
    const r = await api<{ characters: CharSearchResult[] }>(`/admin/characters/search?name=${encodeURIComponent(charSearch)}`);
    setCharResults(r.characters);
  }
  async function searchItem() {
    if (!itemSearch) return;
    const r = await api<{ items: ItemSearchResult[] }>(`/admin/items/search?name=${encodeURIComponent(itemSearch)}`);
    setItemResults(r.items);
  }

  async function grant() {
    if (!selectedChar) return;
    setMsg('');
    const body: Record<string, unknown> = { characterId: selectedChar.id };
    if (gold) body.gold = Number(gold);
    if (exp) body.exp = Number(exp);
    if (selectedItem) { body.itemId = selectedItem.id; body.itemQty = itemQty; }
    if (!gold && !exp && !selectedItem) return setMsg('지급할 항목을 입력하세요');
    try {
      const r = await api<{ message: string }>('/admin/grant', { method: 'POST', body: JSON.stringify(body) });
      setMsg(r.message);
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  return (
    <div>
      {/* 캐릭터 선택 */}
      <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>대상 캐릭터</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input placeholder="캐릭터 이름 검색..." value={charSearch}
            onChange={e => setCharSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchChar()}
            style={{ flex: 1, maxWidth: 250 }} />
          <button onClick={searchChar}>검색</button>
        </div>
        {!selectedChar && charResults.map(c => (
          <div key={c.id} onClick={() => setSelectedChar(c)} style={{
            padding: '4px 8px', cursor: 'pointer', fontSize: 13, marginBottom: 2,
            border: '1px solid var(--border)', background: 'var(--bg)',
          }}>
            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{c.name}</span>
            <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>Lv.{c.level} · {CLASS_LABEL[c.class_name]} · {c.username}</span>
          </div>
        ))}
        {selectedChar && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{selectedChar.name}</span>
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>Lv.{selectedChar.level} (ID:{selectedChar.id})</span>
            <button onClick={() => setSelectedChar(null)} style={{ fontSize: 11, padding: '2px 8px' }}>변경</button>
          </div>
        )}
      </div>

      {selectedChar && (
        <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>지급 내용</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10, maxWidth: 400 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>골드</div>
              <input type="number" value={gold} onChange={e => setGold(e.target.value)} placeholder="0" style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>경험치</div>
              <input type="number" value={exp} onChange={e => setExp(e.target.value)} placeholder="0" style={{ width: '100%' }} />
            </div>
          </div>

          {/* 아이템 검색 */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>아이템 (선택)</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <input placeholder="아이템 이름 검색..." value={itemSearch}
                onChange={e => setItemSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchItem()}
                style={{ flex: 1, maxWidth: 250 }} />
              <button onClick={searchItem}>검색</button>
            </div>
            {itemResults.map(it => (
              <div key={it.id} onClick={() => setSelectedItem(it)} style={{
                padding: '3px 8px', cursor: 'pointer', fontSize: 12, marginBottom: 2,
                border: `1px solid ${selectedItem?.id === it.id ? 'var(--accent)' : 'var(--border)'}`,
                background: selectedItem?.id === it.id ? 'var(--bg-elev)' : 'var(--bg)',
              }}>
                <span style={{ color: GRADE_COLOR[it.grade], fontWeight: 700 }}>{it.name}</span>
                <span style={{ color: 'var(--text-dim)', marginLeft: 6, fontSize: 11 }}>[{it.grade}] ID:{it.id}</span>
              </div>
            ))}
            {selectedItem && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                <span style={{ fontSize: 12, color: GRADE_COLOR[selectedItem.grade], fontWeight: 700 }}>{selectedItem.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>수량:</span>
                <input type="number" min={1} max={999} value={itemQty} onChange={e => setItemQty(Math.max(1, Number(e.target.value)))} style={{ width: 60 }} />
                <button onClick={() => setSelectedItem(null)} style={{ fontSize: 11 }}>제거</button>
              </div>
            )}
          </div>

          <button className="primary" onClick={grant}>지급</button>
        </div>
      )}

      {msg && <div style={{ padding: 8, fontSize: 13, color: 'var(--accent)', background: 'var(--bg-panel)', border: '1px solid var(--accent)' }}>{msg}</div>}
    </div>
  );
}

// ========== 아이템 지급/회수 ==========
function ItemsTab() {
  const [charSearch, setCharSearch] = useState('');
  const [charResults, setCharResults] = useState<CharSearchResult[]>([]);
  const [selectedChar, setSelectedChar] = useState<CharSearchResult | null>(null);
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState<ItemSearchResult[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemSearchResult | null>(null);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState('');
  const [charDetail, setCharDetail] = useState<CharDetail | null>(null);
  const [revokeSlot, setRevokeSlot] = useState<number | null>(null);
  const [revokeQty, setRevokeQty] = useState(1);

  async function searchChar() {
    if (!charSearch) return;
    const r = await api<{ characters: CharSearchResult[] }>(`/admin/characters/search?name=${encodeURIComponent(charSearch)}`);
    setCharResults(r.characters);
  }
  async function selectChar(c: CharSearchResult) {
    setSelectedChar(c);
    const r = await api<CharDetail>(`/admin/characters/${c.id}/detail`);
    setCharDetail(r);
  }
  async function searchItem() {
    if (!itemSearch) return;
    const r = await api<{ items: ItemSearchResult[] }>(`/admin/items/search?name=${encodeURIComponent(itemSearch)}`);
    setItemResults(r.items);
  }
  async function grantItem() {
    if (!selectedChar || !selectedItem) return;
    setMsg('');
    try {
      const r = await api<{ message: string }>('/admin/grant-item', {
        method: 'POST', body: JSON.stringify({ characterId: selectedChar.id, itemId: selectedItem.id, quantity: qty }),
      });
      setMsg(r.message);
      if (selectedChar) selectChar(selectedChar);
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }
  async function revokeItem() {
    if (!selectedChar || revokeSlot === null) return;
    setMsg('');
    try {
      const r = await api<{ removed: number }>('/admin/revoke-item', {
        method: 'POST', body: JSON.stringify({ characterId: selectedChar.id, slotIndex: revokeSlot, quantity: revokeQty }),
      });
      setMsg(`${r.removed}개 회수 완료`);
      setRevokeSlot(null);
      if (selectedChar) selectChar(selectedChar);
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  return (
    <div>
      <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>캐릭터 선택</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input placeholder="캐릭터 이름..." value={charSearch} onChange={e => setCharSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchChar()} style={{ flex: 1, maxWidth: 250 }} />
          <button onClick={searchChar}>검색</button>
        </div>
        {!selectedChar && charResults.map(c => (
          <div key={c.id} onClick={() => selectChar(c)} style={{ padding: '4px 8px', cursor: 'pointer', fontSize: 13, marginBottom: 2, border: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{c.name}</span>
            <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>Lv.{c.level} · {c.username}</span>
          </div>
        ))}
        {selectedChar && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{selectedChar.name}</span>
            <button onClick={() => { setSelectedChar(null); setCharDetail(null); }} style={{ fontSize: 11 }}>변경</button>
          </div>
        )}
      </div>

      {selectedChar && (
        <>
          <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>아이템 지급</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input placeholder="아이템 이름 검색..." value={itemSearch} onChange={e => setItemSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchItem()} style={{ flex: 1, maxWidth: 250 }} />
              <button onClick={searchItem}>검색</button>
            </div>
            {itemResults.map(it => (
              <div key={it.id} onClick={() => setSelectedItem(it)} style={{
                padding: '4px 8px', cursor: 'pointer', fontSize: 12, marginBottom: 2,
                border: `1px solid ${selectedItem?.id === it.id ? 'var(--accent)' : 'var(--border)'}`,
              }}>
                <span style={{ color: GRADE_COLOR[it.grade], fontWeight: 700 }}>{it.name}</span>
                <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>[{it.grade}] ID:{it.id}</span>
              </div>
            ))}
            {selectedItem && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 12 }}>수량:</span>
                <input type="number" min={1} max={999} value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value)))} style={{ width: 60 }} />
                <button className="primary" onClick={grantItem}>지급</button>
              </div>
            )}
          </div>

          {charDetail && (
            <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--danger)' }}>아이템 회수</div>
              <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                {charDetail.inventory.map(it => (
                  <div key={it.slot_index} style={{
                    padding: '4px 8px', fontSize: 12, borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between',
                    background: revokeSlot === it.slot_index ? 'var(--bg-elev)' : 'transparent',
                  }}>
                    <div>
                      <span style={{ color: GRADE_COLOR[it.grade], fontWeight: 700 }}>{it.name}</span>
                      {it.quantity > 1 && <span style={{ color: 'var(--text-dim)' }}> ×{it.quantity}</span>}
                    </div>
                    <button onClick={() => { setRevokeSlot(it.slot_index); setRevokeQty(1); }}
                      style={{ fontSize: 10, padding: '2px 8px', color: 'var(--danger)', border: '1px solid var(--danger)' }}>회수</button>
                  </div>
                ))}
              </div>
              {revokeSlot !== null && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, padding: 8, border: '1px solid var(--danger)' }}>
                  <span style={{ fontSize: 12 }}>슬롯 #{revokeSlot} 수량:</span>
                  <input type="number" min={1} max={999} value={revokeQty} onChange={e => setRevokeQty(Math.max(1, Number(e.target.value)))} style={{ width: 60 }} />
                  <button onClick={revokeItem} style={{ color: 'var(--danger)', border: '1px solid var(--danger)', fontSize: 12 }}>확인 회수</button>
                  <button onClick={() => setRevokeSlot(null)} style={{ fontSize: 12 }}>취소</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {msg && <div style={{ padding: 8, fontSize: 13, color: 'var(--accent)', background: 'var(--bg-panel)', border: '1px solid var(--accent)' }}>{msg}</div>}
    </div>
  );
}

// ========== 전체 보상 ==========
function GrantAllTab() {
  const [gold, setGold] = useState('');
  const [exp, setExp] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!gold && !exp) return;
    if (!confirm(`모든 캐릭터에 골드 ${gold || 0}G, 경험치 ${exp || 0}을 지급합니다. 계속?`)) return;
    setBusy(true); setMsg('');
    try {
      const r = await api<{ message: string }>('/admin/grant-all', {
        method: 'POST', body: JSON.stringify({ gold: Number(gold) || 0, exp: Number(exp) || 0, reason: reason || undefined }),
      });
      setMsg(r.message); setGold(''); setExp(''); setReason('');
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
    finally { setBusy(false); }
  }
  return (
    <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', maxWidth: 400 }}>
      <div style={{ fontWeight: 700, marginBottom: 12, color: 'var(--accent)' }}>전체 캐릭터 보상 지급</div>
      <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 10 }}>모든 캐릭터에게 일괄 지급 + 우편 알림</div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>사유</div>
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="ex) 서버 점검 보상" style={{ width: '100%' }} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>골드</div>
        <input type="number" value={gold} onChange={e => setGold(e.target.value)} style={{ width: '100%' }} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>경험치</div>
        <input type="number" value={exp} onChange={e => setExp(e.target.value)} style={{ width: '100%' }} />
      </div>
      <button className="primary" onClick={submit} disabled={busy || (!gold && !exp)}>전체 지급</button>
      {msg && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--accent)' }}>{msg}</div>}
    </div>
  );
}

// ========== 유저 관리 ==========
function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  async function load(p = page, s = search) {
    const q = s ? `&search=${encodeURIComponent(s)}` : '';
    const r = await api<{ users: UserRow[]; total: number; totalPages: number }>(`/admin/users?page=${p}${q}`);
    setUsers(r.users); setTotal(r.total); setTotalPages(r.totalPages); setPage(p);
  }
  useEffect(() => { load(1); }, []);

  async function toggleBan(u: UserRow) {
    if (u.is_admin) return alert('관리자는 밴할 수 없습니다.');
    const reason = u.banned ? '' : (prompt('정지 사유 (선택)') ?? '');
    await api(`/admin/users/${u.id}/ban`, { method: 'POST', body: JSON.stringify({ banned: !u.banned, reason }) });
    load();
  }

  async function resetPassword(u: UserRow) {
    const newPassword = prompt(`'${u.username}' 새 비밀번호 입력 (4자 이상)`);
    if (!newPassword || newPassword.length < 4) return;
    if (!confirm(`'${u.username}' 비밀번호를 변경합니다. 계속?`)) return;
    try {
      await api(`/admin/users/${u.id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) });
      alert('비밀번호 변경 완료');
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input placeholder="유저명 또는 캐릭터명 검색..." value={search}
          onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1, search)}
          style={{ flex: 1, maxWidth: 300 }} />
        <button className="primary" onClick={() => load(1, search)}>검색</button>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', alignSelf: 'center' }}>총 {total}명</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {users.map(u => (
          <div key={u.id} style={{
            padding: '8px 12px', background: 'var(--bg-panel)', border: `1px solid ${u.banned ? 'var(--danger)' : 'var(--border)'}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
            opacity: u.banned ? 0.6 : 1,
          }}>
            <div>
              <span style={{ fontWeight: 700, color: u.is_admin ? 'var(--success)' : 'var(--text)' }}>{u.username}</span>
              {u.is_admin && <span style={{ fontSize: 10, color: 'var(--success)', marginLeft: 6 }}>관리자</span>}
              {u.banned && <span style={{ fontSize: 10, color: 'var(--danger)', marginLeft: 6 }}>정지됨{u.ban_reason ? `: ${u.ban_reason}` : ''}</span>}
              {u.char_names && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>{u.char_names}</div>}
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                가입: {new Date(u.created_at).toLocaleDateString('ko-KR')}
                {u.last_login_at && ` · 접속: ${new Date(u.last_login_at).toLocaleDateString('ko-KR')}`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => resetPassword(u)} style={{
                fontSize: 11, padding: '3px 10px',
                color: 'var(--accent)',
                border: '1px solid var(--accent)',
              }}>비번 변경</button>
              <button onClick={() => toggleBan(u)} style={{
                fontSize: 11, padding: '3px 10px',
                color: u.banned ? 'var(--success)' : 'var(--danger)',
                border: `1px solid ${u.banned ? 'var(--success)' : 'var(--danger)'}`,
              }}>{u.banned ? '정지 해제' : '정지'}</button>
            </div>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'center' }}>
          <button disabled={page <= 1} onClick={() => load(page - 1)}>이전</button>
          <span style={{ fontSize: 13, color: 'var(--text-dim)', padding: '6px 8px' }}>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => load(page + 1)}>다음</button>
        </div>
      )}
    </div>
  );
}

// ========== 월드이벤트 ==========
function WorldEventTab() {
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [bosses, setBosses] = useState<BossInfo[]>([]);
  const [selectedBoss, setSelectedBoss] = useState<number>(0);
  const [duration, setDuration] = useState(30);
  const [msg, setMsg] = useState('');

  async function load() {
    const r = await api<{ activeEvent: ActiveEvent | null; bosses: BossInfo[] }>('/admin/world-event/status');
    setActiveEvent(r.activeEvent); setBosses(r.bosses);
    if (r.bosses.length > 0 && !selectedBoss) setSelectedBoss(r.bosses[0].id);
  }
  useEffect(() => { load(); }, []);

  return (
    <div style={{ maxWidth: 500 }}>
      <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>현재 상태</div>
        {activeEvent ? (
          <div>
            <div style={{ fontWeight: 700, color: 'var(--danger)', fontSize: 16 }}>{activeEvent.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>HP: {activeEvent.current_hp.toLocaleString()} / {activeEvent.max_hp.toLocaleString()}</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>종료: {new Date(activeEvent.ends_at).toLocaleString('ko-KR')}</div>
            <button onClick={async () => {
              if (!confirm('강제 종료?')) return;
              try { const r = await api<{ message: string }>('/admin/world-event/end', { method: 'POST' }); setMsg(r.message); load(); } catch (e) { setMsg(String(e)); }
            }} style={{ marginTop: 10, color: 'var(--danger)', border: '1px solid var(--danger)', fontSize: 13, padding: '6px 16px' }}>강제 종료</button>
          </div>
        ) : <div style={{ color: 'var(--text-dim)' }}>진행 중인 이벤트 없음</div>}
      </div>
      {!activeEvent && (
        <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>보스 소환</div>
          <select value={selectedBoss} onChange={e => setSelectedBoss(Number(e.target.value))} style={{ width: '100%', marginBottom: 8 }}>
            {bosses.map(b => <option key={b.id} value={b.id}>{b.name} (Lv.{b.level})</option>)}
          </select>
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>지속 시간 (분): </span>
            <input type="number" min={1} max={120} value={duration} onChange={e => setDuration(Number(e.target.value))} style={{ width: 80 }} />
          </div>
          <button className="primary" onClick={async () => {
            try { const r = await api<{ message: string }>('/admin/world-event/spawn', { method: 'POST', body: JSON.stringify({ bossId: selectedBoss, durationMin: duration }) }); setMsg(r.message); load(); } catch (e) { setMsg(String(e)); }
          }}>소환</button>
        </div>
      )}
      {msg && <div style={{ marginTop: 10, padding: 8, fontSize: 13, color: 'var(--accent)', background: 'var(--bg-panel)', border: '1px solid var(--accent)' }}>{msg}</div>}
    </div>
  );
}

// ========== 시스템 공지 ==========
function SystemMsgTab() {
  const [text, setText] = useState('');
  const [channel, setChannel] = useState<'global' | 'trade'>('global');
  const [msg, setMsg] = useState('');
  return (
    <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', maxWidth: 500 }}>
      <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>시스템 메시지 전송</div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>채팅 + 전광판으로 실시간 전송</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button className={channel === 'global' ? 'primary' : ''} onClick={() => setChannel('global')} style={{ fontSize: 12, padding: '3px 10px' }}>전체</button>
        <button className={channel === 'trade' ? 'primary' : ''} onClick={() => setChannel('trade')} style={{ fontSize: 12, padding: '3px 10px' }}>거래</button>
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={500}
        placeholder="서버 점검 안내, 이벤트 공지 등..." style={{ width: '100%', fontFamily: 'inherit', marginBottom: 8 }} />
      <button className="primary" onClick={async () => {
        if (!text.trim()) return;
        try { await api('/admin/system-message', { method: 'POST', body: JSON.stringify({ text: text.trim(), channel }) }); setMsg('전송 완료!'); setText(''); } catch (e) { setMsg(String(e)); }
      }} disabled={!text.trim()}>전송</button>
      {msg && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--accent)' }}>{msg}</div>}
    </div>
  );
}

// ========== 글로벌 이벤트 ==========
interface GlobalEvent {
  id: number; name: string; exp_mult: string; gold_mult: string; drop_mult: string;
  starts_at: string; ends_at: string; is_active: boolean;
}
function GlobalEventTab() {
  const [items, setItems] = useState<GlobalEvent[]>([]);
  const [name, setName] = useState('2배 이벤트');
  const [expMult, setExpMult] = useState(2);
  const [goldMult, setGoldMult] = useState(2);
  const [dropMult, setDropMult] = useState(2);
  const [hours, setHours] = useState(3);
  const [minutes, setMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  async function load() { setItems(await api<GlobalEvent[]>('/admin/global-events')); }
  useEffect(() => { load(); }, []);
  async function start() {
    setBusy(true);
    try {
      const totalMin = hours * 60 + minutes;
      const r = await api<{ ok: boolean; endsAt: string }>('/admin/global-events', {
        method: 'POST',
        body: JSON.stringify({ name, expMult, goldMult, dropMult, durationMinutes: totalMin }),
      });
      alert(`이벤트 시작!\n종료: ${new Date(r.endsAt).toLocaleString()}`);
      load();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
    setBusy(false);
  }
  async function endNow(id: number) {
    if (!confirm('이벤트를 즉시 종료할까요?')) return;
    await api(`/admin/global-events/${id}/end`, { method: 'POST' });
    load();
  }
  return (
    <div>
      <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, color: 'var(--accent)' }}>새 이벤트 시작</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ fontSize: 12 }}>이름
            <input value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
          </label>
          <div></div>
          <label style={{ fontSize: 12 }}>EXP 배율
            <input type="number" step="0.1" min="0.1" max="10" value={expMult} onChange={e => setExpMult(Number(e.target.value))} style={{ width: '100%', marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12 }}>골드 배율
            <input type="number" step="0.1" min="0.1" max="10" value={goldMult} onChange={e => setGoldMult(Number(e.target.value))} style={{ width: '100%', marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12 }}>드랍 배율
            <input type="number" step="0.1" min="0.1" max="10" value={dropMult} onChange={e => setDropMult(Number(e.target.value))} style={{ width: '100%', marginTop: 4 }} />
          </label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12, flex: 1 }}>시간
              <input type="number" min="0" max="168" value={hours} onChange={e => setHours(Number(e.target.value))} style={{ width: '100%', marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12, flex: 1 }}>분
              <input type="number" min="0" max="59" value={minutes} onChange={e => setMinutes(Number(e.target.value))} style={{ width: '100%', marginTop: 4 }} />
            </label>
          </div>
        </div>
        <button className="primary" onClick={start} disabled={busy} style={{ marginTop: 10 }}>이벤트 시작</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(e => (
          <div key={e.id} style={{ padding: 10, background: 'var(--bg-panel)', border: `1px solid ${e.is_active ? 'var(--accent)' : 'var(--border)'}`, opacity: e.is_active ? 1 : 0.55 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 700, marginRight: 8 }}>{e.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  EXP×{e.exp_mult} 골드×{e.gold_mult} 드랍×{e.drop_mult}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>~{new Date(e.ends_at).toLocaleString()}</span>
                {e.is_active && <button onClick={() => endNow(e.id)} style={{ fontSize: 11, padding: '3px 8px' }}>즉시 종료</button>}
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <div style={{ color: 'var(--text-dim)' }}>이벤트 기록이 없습니다.</div>}
      </div>
    </div>
  );
}

// ========== 공지 관리 ==========
function AnnouncementsTab() {
  const [items, setItems] = useState<AdminAnnouncement[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<'normal' | 'important' | 'urgent'>('normal');
  async function load() { setItems(await api<AdminAnnouncement[]>('/admin/announcements')); }
  useEffect(() => { load(); }, []);
  return (
    <div>
      <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>새 공지</div>
        <input placeholder="제목" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} style={{ width: '100%', marginBottom: 8 }} />
        <textarea placeholder="내용" value={body} onChange={e => setBody(e.target.value)} rows={4} style={{ width: '100%', marginBottom: 8, fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>우선순위:</span>
          {(['normal', 'important', 'urgent'] as const).map(p => (
            <button key={p} onClick={() => setPriority(p)} className={priority === p ? 'primary' : ''} style={{ fontSize: 12, padding: '3px 10px' }}>
              {p === 'normal' ? '일반' : p === 'important' ? '중요' : '긴급'}
            </button>
          ))}
        </div>
        <button className="primary" onClick={async () => {
          if (!title || !body) return;
          await api('/admin/announcements', { method: 'POST', body: JSON.stringify({ title, body, priority }) });
          setTitle(''); setBody(''); setPriority('normal'); load();
        }} disabled={!title || !body}>등록</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(a => (
          <div key={a.id} style={{ padding: 10, background: 'var(--bg-panel)', border: '1px solid var(--border)', opacity: a.active ? 1 : 0.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 11, color: 'var(--accent)', marginRight: 8 }}>{a.priority}</span>
                <span style={{ fontWeight: 700 }}>{a.title}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={async () => { await api(`/admin/announcements/${a.id}/toggle`, { method: 'POST' }); load(); }} style={{ fontSize: 11, padding: '3px 8px' }}>{a.active ? '비활성' : '활성화'}</button>
                <button onClick={async () => { if (confirm('삭제?')) { await api(`/admin/announcements/${a.id}/delete`, { method: 'POST' }); load(); } }} style={{ fontSize: 11, padding: '3px 8px' }}>삭제</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ========== 피드백 ==========
function FeedbackTab() {
  const [items, setItems] = useState<AdminFeedback[]>([]);
  const [filter, setFilter] = useState('');
  async function load() { setItems(await api<AdminFeedback[]>(`/admin/feedback${filter ? `?status=${filter}` : ''}`)); }
  useEffect(() => { load(); }, [filter]);
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['', 'open', 'reviewing', 'resolved', 'closed'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={filter === s ? 'primary' : ''} style={{ fontSize: 12, padding: '3px 10px' }}>{s || '전체'}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(f => (
          <div key={f.id} style={{ padding: 10, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 12 }}>
                <b style={{ color: 'var(--accent)' }}>{f.category}</b>
                <span style={{ marginLeft: 10, color: 'var(--text-dim)' }}>{f.username} / {f.character_name || '-'}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{f.status}</div>
            </div>
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 6 }}>{f.text}</div>
            {f.admin_note && <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 6, borderLeft: '2px solid var(--accent)', marginBottom: 6 }}>{f.admin_note}</div>}
            <button onClick={async () => {
              const status = prompt('상태 (open|reviewing|resolved|closed)', 'reviewing');
              if (!status) return;
              const note = prompt('답변 (선택)', '');
              await api(`/admin/feedback/${f.id}/respond`, { method: 'POST', body: JSON.stringify({ status, adminNote: note }) });
              load();
            }} style={{ fontSize: 11, padding: '3px 10px' }}>답변/상태 변경</button>
          </div>
        ))}
      </div>
    </div>
  );
}
