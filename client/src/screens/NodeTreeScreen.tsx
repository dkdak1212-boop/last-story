import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

/* ── 타입 ── */
interface NodeDefinition {
  id: number; name: string; description: string; zone: string; tier: string;
  cost: number; classExclusive: string | null; effects: any[]; prerequisites: number[];
}
interface NodeTreeState {
  availablePoints: number; totalPoints: number;
  investedNodeIds: number[]; nodes: NodeDefinition[];
}

/* ── 유틸 ── */
function getPrereqChain(nodeId: number, nodeMap: Map<number, NodeDefinition>): Set<number> {
  const chain = new Set<number>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (chain.has(id)) continue;
    chain.add(id);
    const node = nodeMap.get(id);
    if (node) for (const pid of node.prerequisites) if (nodeMap.has(pid)) queue.push(pid);
  }
  return chain;
}

function calcTotalCost(nodeId: number, nodeMap: Map<number, NodeDefinition>, invested: Set<number>): number {
  const visited = new Set<number>();
  let total = 0;
  function collect(nid: number) {
    if (visited.has(nid) || invested.has(nid)) return;
    visited.add(nid);
    const n = nodeMap.get(nid);
    if (!n) return;
    for (const pid of n.prerequisites) collect(pid);
    total += n.cost;
  }
  collect(nodeId);
  return total;
}

/* ── depth 계산 (위→아래) ── */
function computeDepths(nodes: NodeDefinition[]): Map<number, number> {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const depths = new Map<number, number>();
  function getDepth(id: number, visited: Set<number> = new Set()): number {
    if (depths.has(id)) return depths.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);
    const node = nodeMap.get(id);
    if (!node || node.prerequisites.length === 0 || !node.prerequisites.some(p => nodeMap.has(p))) {
      depths.set(id, 0);
      return 0;
    }
    const d = Math.max(...node.prerequisites.filter(p => nodeMap.has(p)).map(p => getDepth(p, visited))) + 1;
    depths.set(id, d);
    return d;
  }
  for (const n of nodes) getDepth(n.id);
  return depths;
}

/* ── 스타일 상수 ── */
const TIER_STYLE: Record<string, { size: number; fontSize: number; borderWidth: number }> = {
  small:  { size: 44, fontSize: 10, borderWidth: 2 },
  medium: { size: 56, fontSize: 11, borderWidth: 2.5 },
  large:  { size: 68, fontSize: 13, borderWidth: 3 },
};

const TIER_LABEL: Record<string, string> = { small: '소형', medium: '중형', large: '키스톤' };

