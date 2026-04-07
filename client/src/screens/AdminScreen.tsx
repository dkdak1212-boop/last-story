import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

interface Stats {
  totalUsers: number; totalCharacters: number; active24h: number;
  totalGuilds: number; openAuctions: number; openFeedback: number;
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
  gold: string; hp: number; max_hp: number;
  stats: Record<string, number>; location: string;
  last_online_at: string; created_at: string; username: string; user_id: number;
}
interface CharDetail {
  character: CharSearchResult;
  equipped: Array<{ slot: string; item_id: number; enhance_level: number; prefix_stats: Record<string, number> | null; locked: boolean; name: string; grade: string; type: string; stats: Record<string, number> | null }>;
  inventory: Array<{ slot_index: number; item_id: number; quantity: number; enhance_level: number; prefix_stats: Record<string, number> | null; locked: boolean; name: string; grade: string; type: string; slot: string | null; stats: Record<string, number> | null; description: string }>;
  skills: Array<{ name: string; required_level: number; auto_use: boolean }>;
  guild: { guild_name: string; role: string } | null;
}
interface ItemSearchResult {
  id: number; name: string; type: string; grade: string; slot: string | null; stats: Record<string, number> | null; description: string;
}
interface BossInfo { id: number; name: string; level: number; max_hp: number; }
interface ActiveEvent { id: number; name: string; current_hp: number; max_hp: number; ends_at: string; status: string; }

type Tab = 'stats' | 'announcements' | 'feedback' | 'grant' | 'users' | 'characters' | 'items' | 'grantAll' | 'worldEvent' | 'systemMsg';

const GRADE_COLOR: Record<string, string> = {
  common: '#9a8b75', rare: '#5b8ecc', epic: '#b060cc', legendary: '#e08030',
};
const CLASS_LABEL: Record<string, string> = {
  warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적',
};
const SLOT_LABEL: Record<string, string> = {
  weapon: '무기', helm: '투구', chest: '갑옷', boots: '장화', ring: '반지', amulet: '목걸이',
};

export function AdminScreen() {
  const [tab, setTab] = useState<Tab>('stats');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'stats', label: '통계' },
    { id: 'users', label: '유저 관리' },
    { id: 'characters', label: '캐릭터 조회' },
    { id: 'items', label: '아이템 지급/회수' },
    { id: 'grantAll', label: '전체 보상' },
    { id: 'worldEvent', label: '월드이벤트' },
    { id: 'systemMsg', label: '시스템 공지' },
    { id: 'announcements', label: '공지 관리' },
    { id: 'feedback', label: '피드백' },
    { id: 'grant', label: '개인 지급' },
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
      {tab === 'users' && <UsersTab />}
      {tab === 'characters' && <CharactersTab />}
      {tab === 'items' && <ItemsTab />}
      {tab === 'grantAll' && <GrantAllTab />}
      {tab === 'worldEvent' && <WorldEventTab />}
      {tab === 'systemMsg' && <SystemMsgTab />}
      {tab === 'announcements' && <AnnouncementsTab />}
      {tab === 'feedback' && <FeedbackTab />}
      {tab === 'grant' && <GrantTab />}
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
    { label: '길드 수', value: stats.totalGuilds },
    { label: '진행 중 경매', value: stats.openAuctions },
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

