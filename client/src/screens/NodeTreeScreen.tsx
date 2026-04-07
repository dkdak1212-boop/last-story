import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { NodeDefinition, NodeTreeState } from '../types';

const ZONE_LABELS: Record<string, string> = {
  south: '기본 (남)',
  east: '공격 (동)',
  west: '유틸 (서)',
  center: '중앙',
  north_warrior: '전사 고유',
  north_mage: '마법사 고유',
  north_cleric: '성직자 고유',
  north_rogue: '도적 고유',
};

const TIER_ORDER = ['small', 'medium', 'large'] as const;
const TIER_LABELS: Record<string, string> = { small: '소형 (1pt)', medium: '중형 (2pt)', large: '대형 (4pt)' };
const TIER_COLORS: Record<string, string> = { small: 'var(--text-dim)', medium: 'var(--accent)', large: 'var(--danger)' };

export function NodeTreeScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [treeState, setTreeState] = useState<NodeTreeState | null>(null);
  const [activeZone, setActiveZone] = useState('south');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const fetchNodes = useCallback(async () => {
    if (!active) return;
    const data = await api<NodeTreeState>(`/characters/${active.id}/nodes`);
    setTreeState(data);
  }, [active?.id]);

  useEffect(() => { fetchNodes(); }, [fetchNodes]);

  async function invest(nodeId: number) {
    if (!active || loading) return;
    setLoading(true);
    setMsg('');
    try {
      await api(`/characters/${active.id}/nodes/invest`, {
        method: 'POST', body: JSON.stringify({ nodeId }),
      });
      await fetchNodes();
      await refreshActive();
    } catch (e: any) {
      setMsg(e?.message || '투자 실패');
    }
    setLoading(false);
  }

  async function resetPartial() {
    if (!active || loading) return;
    if (!confirm('부분 리셋 (500G): 마지막 5포인트를 환불합니다.')) return;
    setLoading(true);
    try {
      await api(`/characters/${active.id}/nodes/reset-partial`, { method: 'POST' });
      await fetchNodes();
      await refreshActive();
      setMsg('부분 리셋 완료!');
    } catch (e: any) { setMsg(e?.message || '리셋 실패'); }
    setLoading(false);
  }

  async function resetZone() {
    if (!active || loading) return;
    if (!confirm(`구역 리셋 (2,000G): "${ZONE_LABELS[activeZone]}" 존을 초기화합니다.`)) return;
    setLoading(true);
    try {
      await api(`/characters/${active.id}/nodes/reset-zone`, {
        method: 'POST', body: JSON.stringify({ zone: activeZone }),
      });
      await fetchNodes();
      await refreshActive();
      setMsg('구역 리셋 완료!');
    } catch (e: any) { setMsg(e?.message || '리셋 실패'); }
    setLoading(false);
  }

  async function resetAll() {
    if (!active || loading) return;
    if (!confirm('전체 리셋 (5,000G): 모든 노드를 초기화합니다.')) return;
    setLoading(true);
    try {
      await api(`/characters/${active.id}/nodes/reset-all`, { method: 'POST' });
      await fetchNodes();
      await refreshActive();
      setMsg('전체 리셋 완료!');
    } catch (e: any) { setMsg(e?.message || '리셋 실패'); }
    setLoading(false);
  }

  if (!treeState) return <div style={{ color: 'var(--text-dim)' }}>로딩 중...</div>;

  const invested = new Set(treeState.investedNodeIds);
  const zones = [...new Set(treeState.nodes.map(n => n.zone))];

  // 현재 존의 노드들
  const zoneNodes = treeState.nodes.filter(n => n.zone === activeZone);
  const grouped = TIER_ORDER.map(tier => ({
    tier,
    nodes: zoneNodes.filter(n => n.tier === tier),
  })).filter(g => g.nodes.length > 0);

  function canInvest(node: NodeDefinition): boolean {
    if (invested.has(node.id)) return false;
    if (treeState!.availablePoints < node.cost) return false;
    if (node.prerequisites.length > 0 && !node.prerequisites.every(pid => invested.has(pid))) return false;
    return true;
  }

  function nodeStatus(node: NodeDefinition): 'invested' | 'available' | 'locked' {
    if (invested.has(node.id)) return 'invested';
    if (canInvest(node)) return 'available';
    return 'locked';
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--accent)' }}>노드 트리</h2>
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          포인트: <span style={{ color: 'var(--accent)' }}>{treeState.availablePoints}</span>
          <span style={{ color: 'var(--text-dim)' }}> / {treeState.totalPoints}</span>
        </div>
      </div>

      {/* Zone tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {zones.map(z => (
          <button
            key={z}
            onClick={() => setActiveZone(z)}
            style={{
              padding: '6px 14px', fontSize: 13,
              background: activeZone === z ? 'var(--accent)' : 'var(--bg-panel)',
              color: activeZone === z ? '#000' : 'var(--text-dim)',
              border: `1px solid ${activeZone === z ? 'var(--accent)' : 'var(--border)'}`,
              fontWeight: activeZone === z ? 700 : 400,
            }}
          >
            {ZONE_LABELS[z] || z}
          </button>
        ))}
      </div>

      {msg && <div style={{ color: 'var(--accent)', marginBottom: 12, fontSize: 13 }}>{msg}</div>}

      {/* Node list by tier */}
      {grouped.map(({ tier, nodes }) => (
        <div key={tier} style={{ marginBottom: 20 }}>
          <h3 style={{ color: TIER_COLORS[tier], fontSize: 14, marginBottom: 8, borderBottom: `1px solid var(--border)`, paddingBottom: 4 }}>
            {TIER_LABELS[tier]} ({nodes.length}개)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {nodes.map(node => {
              const status = nodeStatus(node);
              return (
                <div
                  key={node.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px',
                    background: status === 'invested' ? 'rgba(218,165,32,0.1)' : 'var(--bg-panel)',
                    border: `1px solid ${status === 'invested' ? 'var(--accent)' : status === 'available' ? 'var(--success)' : 'var(--border)'}`,
                    opacity: status === 'locked' ? 0.5 : 1,
                  }}
                >
                  <div>
                    <div style={{
                      fontWeight: 700, fontSize: 14,
                      color: status === 'invested' ? 'var(--accent)' : status === 'available' ? 'var(--success)' : 'var(--text-dim)',
                    }}>
                      {status === 'invested' ? '+ ' : status === 'locked' ? '# ' : ''}{node.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                      {node.description}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{node.cost}pt</span>
                    {status === 'invested' && (
                      <span style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 700 }}>투자됨</span>
                    )}
                    {status === 'available' && (
                      <button
                        onClick={() => invest(node.id)}
                        disabled={loading}
                        style={{
                          padding: '4px 10px', fontSize: 12,
                          background: 'var(--success)', color: '#000', border: 'none', fontWeight: 700,
                        }}
                      >
                        투자
                      </button>
                    )}
                    {status === 'locked' && (
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>선행 필요</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Reset buttons */}
      <div style={{
        display: 'flex', gap: 8, marginTop: 20, padding: 12,
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
      }}>
        <button onClick={resetPartial} disabled={loading} style={{ fontSize: 12, padding: '6px 12px' }}>
          부분 리셋 (500G)
        </button>
        <button onClick={resetZone} disabled={loading} style={{ fontSize: 12, padding: '6px 12px' }}>
          구역 리셋 (2,000G)
        </button>
        <button onClick={resetAll} disabled={loading} style={{ fontSize: 12, padding: '6px 12px', color: 'var(--danger)' }}>
          전체 리셋 (5,000G)
        </button>
      </div>
    </div>
  );
}
