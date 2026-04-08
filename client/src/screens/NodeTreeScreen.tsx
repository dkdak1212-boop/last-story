import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { NodeDefinition, NodeTreeState } from '../types';

const NODE_RADIUS: Record<string, number> = { small: 18, medium: 26, large: 34 };
const NODE_COLORS = {
  invested: '#daa520',
  available: '#4caf50',
  locked: '#555',
  border_invested: '#ffd700',
  border_available: '#81c784',
  border_locked: '#444',
};

const MIN_GAP = 70;
const ROW_H = 130;
const CANVAS_H = 1400;

function computeTreeLayout(nodes: NodeDefinition[]): Map<number, { x: number; y: number }> {
  const positions = new Map<number, { x: number; y: number }>();
  if (nodes.length === 0) return positions;

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  const depths = new Map<number, number>();
  function getDepth(id: number, visited: Set<number> = new Set()): number {
    if (depths.has(id)) return depths.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);
    const node = nodeMap.get(id);
    if (!node || node.prerequisites.length === 0) { depths.set(id, 0); return 0; }
    const d = Math.max(...node.prerequisites.filter(p => nodeMap.has(p)).map(p => getDepth(p, visited))) + 1;
    depths.set(id, d);
    return d;
  }
  for (const n of nodes) getDepth(n.id);

  const depthGroups = new Map<number, NodeDefinition[]>();
  for (const n of nodes) {
    const d = depths.get(n.id) || 0;
    if (!depthGroups.has(d)) depthGroups.set(d, []);
    depthGroups.get(d)!.push(n);
  }

  const maxDepth = depthGroups.size > 0 ? Math.max(...depthGroups.keys()) : 0;
  for (let d = 0; d <= maxDepth; d++) {
    const group = depthGroups.get(d) || [];
    if (d === 0) {
      const tierOrd: Record<string, number> = { large: 0, medium: 1, small: 2 };
      group.sort((a, b) => (tierOrd[a.tier] ?? 2) - (tierOrd[b.tier] ?? 2) || a.id - b.id);
    } else {
      group.sort((a, b) => {
        const pa = a.prerequisites[0] || 0;
        const pb = b.prerequisites[0] || 0;
        const pax = positions.get(pa)?.x ?? 0;
        const pbx = positions.get(pb)?.x ?? 0;
        return pax - pbx || a.id - b.id;
      });
    }

    const gap = Math.max(MIN_GAP, 140 - group.length * 0.8);
    const totalW = (group.length - 1) * gap;
    for (let i = 0; i < group.length; i++) {
      positions.set(group[i].id, { x: -totalW / 2 + i * gap, y: d * ROW_H });
    }
  }

  // 자식→부모 정렬
  for (let d = 1; d <= maxDepth; d++) {
    const group = depthGroups.get(d) || [];
    const parentGroups = new Map<number, NodeDefinition[]>();
    for (const n of group) {
      const parentId = n.prerequisites[0] || -1;
      if (!parentGroups.has(parentId)) parentGroups.set(parentId, []);
      parentGroups.get(parentId)!.push(n);
    }
    for (const [pid, children] of parentGroups) {
      const parentPos = positions.get(pid);
      if (!parentPos || children.length === 0) continue;
      const childXs = children.map(c => positions.get(c.id)!.x);
      const childCenter = (Math.min(...childXs) + Math.max(...childXs)) / 2;
      const shift = parentPos.x - childCenter;
      for (const c of children) positions.get(c.id)!.x += shift * 0.6;
    }
  }

  // 겹침 해소
  for (let d = 0; d <= maxDepth; d++) {
    const group = depthGroups.get(d) || [];
    const sorted = group.slice().sort((a, b) => (positions.get(a.id)?.x ?? 0) - (positions.get(b.id)?.x ?? 0));
    for (let i = 1; i < sorted.length; i++) {
      const prev = positions.get(sorted[i - 1].id)!;
      const cur = positions.get(sorted[i].id)!;
      if (cur.x - prev.x < MIN_GAP) {
        const push = MIN_GAP - (cur.x - prev.x);
        cur.x += push / 2;
        prev.x -= push / 2;
      }
    }
  }

  return positions;
}

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

// 미습득 선행 노드의 총 비용 계산
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