/* ── 메인 컴포넌트 ── */
export function NodeTreeScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [treeState, setTreeState] = useState<NodeTreeState | null>(null);
  const [activeZone, setActiveZone] = useState('core');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState<NodeDefinition | null>(null);

  const fetchNodes = useCallback(async () => {
    if (!active) return;
    const data = await api<NodeTreeState>(`/characters/${active.id}/nodes`);
    setTreeState(data);
  }, [active?.id]);

  useEffect(() => { fetchNodes(); }, [fetchNodes]);
  useEffect(() => { setSelected(null); }, [activeZone]);

  const invested = treeState ? new Set(treeState.investedNodeIds) : new Set<number>();
  const zones = treeState ? [...new Set(treeState.nodes.map(n => n.zone))] : [];
  const isSingleZone = zones.length <= 1;
  const zoneNodes = treeState ? (isSingleZone ? treeState.nodes : treeState.nodes.filter(n => n.zone === activeZone)) : [];
  const nodeMap = useMemo(() => new Map(zoneNodes.map(n => [n.id, n])), [zoneNodes]);

  const depths = useMemo(() => computeDepths(zoneNodes), [zoneNodes]);
  const maxDepth = depths.size > 0 ? Math.max(...depths.values()) : 0;

  // depth별 노드 그룹
  const depthGroups = useMemo(() => {
    const groups: NodeDefinition[][] = [];
    for (let d = 0; d <= maxDepth; d++) {
      groups.push(zoneNodes.filter(n => (depths.get(n.id) ?? 0) === d)
        .sort((a, b) => {
          const tierOrd: Record<string, number> = { large: 0, medium: 1, small: 2 };
          return (tierOrd[a.tier] ?? 2) - (tierOrd[b.tier] ?? 2) || a.id - b.id;
        }));
    }
    return groups;
  }, [zoneNodes, depths, maxDepth]);

  const highlightChain = useMemo(() => {
    if (!selected) return new Set<number>();
    return getPrereqChain(selected.id, nodeMap);
  }, [selected, nodeMap]);

  function nodeStatus(node: NodeDefinition): 'invested' | 'available' | 'locked' {
    if (invested.has(node.id)) return 'invested';
    if (!treeState) return 'locked';
    if (treeState.availablePoints < node.cost) return 'locked';
    if (node.prerequisites.length > 0 && !node.prerequisites.every(pid => invested.has(pid))) return 'locked';
    return 'available';
  }

  function canInvestWithPrereqs(node: NodeDefinition): boolean {
    if (!treeState || invested.has(node.id)) return false;
    return treeState.availablePoints >= calcTotalCost(node.id, nodeMap, invested);
  }

  async function invest(nodeId: number) {
    if (!active || loading) return;
    setLoading(true); setMsg('');
    try {
      const r = await api<{ invested?: number }>(`/characters/${active.id}/nodes/invest`, { method: 'POST', body: JSON.stringify({ nodeId }) });
      if (r.invested && r.invested > 1) setMsg(`${r.invested}개 노드 일괄 습득!`);
      await fetchNodes(); await refreshActive();
    } catch (e: any) { setMsg(e?.message || '투자 실패'); }
    setLoading(false);
  }

  async function resetPartial() { if (!active || loading || !confirm('부분 리셋 (500G)')) return; setLoading(true); try { await api(`/characters/${active.id}/nodes/reset-partial`, { method: 'POST' }); await fetchNodes(); await refreshActive(); setMsg('리셋 완료!'); } catch (e: any) { setMsg(e?.message || '실패'); } setLoading(false); }
  async function resetZone() { if (!active || loading || !confirm('구역 리셋 (2,000G)')) return; setLoading(true); try { await api(`/characters/${active.id}/nodes/reset-zone`, { method: 'POST', body: JSON.stringify({ zone: activeZone }) }); await fetchNodes(); await refreshActive(); setMsg('리셋 완료!'); } catch (e: any) { setMsg(e?.message || '실패'); } setLoading(false); }
  async function resetAll() { if (!active || loading || !confirm('전체 리셋 (5,000G)')) return; setLoading(true); try { await api(`/characters/${active.id}/nodes/reset-all`, { method: 'POST' }); await fetchNodes(); await refreshActive(); setMsg('리셋 완료!'); } catch (e: any) { setMsg(e?.message || '실패'); } setLoading(false); }

  if (!treeState) return <div style={{ color: 'var(--text-dim)' }}>로딩 중...</div>;

  const selectedTotalCost = selected ? calcTotalCost(selected.id, nodeMap, invested) : 0;
  const selectedUnmetCount = selected ? (() => {
    const chain = getPrereqChain(selected.id, nodeMap);
    let count = 0;
    for (const nid of chain) if (!invested.has(nid)) count++;
    return count;
  })() : 0;

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ color: 'var(--accent)', margin: 0 }}>노드 트리</h2>
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          <span style={{ color: 'var(--accent)' }}>{treeState.availablePoints}</span>
          <span style={{ color: 'var(--text-dim)' }}> / {treeState.totalPoints} pt</span>
        </div>
      </div>

      {/* 구역 탭 */}
      {!isSingleZone && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          {zones.map(z => (
            <button key={z} onClick={() => setActiveZone(z)} style={{
              padding: '5px 12px', fontSize: 12,
              background: activeZone === z ? 'var(--accent)' : 'var(--bg-panel)',
              color: activeZone === z ? '#000' : 'var(--text-dim)',
              border: `1px solid ${activeZone === z ? 'var(--accent)' : 'var(--border)'}`,
              fontWeight: activeZone === z ? 700 : 400,
            }}>{z}</button>
          ))}
        </div>
      )}

      {msg && <div style={{ color: 'var(--accent)', marginBottom: 8, fontSize: 13 }}>{msg}</div>}

      {/* 트리 영역 */}
      <div style={{
        maxHeight: 600, overflowY: 'auto', overflowX: 'hidden',
        border: '1px solid var(--border)', background: '#0a0a0a',
        padding: '20px 8px', marginBottom: 12,
      }}>
        {depthGroups.map((group, depth) => (
          <div key={depth}>
            {/* 연결선 (SVG) */}
            {depth > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', height: 24 }}>
                <svg width="100%" height="24" style={{ overflow: 'visible' }}>
                  {/* 간단한 세로선 표시 */}
                  {group.map(node => {
                    const hasParentInPrev = node.prerequisites.some(pid => nodeMap.has(pid));
                    if (!hasParentInPrev) return null;
                    return <line key={node.id} x1="50%" y1="0" x2="50%" y2="24" stroke="#333" strokeWidth="1" strokeDasharray="3,3" />;
                  })}
                </svg>
              </div>
            )}
            {/* 노드 행 */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
              gap: 8, marginBottom: 4,
            }}>
              {group.map(node => {
                const status = nodeStatus(node);
                const style = TIER_STYLE[node.tier] || TIER_STYLE.small;
                const inChain = highlightChain.has(node.id) && selected?.id !== node.id;
                const isSelected = selected?.id === node.id;
                const chainNotMet = inChain && !invested.has(node.id);

                const borderColor =
                  isSelected ? '#ff8800' :
                  chainNotMet ? '#ff8800' :
                  status === 'invested' ? '#ffd700' :
                  status === 'available' ? '#81c784' : '#444';
                const bgColor =
                  isSelected ? 'rgba(255,136,0,0.2)' :
                  chainNotMet ? 'rgba(255,136,0,0.15)' :
                  status === 'invested' ? 'rgba(218,165,32,0.15)' :
                  status === 'available' ? 'rgba(76,175,80,0.1)' : 'rgba(30,30,30,0.8)';
                const textColor =
                  chainNotMet ? '#ffaa44' :
                  status === 'invested' ? '#ffd700' :
                  status === 'available' ? '#8f8' : '#666';

                return (
                  <div
                    key={node.id}
                    onClick={() => setSelected(isSelected ? null : node)}
                    style={{
                      width: style.size + 60, minHeight: style.size + 28,
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      padding: '6px 4px', cursor: 'pointer', userSelect: 'none',
                      border: `${style.borderWidth}px solid ${borderColor}`,
                      background: bgColor,
                      borderRadius: node.tier === 'large' ? 12 : node.tier === 'medium' ? 8 : 6,
                      boxShadow: isSelected ? '0 0 12px rgba(255,136,0,0.4)' :
                        inChain ? '0 0 8px rgba(255,136,0,0.2)' :
                        status === 'invested' ? '0 0 6px rgba(218,165,32,0.2)' : 'none',
                      transition: 'all 0.15s',
                      position: 'relative',
                    }}
                  >
                    {/* 코스트 뱃지 */}
                    <div style={{
                      position: 'absolute', top: -6, right: -6,
                      background: status === 'invested' ? '#daa520' : status === 'available' ? '#4caf50' : '#555',
                      color: '#000', fontSize: 9, fontWeight: 700,
                      borderRadius: '50%', width: 18, height: 18,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {node.cost}
                    </div>

                    {/* 선행 뱃지 */}
                    {chainNotMet && (
                      <div style={{
                        position: 'absolute', top: -6, left: -6,
                        background: '#ff8800', color: '#000',
                        fontSize: 8, fontWeight: 700,
                        padding: '2px 5px', borderRadius: 8,
                      }}>선행</div>
                    )}

                    {/* 티어 아이콘 */}
                    {node.tier === 'large' && (
                      <div style={{ fontSize: 16, marginBottom: 2 }}>
                        {status === 'invested' ? '★' : '☆'}
                      </div>
                    )}
                    {node.tier === 'medium' && (
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: status === 'invested' ? '#daa520' : '#555',
                        marginBottom: 2,
                      }} />
                    )}

                    {/* 이름 */}
                    <div style={{
                      fontSize: style.fontSize, fontWeight: 700,
                      color: textColor, textAlign: 'center',
                      lineHeight: 1.2, wordBreak: 'keep-all',
                    }}>
                      {node.name}
                    </div>

                    {/* 설명 (소형은 축약) */}
                    <div style={{
                      fontSize: 9, color: 'var(--text-dim)', textAlign: 'center',
                      marginTop: 2, lineHeight: 1.2,
                      maxWidth: style.size + 50,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
                    }}>
                      {node.description}
                    </div>

                    {/* 투자됨 체크 */}
                    {status === 'invested' && (
                      <div style={{ fontSize: 10, color: '#ffd700', marginTop: 2 }}>✓</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 선택 노드 패널 */}
      {selected && (
        <div style={{
          padding: 14, marginBottom: 12,
          background: 'var(--bg-panel)',
          border: `2px solid ${nodeStatus(selected) === 'invested' ? 'var(--accent)' : canInvestWithPrereqs(selected) ? 'var(--success)' : '#ff8800'}`,
          borderRadius: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: nodeStatus(selected) === 'invested' ? 'var(--accent)' : '#fff' }}>
                {selected.name}
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 8 }}>
                  {TIER_LABEL[selected.tier]} · {selected.cost}pt
                </span>
              </div>
              <div style={{ fontSize: 13, color: '#ccc', marginTop: 4 }}>{selected.description}</div>
              {!invested.has(selected.id) && selectedUnmetCount > 1 && (
                <div style={{ fontSize: 11, color: '#ff8800', marginTop: 4 }}>
                  하위 노드 {selectedUnmetCount - 1}개 자동 습득 (총 {selectedTotalCost}pt 필요)
                </div>
              )}
              {selected.prerequisites.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  선행: {selected.prerequisites.map(pid => {
                    const pn = treeState.nodes.find(n => n.id === pid);
                    const met = invested.has(pid);
                    return <span key={pid} style={{ color: met ? 'var(--success)' : '#ff8800', marginRight: 6 }}>
                      {pn ? pn.name : `#${pid}`} {met ? '✓' : '→자동'}
                    </span>;
                  })}
                </div>
              )}
            </div>
            <div style={{ flexShrink: 0 }}>
              {nodeStatus(selected) === 'invested' ? (
                <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 14 }}>투자됨 ✓</span>
              ) : canInvestWithPrereqs(selected) ? (
                <button onClick={() => invest(selected.id)} disabled={loading} style={{
                  padding: '10px 24px', background: 'var(--success)', color: '#000', border: 'none', fontWeight: 700, fontSize: 15,
                }}>
                  {selectedUnmetCount > 1 ? `${selectedTotalCost}pt 일괄투자` : '투자'}
                </button>
              ) : (
                <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>포인트 부족 ({selectedTotalCost}pt)</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 리셋 버튼 */}
      <div style={{ display: 'flex', gap: 8, padding: 10, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
        <button onClick={resetPartial} disabled={loading} style={{ fontSize: 11, padding: '5px 10px' }}>부분 리셋 500G</button>
        <button onClick={resetZone} disabled={loading} style={{ fontSize: 11, padding: '5px 10px' }}>구역 리셋 2,000G</button>
        <button onClick={resetAll} disabled={loading} style={{ fontSize: 11, padding: '5px 10px', color: 'var(--danger)' }}>전체 리셋 5,000G</button>
      </div>
    </div>
  );
}
