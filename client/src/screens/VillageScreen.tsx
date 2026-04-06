import { useEffect, useState } from 'react';
import { useCharacterStore } from '../stores/characterStore';
import { api } from '../api/client';

interface Announcement {
  id: number;
  title: string;
  body: string;
  priority: string;
  createdAt: string;
}

interface DropLog {
  characterName: string;
  itemName: string;
  itemGrade: string;
  prefixCount: number;
  createdAt: string;
}

const GRADE_COLOR: Record<string, string> = {
  common: '#9a8b75', rare: '#5b8ecc', epic: '#b060cc', legendary: '#e08030',
};

export function VillageScreen() {
  const refresh = useCharacterStore((s) => s.refreshActive);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dropLog, setDropLog] = useState<DropLog[]>([]);

  useEffect(() => {
    refresh();
    api<Announcement[]>('/announcements').then(setAnnouncements).catch(() => {});
    api<DropLog[]>('/drop-log').then(setDropLog).catch(() => {});
  }, [refresh]);

  return (
    <div>
      {/* 공지 */}
      {announcements.length > 0 && (
        <div style={{
          marginBottom: 20, padding: 16,
          background: 'linear-gradient(135deg, rgba(201,162,77,0.08) 0%, rgba(201,162,77,0.02) 100%)',
          border: '2px solid var(--accent)',
          borderRadius: 6,
          boxShadow: '0 2px 12px rgba(201,162,77,0.15)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
            paddingBottom: 10, borderBottom: '1px solid var(--accent-dim)',
          }}>
            <span style={{ fontSize: 22 }}>&#9733;</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--accent)', letterSpacing: 1 }}>공지사항</span>
          </div>
          {announcements.slice(0, 3).map((a, i) => (
            <div key={a.id} style={{
              padding: '10px 14px', marginBottom: i < 2 ? 8 : 0,
              background: a.priority === 'urgent' ? 'rgba(192,90,74,0.12)' : 'rgba(201,162,77,0.06)',
              border: `1px solid ${a.priority === 'urgent' ? 'var(--danger)' : 'var(--accent-dim)'}`,
              borderLeft: `4px solid ${a.priority === 'urgent' ? 'var(--danger)' : 'var(--accent)'}`,
              borderRadius: 4,
            }}>
              <div style={{
                fontWeight: 700, fontSize: 14, marginBottom: 4,
                color: a.priority === 'urgent' ? 'var(--danger)' : 'var(--accent)',
              }}>
                {a.priority === 'urgent' ? '[ 긴급 ] ' : ''}{a.title}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{a.body}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                {new Date(a.createdAt).toLocaleDateString('ko-KR')}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 축하 명단 */}
      {dropLog.length > 0 && (
        <div style={{
          marginBottom: 16, padding: 14,
          background: 'var(--bg-panel)', border: '1px solid var(--accent)',
        }}>
          <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 10, fontSize: 14 }}>
            축하합니다!
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {dropLog.map((d, i) => {
              const time = new Date(d.createdAt);
              const timeStr = `${time.getMonth() + 1}/${time.getDate()} ${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
              const reason = d.itemGrade === 'legendary' && d.prefixCount >= 3
                ? '전설 3옵'
                : d.itemGrade === 'legendary'
                ? '전설'
                : `${d.prefixCount}옵`;
              return (
                <div key={i} style={{
                  padding: '5px 0', fontSize: 13,
                  borderBottom: i < dropLog.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <span style={{ color: 'var(--text-dim)', fontSize: 11, marginRight: 8 }}>{timeStr}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{d.characterName}</span>
                  <span style={{ color: 'var(--text-dim)' }}> 님이 </span>
                  <span style={{ color: GRADE_COLOR[d.itemGrade] || 'var(--text)', fontWeight: 700 }}>{d.itemName}</span>
                  <span style={{ color: 'var(--text-dim)' }}> 획득! </span>
                  <span style={{
                    fontSize: 11, padding: '1px 6px',
                    background: d.itemGrade === 'legendary' ? 'rgba(224,128,48,0.15)' : 'rgba(176,96,204,0.15)',
                    color: d.itemGrade === 'legendary' ? '#e08030' : '#b060cc',
                    border: `1px solid ${d.itemGrade === 'legendary' ? '#e08030' : '#b060cc'}`,
                  }}>{reason}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 게임 팁 */}
      <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-dim)' }}>
        <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 10, fontSize: 14 }}>게임 팁</div>

        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>전투</div>
        <div>· 전투는 자동으로 진행되며, 스킬과 포션도 자동으로 사용됩니다</div>
        <div>· 사망 시 패널티 없이 HP/MP 50% 회복 후 마을로 귀환합니다</div>
        <div>· 포션 자동 사용 HP/MP % 기준을 전투 화면에서 설정할 수 있습니다</div>
        <div style={{ marginBottom: 10 }}>· 오프라인 중에도 사냥이 진행됩니다 (최대 24시간, 효율 90%)</div>

        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>스탯</div>
        <div>· 힘 → 물리 공격력 | 민첩 → 회피/명중 | 지능 → 마법 공격력/MP</div>
        <div>· 체력 → 방어력/HP | 스피드 → 행동 속도 | 치명타 → 크리 확률(1.5배)</div>
        <div style={{ marginBottom: 10 }}>· 마법사/사제/드루이드는 지능 기반, 나머지는 힘 기반 데미지</div>

        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>장비</div>
        <div>· 장비 드롭 시 랜덤 접두사가 부여됩니다 (1옵 90%, 2옵 9%, 3옵 1%)</div>
        <div>· 접두사 등급: 1단계(90%) → 2단계(9%) → 3단계(0.9%) → 4단계(0.1%)</div>
        <div>· 강화는 +1~+10까지, +3까지 100%, +6까지 80%, +9까지 50%, +10은 20%</div>
        <div style={{ marginBottom: 10 }}>· 강화 실패 시 골드만 소모되고 장비는 유지됩니다</div>

        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>스킬</div>
        <div>· 클래스당 총 10개 스킬 (Lv.1/3/5/10/20/30/40/50/60/70에 자동 습득)</div>
        <div style={{ marginBottom: 10 }}>· 스킬 화면에서 자동 사용 ON/OFF를 설정할 수 있습니다</div>

        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>월드 이벤트</div>
        <div>· 월드 보스는 하루 2회 출현합니다 (오전 12시, 오후 8시)</div>
        <div>· 3초 쿨다운으로 공격하여 데미지 기여도 순위에 따라 보상을 받습니다</div>
        <div style={{ marginBottom: 10 }}>· 보상 등급: S(상위 3명) / A(상위 5%) / B(상위 20%) / C(참여)</div>

        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>기타</div>
        <div>· 출석 체크: 매일 랜덤 상자 (골드 + 모든 장비/소모품 등장, 전설 2% 확률), 7일 연속 시 추가 보너스</div>
        <div>· 경매소: 아이템을 등록하면 24시간 후 자동 정산 (판매 수수료 10%)</div>
        <div>· PvP: 하루 10회 제한, 10분 쿨다운, ELO 기반 매칭</div>
        <div>· 길드: 가입 시 전투 능력치 +5% 버프</div>
      </div>
    </div>
  );
}