export function NodeTreeScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [treeState, setTreeState] = useState<NodeTreeState | null>(null);
  const [activeZone, setActiveZone] = useState('core');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState<NodeDefinition | null>(null);
  const [tooltip, setTooltip] = useState<{ node: NodeDefinition; x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startOx: 0, startOy: 0 });

  const fetchNodes = useCallback(async () => {
    if (!active) return;
    const data = await api<NodeTreeState>(`/characters/${active.id}/nodes`);
    setTreeState(data);
  }, [active?.id]);

  useEffect(() => { fetchNodes(); }, [fetchNodes]);
  useEffect(() => { setOffset({ x: 0, y: 0 }); setSelected(null); }, [activeZone]);

  const invested = treeState ? new Set(treeState.investedNodeIds) : new Set<number>();
  const zones = treeState ? [...new Set(treeState.nodes.map(n => n.zone))] : [];
  const isSingleZone = zones.length <= 1;
  const zoneNodes = treeState ? (isSingleZone ? treeState.nodes : treeState.nodes.filter(n => n.zone === activeZone)) : [];
  const nodeMap = useMemo(() => new Map(zoneNodes.map(n => [n.id, n])), [zoneNodes]);
  const layoutPositions = useMemo(() => computeTreeLayout(zoneNodes), [zoneNodes]);

  const highlightChain = useMemo(() => {
    if (!selected) return new Set<number>();
    return getPrereqChain(selected.id, nodeMap);
  }, [selected, nodeMap]);

  function getNodePos(node: NodeDefinition) {
    const pos = layoutPositions.get(node.id) || { x: 0, y: 0 };
    const canvas = canvasRef.current;
    const centerX = canvas ? canvas.width / 2 : 500;
    return { x: centerX + pos.x + offset.x, y: 80 + pos.y + offset.y };
  }

  function nodeStatus(node: NodeDefinition): 'invested' | 'available' | 'locked' {
    if (invested.has(node.id)) return 'invested';
    if (!treeState) return 'locked';
    // "available" if direct prereqs met AND enough points
    if (treeState.availablePoints < node.cost) return 'locked';
    if (node.prerequisites.length > 0 && !node.prerequisites.every(pid => invested.has(pid))) return 'locked';
    return 'available';
  }

  // 상위 노드도 투자 가능 여부 (하위 자동습득 포함)
  function canInvestWithPrereqs(node: NodeDefinition): boolean {
    if (!treeState) return false;
    if (invested.has(node.id)) return false;
    const totalCost = calcTotalCost(node.id, nodeMap, invested);
    return treeState.availablePoints >= totalCost;
  }

  // 캔버스 렌더
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || zoneNodes.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const container = containerRef.current;
    if (container) { canvas.width = container.clientWidth; canvas.height = CANVAS_H; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 연결선
    for (const node of zoneNodes) {
      const pos = getNodePos(node);
      for (const preId of node.prerequisites) {
        const preNode = nodeMap.get(preId);
        if (!preNode) continue;
        const prePos = getNodePos(preNode);
        const bothInvested = invested.has(node.id) && invested.has(preId);
        const inChain = highlightChain.has(node.id) && highlightChain.has(preId);

        ctx.beginPath();
        ctx.moveTo(prePos.x, prePos.y);
        const midY = (prePos.y + pos.y) / 2;
        ctx.bezierCurveTo(prePos.x, midY, pos.x, midY, pos.x, pos.y);

        if (inChain) { ctx.strokeStyle = '#ff8800'; ctx.lineWidth = 3; ctx.setLineDash([]); }
        else if (bothInvested) { ctx.strokeStyle = '#daa52066'; ctx.lineWidth = 2; ctx.setLineDash([]); }
        else { ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 노드
    for (const node of zoneNodes) {
      const pos = getNodePos(node);
      const r = NODE_RADIUS[node.tier] || 18;
      const status = nodeStatus(node);
      const inChain = highlightChain.has(node.id);
      const isSelected = selected?.id === node.id;

      // 글로우
      if (isSelected) {
        ctx.beginPath(); ctx.arc(pos.x, pos.y, r + 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,136,0,0.3)'; ctx.fill();
      } else if (inChain && !invested.has(node.id)) {
        ctx.beginPath(); ctx.arc(pos.x, pos.y, r + 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,136,0,0.15)'; ctx.fill();
      } else if (node.tier === 'large') {
        ctx.beginPath(); ctx.arc(pos.x, pos.y, r + 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,60,60,0.15)'; ctx.fill();
      } else if (node.tier === 'medium') {
        ctx.beginPath(); ctx.arc(pos.x, pos.y, r + 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(218,165,32,0.1)'; ctx.fill();
      }

      // 배경
      ctx.beginPath(); ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fillStyle = status === 'invested' ? '#2a2000' : status === 'available' ? '#0a200a' : '#1a1a1a';
      ctx.fill();

      // 테두리
      ctx.beginPath(); ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = isSelected ? '#ff8800' :
        status === 'invested' ? NODE_COLORS.border_invested :
        status === 'available' ? NODE_COLORS.border_available : NODE_COLORS.border_locked;
      ctx.lineWidth = status === 'invested' ? 3 : status === 'available' ? 2.5 : 1.5;
      ctx.stroke();

      // invested 채움
      if (status === 'invested') {
        ctx.beginPath(); ctx.arc(pos.x, pos.y, r - 4, 0, Math.PI * 2);
        ctx.fillStyle = NODE_COLORS.invested; ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
      }

      // 코스트 텍스트
      ctx.fillStyle = status === 'invested' ? '#fff' : status === 'available' ? '#cfc' : '#777';
      ctx.font = `bold ${node.tier === 'large' ? 15 : node.tier === 'medium' ? 13 : 11}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(node.cost.toString(), pos.x, pos.y);

      // 이름 (항상 표시, small은 축약)
      ctx.fillStyle = status === 'invested' ? '#daa520' : status === 'available' ? '#8f8' : '#666';
      ctx.font = `${node.tier === 'large' ? 'bold 12' : node.tier === 'medium' ? 'bold 11' : '10'}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      let name = node.name;
      if (node.tier === 'small' && name.length > 6) name = name.slice(0, 5) + '..';
      else if (name.length > 10) name = name.slice(0, 9) + '..';
      ctx.fillText(name, pos.x, pos.y + r + 4);
    }
  }, [zoneNodes, invested, offset, treeState, layoutPositions, highlightChain, selected]);

  function handleCanvasClick(e: React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    for (const node of zoneNodes) {
      const pos = getNodePos(node);
      const r = NODE_RADIUS[node.tier] || 18;
      if (Math.sqrt((mx - pos.x) ** 2 + (my - pos.y) ** 2) <= r + 6) { setSelected(node); return; }
    }
    setSelected(null);
  }

  function handleCanvasMove(e: React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas || dragRef.current.dragging) { setTooltip(null); return; }
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    for (const node of zoneNodes) {
      const pos = getNodePos(node);
      const r = NODE_RADIUS[node.tier] || 18;
      if (Math.sqrt((mx - pos.x) ** 2 + (my - pos.y) ** 2) <= r + 6) { setTooltip({ node, x: e.clientX, y: e.clientY }); return; }
    }
    setTooltip(null);
  }

  function handleMouseDown(e: React.MouseEvent) { dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startOx: offset.x, startOy: offset.y }; }
  function handleMouseMove(e: React.MouseEvent) {
    if (!dragRef.current.dragging) { handleCanvasMove(e); return; }
    setOffset({ x: dragRef.current.startOx + (e.clientX - dragRef.current.startX), y: dragRef.current.startOy + (e.clientY - dragRef.current.startY) });
  }
  function handleMouseUp() { dragRef.current.dragging = false; }

  // 터치
  const touchStartRef = useRef({ x: 0, y: 0, moved: false });
  const offsetRef = useRef(offset); offsetRef.current = offset;
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      dragRef.current = { dragging: true, startX: t.clientX, startY: t.clientY, startOx: offsetRef.current.x, startOy: offsetRef.current.y };
      touchStartRef.current = { x: t.clientX, y: t.clientY, moved: false };
    }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault(); e.stopPropagation();
      const t = e.touches[0];
      const dx = t.clientX - dragRef.current.startX, dy = t.clientY - dragRef.current.startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) touchStartRef.current.moved = true;
      setOffset({ x: dragRef.current.startOx + dx, y: dragRef.current.startOy + dy });
    }
    function onTouchEnd() {
      dragRef.current.dragging = false;
      if (!touchStartRef.current.moved && canvas) {
        const rect = canvas.getBoundingClientRect();
        const mx = touchStartRef.current.x - rect.left, my = touchStartRef.current.y - rect.top;
        for (const node of zoneNodes) {
          const pos = layoutPositions.get(node.id) || { x: 0, y: 0 };
          const cx = (canvas!.width / 2) + pos.x + offsetRef.current.x;
          const cy = 80 + pos.y + offsetRef.current.y;
          const r = NODE_RADIUS[node.tier] || 18;
          if (Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2) <= r + 10) { setSelected(node); return; }
        }
        setSelected(null);
      }
    }
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    return () => { canvas.removeEventListener('touchstart', onTouchStart); canvas.removeEventListener('touchmove', onTouchMove); canvas.removeEventListener('touchend', onTouchEnd); };
  }, [zoneNodes, layoutPositions]);

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
  const tierLabel = (t: string) => t === 'large' ? '키스톤' : t === 'medium' ? '중형' : '소형';

  // 선택 노드의 총 비용 (하위 포함)
  const selectedTotalCost = selected ? calcTotalCost(selected.id, nodeMap, invested) : 0;
  const selectedUnmetCount = selected ? (() => {
    const chain = getPrereqChain(selected.id, nodeMap);
    let count = 0;
    for (const nid of chain) if (!invested.has(nid)) count++;
    return count;
  })() : 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ color: 'var(--accent)' }}>노드 트리</h2>
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          <span style={{ color: 'var(--accent)' }}>{treeState.availablePoints}</span>
          <span style={{ color: 'var(--text-dim)' }}> / {treeState.totalPoints} pt</span>
        </div>
      </div>

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

      <div ref={containerRef} style={{
        position: 'relative', border: '1px solid var(--border)', background: '#0a0a0a',
        marginBottom: 12, cursor: dragRef.current.dragging ? 'grabbing' : 'grab', overflow: 'hidden',
      }}>
        <canvas ref={canvasRef}
          style={{ display: 'block', width: '100%', height: CANVAS_H, touchAction: 'none' }}
          onClick={handleCanvasClick}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={() => { handleMouseUp(); setTooltip(null); }}
        />
        <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', gap: 14, fontSize: 11, flexWrap: 'wrap' }}>
          <span style={{ color: NODE_COLORS.border_invested }}>● 투자됨</span>
          <span style={{ color: NODE_COLORS.border_available }}>● 투자 가능</span>
          <span style={{ color: NODE_COLORS.border_locked }}>● 잠김</span>
          <span style={{ color: '#ff8800' }}>● 선행 경로</span>
          <span style={{ color: 'var(--text-dim)' }}>드래그 이동 · 클릭 선택</span>
        </div>

        {tooltip && (
          <div style={{
            position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 12,
            padding: '10px 14px', background: 'rgba(0,0,0,0.95)', border: '1px solid var(--accent)',
            fontSize: 12, pointerEvents: 'none', zIndex: 100, maxWidth: 300, borderRadius: 6,
          }}>
            <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>
              {tooltip.node.name}
              <span style={{ color: 'var(--text-dim)', fontWeight: 400, marginLeft: 8 }}>{tooltip.node.cost}pt · {tierLabel(tooltip.node.tier)}</span>
            </div>
            <div style={{ color: '#ccc' }}>{tooltip.node.description}</div>
          </div>
        )}
      </div>

      {/* 선택 노드 패널 */}
      {selected && (
        <div style={{
          position: 'fixed', bottom: 50, left: 0, right: 0, zIndex: 110,
          padding: 14, margin: '0 10px',
          background: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(6px)',
          border: `2px solid ${nodeStatus(selected) === 'invested' ? 'var(--accent)' : canInvestWithPrereqs(selected) ? 'var(--success)' : '#ff8800'}`,
          borderRadius: 8, boxShadow: '0 -4px 20px rgba(0,0,0,0.6)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: nodeStatus(selected) === 'invested' ? 'var(--accent)' : '#fff' }}>
                {selected.name}
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 8 }}>
                  {tierLabel(selected.tier)} · {selected.cost}pt
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{selected.description}</div>
              {/* 하위 노드 자동 습득 안내 */}
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

      <div style={{ display: 'flex', gap: 8, padding: 10, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
        <button onClick={resetPartial} disabled={loading} style={{ fontSize: 11, padding: '5px 10px' }}>부분 리셋 500G</button>
        <button onClick={resetZone} disabled={loading} style={{ fontSize: 11, padding: '5px 10px' }}>구역 리셋 2,000G</button>
        <button onClick={resetAll} disabled={loading} style={{ fontSize: 11, padding: '5px 10px', color: 'var(--danger)' }}>전체 리셋 5,000G</button>
      </div>
    </div>
  );
}