// ========== 1. 유저 관리 ==========
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

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input placeholder="유저명 또는 캐릭터명 검색..." value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(1, search)}
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
              {u.char_names && (
                <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>
                  {u.char_names}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                가입: {new Date(u.created_at).toLocaleDateString('ko-KR')}
                {u.last_login_at && ` · 마지막 접속: ${new Date(u.last_login_at).toLocaleDateString('ko-KR')}`}
              </div>
            </div>
            <button onClick={() => toggleBan(u)} style={{
              fontSize: 11, padding: '3px 10px',
              color: u.banned ? 'var(--success)' : 'var(--danger)',
              border: `1px solid ${u.banned ? 'var(--success)' : 'var(--danger)'}`,
            }}>
              {u.banned ? '정지 해제' : '정지'}
            </button>
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

// ========== 2. 캐릭터 상세 조회 ==========
function CharactersTab() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<CharSearchResult[]>([]);
  const [detail, setDetail] = useState<CharDetail | null>(null);

  async function doSearch() {
    if (!search) return;
    const r = await api<{ characters: CharSearchResult[] }>(`/admin/characters/search?name=${encodeURIComponent(search)}`);
    setResults(r.characters);
    setDetail(null);
  }

  async function loadDetail(id: number) {
    const r = await api<CharDetail>(`/admin/characters/${id}/detail`);
    setDetail(r);
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

      {!detail && results.map(c => (
        <div key={c.id} onClick={() => loadDetail(c.id)} style={{
          padding: '8px 12px', background: 'var(--bg-panel)', border: '1px solid var(--border)',
          marginBottom: 4, cursor: 'pointer',
        }}>
          <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{c.name}</span>
          <span style={{ marginLeft: 8, color: 'var(--text-dim)', fontSize: 12 }}>
            Lv.{c.level} · {CLASS_LABEL[c.class_name]} · {c.username} · {Number(c.gold).toLocaleString()}G
          </span>
        </div>
      ))}

      {detail && (
        <div>
          <button onClick={() => setDetail(null)} style={{ marginBottom: 10, fontSize: 12 }}>← 목록으로</button>
          <CharDetailView detail={detail} />
        </div>
      )}
    </div>
  );
}

function CharDetailView({ detail }: { detail: CharDetail }) {
  const c = detail.character;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 기본 정보 */}
      <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--accent)' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>
          {c.name} <span style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 400 }}>({c.username})</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6, fontSize: 13 }}>
          <InfoRow label="ID" value={c.id} />
          <InfoRow label="클래스" value={CLASS_LABEL[c.class_name]} />
          <InfoRow label="레벨" value={c.level} />
          <InfoRow label="골드" value={Number(c.gold).toLocaleString() + 'G'} />
          <InfoRow label="HP" value={`${c.hp}/${c.max_hp}`} />
          <InfoRow label="위치" value={c.location} />
          <InfoRow label="마지막 접속" value={new Date(c.last_online_at).toLocaleString('ko-KR')} />
        </div>
        {c.stats && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>
            스탯: 힘{c.stats.str} 민{c.stats.dex} 지{c.stats.int} 체{c.stats.vit} 속{c.stats.spd} 치{c.stats.cri}
          </div>
        )}
        {detail.guild && (
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--accent)' }}>
            길드: {detail.guild.guild_name} ({detail.guild.role})
          </div>
        )}
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
              {e.prefix_stats && Object.keys(e.prefix_stats).length > 0 && (
                <div style={{ color: 'var(--success)', fontSize: 11 }}>
                  {Object.entries(e.prefix_stats).map(([k, v]) => `${k}+${v}`).join(' ')}
                </div>
              )}
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
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <span style={{ color: 'var(--text-dim)', marginRight: 6 }}>#{it.slot_index}</span>
                <span style={{ color: GRADE_COLOR[it.grade], fontWeight: 700 }}>{it.name}</span>
                {it.enhance_level > 0 && <span style={{ color: 'var(--accent)' }}> +{it.enhance_level}</span>}
                {it.quantity > 1 && <span style={{ color: 'var(--text-dim)' }}> ×{it.quantity}</span>}
                {it.locked && <span style={{ color: 'var(--danger)', marginLeft: 4, fontSize: 10 }}>잠금</span>}
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{it.grade} · {it.slot ? SLOT_LABEL[it.slot] : it.type}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 스킬 */}
      <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>스킬</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {detail.skills.map(s => (
            <span key={s.name} style={{
              padding: '3px 8px', fontSize: 11,
              border: `1px solid ${s.auto_use ? 'var(--accent)' : 'var(--border)'}`,
              color: s.auto_use ? 'var(--accent)' : 'var(--text-dim)',
            }}>
              {s.name} (Lv.{s.required_level}){s.auto_use ? ' ✓' : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span style={{ color: 'var(--text-dim)' }}>{label}: </span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}

// ========== 4+5. 아이템 지급/회수 ==========
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

  // 회수용
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
      {/* 캐릭터 선택 */}
      <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>1단계: 캐릭터 선택</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input placeholder="캐릭터 이름..." value={charSearch}
            onChange={e => setCharSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchChar()}
            style={{ flex: 1, maxWidth: 250 }} />
          <button onClick={searchChar}>검색</button>
        </div>
        {!selectedChar && charResults.map(c => (
          <div key={c.id} onClick={() => selectChar(c)} style={{
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
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>Lv.{selectedChar.level} (ID: {selectedChar.id})</span>
            <button onClick={() => { setSelectedChar(null); setCharDetail(null); }} style={{ fontSize: 11, padding: '2px 8px' }}>변경</button>
          </div>
        )}
      </div>

      {selectedChar && (
        <>
          {/* 아이템 지급 */}
          <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>아이템 지급</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input placeholder="아이템 이름 검색..." value={itemSearch}
                onChange={e => setItemSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchItem()}
                style={{ flex: 1, maxWidth: 250 }} />
              <button onClick={searchItem}>검색</button>
            </div>
            {itemResults.map(it => (
              <div key={it.id} onClick={() => setSelectedItem(it)} style={{
                padding: '4px 8px', cursor: 'pointer', fontSize: 12, marginBottom: 2,
                border: `1px solid ${selectedItem?.id === it.id ? 'var(--accent)' : 'var(--border)'}`,
                background: selectedItem?.id === it.id ? 'var(--bg-elev)' : 'var(--bg)',
              }}>
                <span style={{ color: GRADE_COLOR[it.grade], fontWeight: 700 }}>{it.name}</span>
                <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>[{it.grade}] {it.type} · ID:{it.id}</span>
              </div>
            ))}
            {selectedItem && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>수량:</span>
                <input type="number" min={1} max={99} value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value)))} style={{ width: 60 }} />
                <button className="primary" onClick={grantItem}>지급</button>
              </div>
            )}
          </div>

          {/* 아이템 회수 (인벤토리에서) */}
          {charDetail && (
            <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--danger)' }}>아이템 회수</div>
              <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                {charDetail.inventory.map(it => (
                  <div key={it.slot_index} style={{
                    padding: '4px 8px', fontSize: 12, borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: revokeSlot === it.slot_index ? 'var(--bg-elev)' : 'transparent',
                  }}>
                    <div>
                      <span style={{ color: GRADE_COLOR[it.grade], fontWeight: 700 }}>{it.name}</span>
                      {it.quantity > 1 && <span style={{ color: 'var(--text-dim)' }}> ×{it.quantity}</span>}
                    </div>
                    <button onClick={() => { setRevokeSlot(it.slot_index); setRevokeQty(1); }}
                      style={{ fontSize: 10, padding: '2px 8px', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
                      회수
                    </button>
                  </div>
                ))}
                {charDetail.inventory.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>인벤토리 비어있음</div>}
              </div>
              {revokeSlot !== null && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, padding: 8, border: '1px solid var(--danger)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>슬롯 #{revokeSlot} 회수 수량:</span>
                  <input type="number" min={1} max={99} value={revokeQty} onChange={e => setRevokeQty(Math.max(1, Number(e.target.value)))} style={{ width: 60 }} />
                  <button onClick={revokeItem} style={{ color: 'var(--danger)', border: '1px solid var(--danger)', fontSize: 12, padding: '3px 10px' }}>확인 회수</button>
                  <button onClick={() => setRevokeSlot(null)} style={{ fontSize: 12, padding: '3px 10px' }}>취소</button>
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

// ========== 7. 전체 보상 지급 ==========
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
        method: 'POST', body: JSON.stringify({
          gold: Number(gold) || 0, exp: Number(exp) || 0, reason: reason || undefined,
        }),
      });
      setMsg(r.message); setGold(''); setExp(''); setReason('');
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', maxWidth: 400 }}>
      <div style={{ fontWeight: 700, marginBottom: 12, color: 'var(--accent)' }}>전체 캐릭터 보상 지급</div>
      <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 10 }}>모든 캐릭터에게 일괄 지급됩니다. 우편으로 알림이 전송됩니다.</div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>사유 (선택)</div>
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

// ========== 8. 월드 이벤트 수동 ==========
function WorldEventTab() {
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [bosses, setBosses] = useState<BossInfo[]>([]);
  const [selectedBoss, setSelectedBoss] = useState<number>(0);
  const [duration, setDuration] = useState(30);
  const [msg, setMsg] = useState('');

  async function load() {
    const r = await api<{ activeEvent: ActiveEvent | null; bosses: BossInfo[] }>('/admin/world-event/status');
    setActiveEvent(r.activeEvent);
    setBosses(r.bosses);
    if (r.bosses.length > 0 && !selectedBoss) setSelectedBoss(r.bosses[0].id);
  }
  useEffect(() => { load(); }, []);

  async function spawn() {
    setMsg('');
    try {
      const r = await api<{ message: string }>('/admin/world-event/spawn', {
        method: 'POST', body: JSON.stringify({ bossId: selectedBoss, durationMin: duration }),
      });
      setMsg(r.message); load();
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  async function endEvent() {
    if (!confirm('이벤트를 강제 종료합니다. 보상은 지급되지 않습니다 (만료 처리). 계속?')) return;
    setMsg('');
    try {
      const r = await api<{ message: string }>('/admin/world-event/end', { method: 'POST' });
      setMsg(r.message); load();
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  return (
    <div style={{ maxWidth: 500 }}>
      {/* 현재 상태 */}
      <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>현재 상태</div>
        {activeEvent ? (
          <div>
            <div style={{ fontWeight: 700, color: 'var(--danger)', fontSize: 16 }}>{activeEvent.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>
              HP: {activeEvent.current_hp.toLocaleString()} / {activeEvent.max_hp.toLocaleString()}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              종료: {new Date(activeEvent.ends_at).toLocaleString('ko-KR')}
            </div>
            <button onClick={endEvent} style={{
              marginTop: 10, color: 'var(--danger)', border: '1px solid var(--danger)', fontSize: 13, padding: '6px 16px',
            }}>강제 종료</button>
          </div>
        ) : (
          <div style={{ color: 'var(--text-dim)' }}>진행 중인 이벤트 없음</div>
        )}
      </div>

      {/* 소환 */}
      {!activeEvent && (
        <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>보스 소환</div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>보스 선택</div>
            <select value={selectedBoss} onChange={e => setSelectedBoss(Number(e.target.value))} style={{ width: '100%' }}>
              {bosses.map(b => (
                <option key={b.id} value={b.id}>{b.name} (Lv.{b.level}, HP:{b.max_hp.toLocaleString()})</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>지속 시간 (분)</div>
            <input type="number" min={1} max={120} value={duration} onChange={e => setDuration(Number(e.target.value))} style={{ width: 100 }} />
          </div>
          <button className="primary" onClick={spawn}>소환</button>
        </div>
      )}

      {msg && <div style={{ marginTop: 10, padding: 8, fontSize: 13, color: 'var(--accent)', background: 'var(--bg-panel)', border: '1px solid var(--accent)' }}>{msg}</div>}
    </div>
  );
}

// ========== 9. 시스템 공지 (실시간 채팅) ==========
function SystemMsgTab() {
  const [text, setText] = useState('');
  const [channel, setChannel] = useState<'global' | 'trade'>('global');
  const [msg, setMsg] = useState('');

  async function send() {
    if (!text.trim()) return;
    setMsg('');
    try {
      await api('/admin/system-message', { method: 'POST', body: JSON.stringify({ text: text.trim(), channel }) });
      setMsg('전송 완료!');
      setText('');
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  return (
    <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', maxWidth: 500 }}>
      <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>시스템 메시지 전송</div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
        채팅에 [시스템] 이름으로 메시지가 실시간 전송됩니다.
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>채널</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={channel === 'global' ? 'primary' : ''} onClick={() => setChannel('global')} style={{ fontSize: 12, padding: '3px 10px' }}>전체</button>
          <button className={channel === 'trade' ? 'primary' : ''} onClick={() => setChannel('trade')} style={{ fontSize: 12, padding: '3px 10px' }}>거래</button>
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>메시지</div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={500}
          placeholder="서버 점검 안내, 이벤트 공지 등..."
          style={{ width: '100%', fontFamily: 'inherit' }} />
      </div>
      <button className="primary" onClick={send} disabled={!text.trim()}>전송</button>
      {msg && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--accent)' }}>{msg}</div>}
    </div>
  );
}

// ========== 기존: 공지 관리 ==========
function AnnouncementsTab() {
  const [items, setItems] = useState<AdminAnnouncement[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<'normal' | 'important' | 'urgent'>('normal');

  async function load() { setItems(await api<AdminAnnouncement[]>('/admin/announcements')); }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!title || !body) return;
    await api('/admin/announcements', { method: 'POST', body: JSON.stringify({ title, body, priority }) });
    setTitle(''); setBody(''); setPriority('normal'); load();
  }
  async function toggle(id: number) { await api(`/admin/announcements/${id}/toggle`, { method: 'POST' }); load(); }
  async function del(id: number) {
    if (!confirm('삭제하시겠습니까?')) return;
    await api(`/admin/announcements/${id}/delete`, { method: 'POST' }); load();
  }

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
        <button className="primary" onClick={create} disabled={!title || !body}>등록</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(a => (
          <div key={a.id} style={{
            padding: 10, background: 'var(--bg-panel)', border: '1px solid var(--border)',
            opacity: a.active ? 1 : 0.5,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 11, color: 'var(--accent)', marginRight: 8 }}>{a.priority}</span>
                <span style={{ fontWeight: 700 }}>{a.title}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => toggle(a.id)} style={{ fontSize: 11, padding: '3px 8px' }}>{a.active ? '비활성' : '활성화'}</button>
                <button onClick={() => del(a.id)} style={{ fontSize: 11, padding: '3px 8px' }}>삭제</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ========== 기존: 피드백 ==========
function FeedbackTab() {
  const [items, setItems] = useState<AdminFeedback[]>([]);
  const [filter, setFilter] = useState('');
  async function load() {
    const q = filter ? `?status=${filter}` : '';
    setItems(await api<AdminFeedback[]>(`/admin/feedback${q}`));
  }
  useEffect(() => { load(); }, [filter]);

  async function respond(id: number) {
    const status = prompt('상태 (open|reviewing|resolved|closed)', 'reviewing');
    if (!status) return;
    const note = prompt('답변 (선택)', '');
    await api(`/admin/feedback/${id}/respond`, { method: 'POST', body: JSON.stringify({ status, adminNote: note }) });
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['', 'open', 'reviewing', 'resolved', 'closed'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={filter === s ? 'primary' : ''} style={{ fontSize: 12, padding: '3px 10px' }}>
            {s || '전체'}
          </button>
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
            <button onClick={() => respond(f.id)} style={{ fontSize: 11, padding: '3px 10px' }}>답변/상태 변경</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ========== 기존: 개인 지급 ==========
function GrantTab() {
  const [charId, setCharId] = useState('');
  const [gold, setGold] = useState('');
  const [exp, setExp] = useState('');
  const [msg, setMsg] = useState('');
  async function grant() {
    const body: Record<string, number> = { characterId: Number(charId) };
    if (gold) body.gold = Number(gold);
    if (exp) body.exp = Number(exp);
    try {
      await api('/admin/grant', { method: 'POST', body: JSON.stringify(body) });
      setMsg('지급 완료'); setCharId(''); setGold(''); setExp('');
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }
  return (
    <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', maxWidth: 400 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>캐릭터 ID</div>
        <input value={charId} onChange={e => setCharId(e.target.value)} style={{ width: '100%' }} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>골드 (선택)</div>
        <input type="number" value={gold} onChange={e => setGold(e.target.value)} style={{ width: '100%' }} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>경험치 (선택)</div>
        <input type="number" value={exp} onChange={e => setExp(e.target.value)} style={{ width: '100%' }} />
      </div>
      <button className="primary" onClick={grant} disabled={!charId}>지급</button>
      {msg && <div style={{ marginTop: 8, fontSize: 13 }}>{msg}</div>}
    </div>
  );
}
