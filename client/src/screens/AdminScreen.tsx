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

type Tab = 'stats' | 'characters' | 'grant' | 'items' | 'grantPro' | 'grantAll' | 'users' | 'audit' | 'worldEvent' | 'globalEvent' | 'systemMsg' | 'announcements' | 'feedback';

const GRADE_COLOR: Record<string, string> = { common: '#9a8b75', rare: '#5b8ecc', epic: '#b060cc', legendary: '#e08030' };
const CLASS_LABEL: Record<string, string> = { warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적', summoner: '소환사' };
const SLOT_LABEL: Record<string, string> = { weapon: '무기', helm: '투구', chest: '갑옷', boots: '장화', ring: '반지', amulet: '목걸이' };

export function AdminScreen() {
  const [tab, setTab] = useState<Tab>('stats');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'stats', label: '통계' },
    { id: 'characters', label: '캐릭터 관리' },
    { id: 'grant', label: '개인 지급' },
    { id: 'items', label: '아이템 지급/회수' },
    { id: 'grantPro', label: '아이템 지급+' },
    { id: 'grantAll', label: '전체 보상' },
    { id: 'users', label: '유저 관리' },
    { id: 'audit', label: '유저 감사' },
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
      {tab === 'grantPro' && <GrantProTab />}
      {tab === 'grantAll' && <GrantAllTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'audit' && <AuditTab />}
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
  const [killStats, setKillStats] = useState<{
    character: { id: number; name: string; level: number; class_name: string };
    stats: {
      inCombat: boolean;
      fieldName?: string;
      monsterName?: string;
      recentKillTimes: number[];
      avg: number;
      last: number;
      count: number;
      currentMonsterElapsedSec: number;
    } | null;
  } | null>(null);

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

  async function loadKillStats() {
    if (!detail) return;
    try {
      const r = await api<typeof killStats>(`/admin/characters/${detail.character.id}/kill-stats`);
      setKillStats(r);
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
                <button onClick={loadKillStats}>킬 통계</button>
                {detail.inCombat && <button onClick={kickCombat} style={{ color: 'var(--danger)', border: '1px solid var(--danger)' }}>전투 강제종료</button>}
                <button onClick={clearInventory} style={{ color: 'var(--danger)', border: '1px solid var(--danger)' }}>인벤 초기화</button>
              </div>
              {killStats && killStats.character.id === detail.character.id && (
                <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-dark)', border: '1px solid var(--border)', fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, color: 'var(--accent)' }}>실시간 킬 통계</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={loadKillStats} style={{ fontSize: 11, padding: '2px 8px' }}>새로고침</button>
                      <button onClick={() => setKillStats(null)} style={{ fontSize: 11, padding: '2px 8px' }}>닫기</button>
                    </div>
                  </div>
                  {!killStats.stats || !killStats.stats.inCombat ? (
                    <div style={{ color: 'var(--text-dim)' }}>전투 중이 아닙니다 (인메모리 세션 없음)</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                      <div><div style={{ color: 'var(--text-dim)', fontSize: 11 }}>필드</div><div>{killStats.stats.fieldName || '—'}</div></div>
                      <div><div style={{ color: 'var(--text-dim)', fontSize: 11 }}>현재 몬스터</div><div>{killStats.stats.monsterName || '—'}</div></div>
                      <div><div style={{ color: 'var(--text-dim)', fontSize: 11 }}>평균 처치</div><div style={{ color: 'var(--accent)', fontWeight: 700 }}>{killStats.stats.avg}초</div></div>
                      <div><div style={{ color: 'var(--text-dim)', fontSize: 11 }}>마지막 처치</div><div>{killStats.stats.last}초</div></div>
                      <div><div style={{ color: 'var(--text-dim)', fontSize: 11 }}>표본 수</div><div>{killStats.stats.count}킬</div></div>
                      <div><div style={{ color: 'var(--text-dim)', fontSize: 11 }}>현 몬스터 경과</div><div>{killStats.stats.currentMonsterElapsedSec}초</div></div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ color: 'var(--text-dim)', fontSize: 11, marginBottom: 4 }}>최근 10킬 (초)</div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {killStats.stats.recentKillTimes.length === 0
                            ? <span style={{ color: 'var(--text-dim)' }}>—</span>
                            : killStats.stats.recentKillTimes.map((t, i) => (
                                <span key={i} style={{ padding: '2px 6px', background: 'var(--bg-panel)', border: '1px solid var(--border)', fontSize: 11 }}>{t}</span>
                              ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
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

  async function ipBan(u: UserRow) {
    if (u.is_admin) return alert('관리자는 차단할 수 없습니다.');
    const reason = prompt(`'${u.username}' IP 차단 사유 (가입 IP 영구 차단)`, '버그 악용');
    if (!reason) return;
    if (!confirm(`'${u.username}' 계정 정지 + 가입 IP 영구 차단 합니다. 계속?`)) return;
    try {
      const r = await api<{ bannedUser: string; blockedIp: string | null }>(`/admin/users/${u.id}/ip-ban`, { method: 'POST', body: JSON.stringify({ reason }) });
      alert(`완료\n계정 정지: ${r.bannedUser}\nIP 차단: ${r.blockedIp ?? '(IP 정보 없음)'}`);
      load();
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
              {!u.is_admin && (
                <button onClick={() => ipBan(u)} style={{
                  fontSize: 11, padding: '3px 10px',
                  color: '#ff4444',
                  border: '1px solid #ff4444',
                }}>IP 차단</button>
              )}
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

// ========== 유저 감사 ==========
interface AuditFlag { severity: 'low' | 'med' | 'high'; label: string; detail: string; }
interface AuditResult {
  character: {
    id: number; userId: number; username: string; name: string; className: string;
    level: number; exp: number; currentGold: number; totalKills: number; totalGoldEarned: number;
    maxHp: number; hp: number; createdAt: string; lastOnlineAt: string | null; ageDays: number;
    registeredIp: string | null; banned: boolean;
  };
  inventory: { total: number; legendary: number; epic: number; rare: number; maxEnh: number };
  equipped: { legendary: number; epic: number; maxEnh: number };
  enhance: { total: number; success: number; destroyed: number; successRate: number };
  auctions: { listed: number };
  flags: AuditFlag[];
  suspicionScore: number;
}
interface BulkAuditItem {
  characterId: number; userId: number; username: string; characterName: string;
  className: string; level: number; currentGold: number; totalKills: number;
  totalGoldEarned: number; ageDays: number; banned: boolean; registeredIp: string | null;
  flags: { severity: 'low' | 'med' | 'high'; label: string }[];
  suspicionScore: number;
}

function AuditTab() {
  const [cidInput, setCidInput] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ total: number; suspicious: number; ranked: BulkAuditItem[] } | null>(null);

  async function audit() {
    const cid = Number(cidInput);
    if (!cid) { setErr('캐릭터 ID를 입력하세요'); return; }
    setLoading(true); setErr(''); setResult(null);
    try {
      const r = await api<AuditResult>(`/admin/audit/character/${cid}`);
      setResult(r);
    } catch (e) { setErr(e instanceof Error ? e.message : '실패'); }
    setLoading(false);
  }

  async function scanAll() {
    setBulkLoading(true); setErr('');
    try {
      const r = await api<{ total: number; suspicious: number; ranked: BulkAuditItem[] }>('/admin/audit/all');
      setBulkResult(r);
    } catch (e) { setErr(e instanceof Error ? e.message : '실패'); }
    setBulkLoading(false);
  }

  const sevColor = (s: 'low' | 'med' | 'high') => s === 'high' ? '#ff4444' : s === 'med' ? '#ffaa00' : '#888';

  return (
    <div>
      <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          placeholder="캐릭터 ID 입력"
          value={cidInput}
          onChange={e => setCidInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && audit()}
          style={{ flex: 1, maxWidth: 200 }}
        />
        <button className="primary" onClick={audit} disabled={loading}>개별 감사</button>
        <span style={{ width: 1, height: 24, background: 'var(--border)' }}></span>
        <button onClick={scanAll} disabled={bulkLoading} style={{ background: '#2a1a00', color: '#ffcc00', border: '1px solid #ffcc00' }}>
          {bulkLoading ? '스캔 중...' : '🔍 전체 스캔 (의심 점수 순)'}
        </button>
      </div>
      {err && <div style={{ color: 'var(--danger)', marginBottom: 10 }}>{err}</div>}

      {bulkResult && (
        <div style={{ marginBottom: 14, padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div style={{ marginBottom: 10, fontSize: 13 }}>
            전체 <b>{bulkResult.total}</b>명 중 의심 캐릭터 <b style={{ color: '#ffcc00' }}>{bulkResult.suspicious}</b>명 (상위 100명 표시)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 500, overflowY: 'auto' }}>
            {bulkResult.ranked.map(item => (
              <div key={item.characterId}
                onClick={() => { setCidInput(String(item.characterId)); audit(); }}
                style={{
                  padding: '8px 10px', background: 'var(--bg)',
                  border: `1px solid ${item.suspicionScore >= 6 ? '#ff4444' : '#ffaa00'}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  opacity: item.banned ? 0.5 : 1,
                }}
                title="클릭해서 상세 보기"
              >
                <div style={{
                  minWidth: 32, height: 32, borderRadius: 4,
                  background: item.suspicionScore >= 6 ? '#ff4444' : '#ffaa00',
                  color: '#000', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {item.suspicionScore}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {item.characterName} <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(ID:{item.characterId} · {item.username})</span>
                    {item.banned && <span style={{ color: '#ff4444', marginLeft: 6, fontSize: 10 }}>[정지됨]</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    Lv.{item.level} {item.className} · {item.currentGold.toLocaleString()}G · {item.totalKills.toLocaleString()}킬 · {item.ageDays}일
                  </div>
                  <div style={{ fontSize: 10, color: '#ffaa00', marginTop: 2 }}>
                    {item.flags.map(f => f.label).join(' · ')}
                  </div>
                </div>
              </div>
            ))}
            {bulkResult.ranked.length === 0 && (
              <div style={{ color: 'var(--success)', textAlign: 'center', padding: 20 }}>의심스러운 캐릭터가 없습니다 ✓</div>
            )}
          </div>
        </div>
      )}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 의심 점수 */}
          <div style={{ padding: 14, background: 'var(--bg-panel)', border: `2px solid ${result.suspicionScore >= 6 ? '#ff4444' : result.suspicionScore >= 3 ? '#ffaa00' : '#4a4'}` }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>의심 점수</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: result.suspicionScore >= 6 ? '#ff4444' : result.suspicionScore >= 3 ? '#ffaa00' : '#4a4' }}>
              {result.suspicionScore}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {result.suspicionScore === 0 ? '문제 없음' : result.suspicionScore >= 6 ? '높음 — 조사 권장' : result.suspicionScore >= 3 ? '중간' : '낮음'}
            </div>
          </div>

          {/* 의심 플래그 */}
          {result.flags.length > 0 && (
            <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>의심 항목</div>
              {result.flags.map((f, i) => (
                <div key={i} style={{ padding: 8, marginBottom: 4, background: 'var(--bg)', borderLeft: `3px solid ${sevColor(f.severity)}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: sevColor(f.severity) }}>
                    [{f.severity.toUpperCase()}] {f.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{f.detail}</div>
                </div>
              ))}
            </div>
          )}

          {/* 캐릭터 정보 */}
          <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>캐릭터 정보</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
              <div>이름: <b>{result.character.name}</b></div>
              <div>유저: <b>{result.character.username}</b></div>
              <div>직업: {result.character.className}</div>
              <div>레벨: <b>{result.character.level}</b></div>
              <div>가입: {new Date(result.character.createdAt).toLocaleDateString('ko-KR')} ({result.character.ageDays}일 경과)</div>
              <div>마지막 접속: {result.character.lastOnlineAt ? new Date(result.character.lastOnlineAt).toLocaleString('ko-KR') : '—'}</div>
              <div>현재 골드: <b>{result.character.currentGold.toLocaleString()}G</b></div>
              <div>누적 골드: {result.character.totalGoldEarned.toLocaleString()}G</div>
              <div>총 처치: <b>{result.character.totalKills.toLocaleString()}</b></div>
              <div>HP: {result.character.hp}/{result.character.maxHp}</div>
              <div>가입 IP: <code style={{ fontSize: 11 }}>{result.character.registeredIp || '없음'}</code></div>
              <div>정지 여부: {result.character.banned ? '🚫 정지됨' : '✓ 정상'}</div>
            </div>
          </div>

          {/* 인벤토리/장비 */}
          <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>장비/인벤토리</div>
            <div style={{ fontSize: 12 }}>
              인벤토리: {result.inventory.total}개 (전설 {result.inventory.legendary}, 영웅 {result.inventory.epic}, 정예 {result.inventory.rare})<br />
              장착: 전설 {result.equipped.legendary}, 영웅 {result.equipped.epic}<br />
              최고 강화: 인벤 +{result.inventory.maxEnh}, 장착 +{result.equipped.maxEnh}
            </div>
          </div>

          {/* 강화 통계 */}
          <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>강화 로그 (10강 이상)</div>
            <div style={{ fontSize: 12 }}>
              총 시도 {result.enhance.total}회 · 성공 {result.enhance.success}회 ({result.enhance.successRate}%) · 파괴 {result.enhance.destroyed}회
            </div>
          </div>

          {/* 거래소 */}
          <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>거래소 활동</div>
            <div style={{ fontSize: 12 }}>등록한 매물: {result.auctions.listed}개</div>
          </div>
        </div>
      )}
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

// ========== 아이템 지급+ ==========
interface FullItem {
  id: number; name: string; type: string; grade: string; slot: string | null;
  required_level: number; stats: Record<string, number> | null;
  unique_prefix_stats: Record<string, number> | null; description: string; stack_size: number;
}
interface PrefixDef {
  id: number; name: string; tier: number; stat_key: string; min_val: number; max_val: number;
}
interface SelectedPrefix {
  id: number | null; value: number;
}

const SLOT_GROUPS: { id: string; label: string; slots: string[] }[] = [
  { id: 'all', label: '전체', slots: [] },
  { id: 'weapon', label: '무기', slots: ['weapon'] },
  { id: 'armor', label: '방어구', slots: ['helm', 'chest', 'boots', 'gloves', 'pants'] },
  { id: 'accessory', label: '장신구', slots: ['ring', 'amulet', 'earring', 'necklace'] },
  { id: 'other', label: '기타', slots: [] },
];
const GRADE_FILTERS = ['all', 'common', 'uncommon', 'rare', 'epic', 'unique'];
const LEVEL_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '1-10', min: 1, max: 10 },
  { label: '11-20', min: 11, max: 20 },
  { label: '21-30', min: 21, max: 30 },
  { label: '31-40', min: 31, max: 40 },
  { label: '41-50', min: 41, max: 50 },
  { label: '51-60', min: 51, max: 60 },
  { label: '61-70', min: 61, max: 70 },
  { label: '71-80', min: 71, max: 80 },
  { label: '81-100', min: 81, max: 100 },
];
const GRADE_COLOR_PRO: Record<string, string> = {
  common: '#9a9a9a', uncommon: '#5cb85c', rare: '#5b8ecc', epic: '#b060cc',
  legendary: '#e08030', unique: '#ffaa00',
};

function GrantProTab() {
  const [charSearch, setCharSearch] = useState('');
  const [charResults, setCharResults] = useState<CharSearchResult[]>([]);
  const [selectedChar, setSelectedChar] = useState<CharSearchResult | null>(null);

  const [items, setItems] = useState<FullItem[]>([]);
  const [prefixes, setPrefixes] = useState<PrefixDef[]>([]);

  const [slotFilter, setSlotFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [selectedItem, setSelectedItem] = useState<FullItem | null>(null);
  const [enhanceLevel, setEnhanceLevel] = useState(0);
  const [quality, setQuality] = useState(0);
  const [selectedPrefixes, setSelectedPrefixes] = useState<SelectedPrefix[]>([
    { id: null, value: 0 }, { id: null, value: 0 }, { id: null, value: 0 },
  ]);

  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ items: FullItem[] }>('/admin/items/all').then(r => setItems(r.items));
    api<{ prefixes: PrefixDef[] }>('/admin/prefixes/all').then(r => setPrefixes(r.prefixes));
  }, []);

  async function searchChar() {
    if (!charSearch) return;
    const r = await api<{ characters: CharSearchResult[] }>(`/admin/characters/search?name=${encodeURIComponent(charSearch)}`);
    setCharResults(r.characters);
  }

  function selectItem(it: FullItem) {
    setSelectedItem(it);
    setEnhanceLevel(0);
    setQuality(0);
    setSelectedPrefixes([{ id: null, value: 0 }, { id: null, value: 0 }, { id: null, value: 0 }]);
  }

  function setPrefixSlot(idx: number, prefixId: number | null) {
    const next = [...selectedPrefixes];
    if (prefixId === null) {
      next[idx] = { id: null, value: 0 };
    } else {
      const def = prefixes.find(p => p.id === prefixId);
      next[idx] = { id: prefixId, value: def ? Math.round((def.min_val + def.max_val) / 2) : 0 };
    }
    setSelectedPrefixes(next);
  }
  function setPrefixValue(idx: number, value: number) {
    const next = [...selectedPrefixes];
    next[idx] = { ...next[idx], value };
    setSelectedPrefixes(next);
  }
  function randomPrefixValue(idx: number) {
    const sp = selectedPrefixes[idx];
    if (sp.id === null) return;
    const def = prefixes.find(p => p.id === sp.id);
    if (!def) return;
    const v = Math.floor(Math.random() * (def.max_val - def.min_val + 1)) + def.min_val;
    setPrefixValue(idx, v);
  }

  async function grant() {
    if (!selectedChar || !selectedItem) return;
    setMsg('');
    setLoading(true);
    try {
      const body = {
        characterId: selectedChar.id,
        itemId: selectedItem.id,
        enhanceLevel,
        quality,
        prefixes: selectedPrefixes.filter(p => p.id !== null).map(p => ({ id: p.id!, value: p.value })),
      };
      const r = await api<{ message: string }>('/admin/grant-item-pro', { method: 'POST', body: JSON.stringify(body) });
      setMsg(r.message);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '실패');
    } finally {
      setLoading(false);
    }
  }

  const filtered = items.filter(it => {
    if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (gradeFilter !== 'all' && it.grade !== gradeFilter) return false;
    if (slotFilter !== 'all') {
      if (slotFilter === 'other') return !it.slot;
      const grp = SLOT_GROUPS.find(g => g.id === slotFilter);
      if (!grp || !it.slot || !grp.slots.includes(it.slot)) return false;
    }
    return true;
  });

  const grouped: Record<string, FullItem[]> = {};
  for (const b of LEVEL_BUCKETS) grouped[b.label] = [];
  for (const it of filtered) {
    const lv = it.required_level || 1;
    const bucket = LEVEL_BUCKETS.find(b => lv >= b.min && lv <= b.max) ?? LEVEL_BUCKETS[LEVEL_BUCKETS.length - 1];
    grouped[bucket.label].push(it);
  }

  const usedKeys = new Set(
    selectedPrefixes
      .map(sp => sp.id)
      .filter((id): id is number => id !== null)
      .map(id => prefixes.find(p => p.id === id)?.stat_key)
      .filter((k): k is string => !!k)
  );

  return (
    <div>
      <div style={{ padding: 12, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>1. 캐릭터 선택</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <input placeholder="캐릭터 이름..." value={charSearch} onChange={e => setCharSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchChar()}
            style={{ flex: '1 1 200px', minWidth: 150 }} />
          <button onClick={searchChar}>검색</button>
        </div>
        {!selectedChar && charResults.map(c => (
          <div key={c.id} onClick={() => setSelectedChar(c)} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, marginBottom: 2, border: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{c.name}</span>
            <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>Lv.{c.level} · {c.username}</span>
          </div>
        ))}
        {selectedChar && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{selectedChar.name}</span>
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>Lv.{selectedChar.level}</span>
            <button onClick={() => setSelectedChar(null)} style={{ fontSize: 11 }}>변경</button>
          </div>
        )}
      </div>

      {selectedChar && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
          <div style={{ padding: 12, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>2. 아이템 선택</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {SLOT_GROUPS.map(g => (
                <button key={g.id} className={slotFilter === g.id ? 'primary' : ''}
                  onClick={() => setSlotFilter(g.id)} style={{ fontSize: 11, padding: '4px 10px' }}>{g.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {GRADE_FILTERS.map(g => (
                <button key={g} className={gradeFilter === g ? 'primary' : ''}
                  onClick={() => setGradeFilter(g)}
                  style={{ fontSize: 11, padding: '4px 10px', color: g !== 'all' ? GRADE_COLOR_PRO[g] : undefined }}>
                  {g === 'all' ? '전체' : g}
                </button>
              ))}
            </div>
            <input placeholder="이름 검색..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>

          <div style={{ padding: 8, background: 'var(--bg-panel)', border: '1px solid var(--border)', maxHeight: '50vh', overflowY: 'auto' }}>
            {LEVEL_BUCKETS.map(b => {
              const list = grouped[b.label];
              if (list.length === 0) return null;
              const isCol = collapsed[b.label];
              return (
                <div key={b.label} style={{ marginBottom: 10 }}>
                  <div onClick={() => setCollapsed(c => ({ ...c, [b.label]: !c[b.label] }))}
                    style={{ cursor: 'pointer', padding: '6px 10px', background: 'var(--bg)', fontSize: 12, fontWeight: 700, color: 'var(--accent)', userSelect: 'none' }}>
                    [{isCol ? '+' : '−'}] Lv.{b.label} ({list.length}개)
                  </div>
                  {!isCol && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 4, padding: 4 }}>
                      {list.map(it => (
                        <div key={it.id} onClick={() => selectItem(it)} style={{
                          padding: '6px 8px', cursor: 'pointer', fontSize: 11,
                          border: `1px solid ${selectedItem?.id === it.id ? 'var(--accent)' : 'var(--border)'}`,
                          background: selectedItem?.id === it.id ? 'rgba(255,200,80,0.1)' : 'var(--bg)',
                        }}>
                          <div style={{ color: GRADE_COLOR_PRO[it.grade] || '#ccc', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {it.name}
                          </div>
                          <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>
                            Lv.{it.required_level} {it.slot ? `· ${it.slot}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)' }}>결과 없음</div>}
          </div>

          {selectedItem && (
            <div style={{ padding: 12, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>3. 옵션 설정</div>
              <div style={{ marginBottom: 10, padding: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div style={{ color: GRADE_COLOR_PRO[selectedItem.grade], fontWeight: 700 }}>{selectedItem.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Lv.{selectedItem.required_level} · {selectedItem.grade} · {selectedItem.slot || selectedItem.type}
                </div>
                {selectedItem.stats && (
                  <div style={{ fontSize: 11, marginTop: 4 }}>
                    {Object.entries(selectedItem.stats).map(([k, v]) => `${k}: ${v}`).join(', ')}
                  </div>
                )}
                {selectedItem.unique_prefix_stats && (
                  <div style={{ fontSize: 11, marginTop: 4, color: '#ffaa00' }}>
                    [유니크] {Object.entries(selectedItem.unique_prefix_stats).map(([k, v]) => `${k}: ${v}`).join(', ')}
                  </div>
                )}
              </div>

              {selectedItem.slot && (
                <>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 12 }}>강화:
                      <input type="number" min={0} max={30} value={enhanceLevel}
                        onChange={e => setEnhanceLevel(Math.max(0, Math.min(30, Number(e.target.value))))}
                        style={{ width: 60, marginLeft: 6 }} />
                    </label>
                    <label style={{ fontSize: 12 }}>품질:
                      <input type="number" min={0} max={100} value={quality}
                        onChange={e => setQuality(Math.max(0, Math.min(100, Number(e.target.value))))}
                        style={{ width: 60, marginLeft: 6 }} />
                    </label>
                  </div>

                  {[0, 1, 2].map(idx => {
                    const sp = selectedPrefixes[idx];
                    const def = sp.id !== null ? prefixes.find(p => p.id === sp.id) : null;
                    return (
                      <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, width: 40 }}>접두 {idx + 1}</span>
                        <select value={sp.id ?? ''} onChange={e => setPrefixSlot(idx, e.target.value ? Number(e.target.value) : null)}
                          style={{ flex: '1 1 180px', minWidth: 140, fontSize: 11 }}>
                          <option value="">— 없음 —</option>
                          {prefixes.map(p => {
                            const isDup = !!p.stat_key && usedKeys.has(p.stat_key) && p.id !== sp.id;
                            return (
                              <option key={p.id} value={p.id} disabled={isDup}>
                                T{p.tier} {p.name} ({p.stat_key} {p.min_val}~{p.max_val})
                              </option>
                            );
                          })}
                        </select>
                        {def && (
                          <>
                            <input type="number" value={sp.value} onChange={e => setPrefixValue(idx, Number(e.target.value))}
                              style={{ width: 70, fontSize: 11 }} />
                            <button onClick={() => randomPrefixValue(idx)} style={{ fontSize: 10, padding: '2px 6px' }}>랜덤</button>
                            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{def.min_val}~{def.max_val}</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="primary" disabled={loading} onClick={grant}>
                  {loading ? '지급 중...' : '지급'}
                </button>
                {msg && <span style={{ fontSize: 12, color: 'var(--accent)' }}>{msg}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
