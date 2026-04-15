import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

/* ── 타입 ── */
interface NodeDefinition {
  id: number; name: string; description: string; zone: string; tier: string;
  cost: number; classExclusive: string | null; effects: any[]; prerequisites: number[];
  positionX: number; positionY: number;
}
interface NodeTreeState {
  availablePoints: number; totalPoints: number;
  investedNodeIds: number[]; nodes: NodeDefinition[];
}

/* ── 유틸: 선행 체인 ── */
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

/* ── 방사형 레이아웃 (PoE 스타일) ── */
interface Position { x: number; y: number; }

function computeRadialLayout(nodes: NodeDefinition[]): Map<number, Position> {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const positions = new Map<number, Position>();
  if (nodes.length === 0) return positions;

  // 1. depth from roots
  const depths = new Map<number, number>();
  function getDepth(id: number, visited = new Set<number>()): number {
    if (depths.has(id)) return depths.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);
    const n = nodeMap.get(id);
    if (!n || n.prerequisites.length === 0 || !n.prerequisites.some(p => nodeMap.has(p))) {
      depths.set(id, 0);
      return 0;
    }
    const d = Math.max(...n.prerequisites.filter(p => nodeMap.has(p)).map(p => getDepth(p, visited))) + 1;
    depths.set(id, d);
    return d;
  }
  for (const n of nodes) getDepth(n.id);

  // 2. children map
  const childrenOf = new Map<number, NodeDefinition[]>();
  for (const n of nodes) {
    for (const pid of n.prerequisites) {
      if (!nodeMap.has(pid)) continue;
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid)!.push(n);
    }
  }

  // 3. roots (depth 0)
  const roots = nodes.filter(n => depths.get(n.id) === 0);

  // 4. subtree leaf count (for sector allocation)
  function leafCount(rootId: number, visited = new Set<number>()): number {
    if (visited.has(rootId)) return 0;
    visited.add(rootId);
    const children = childrenOf.get(rootId) || [];
    if (children.length === 0) return 1;
    return children.reduce((sum, c) => sum + leafCount(c.id, visited), 0);
  }

  // 큰 노드(키스톤/medium)는 가중치 더 줘서 공간 확보
  function rootWeight(root: NodeDefinition): number {
    const leaves = leafCount(root.id);
    return Math.max(1, leaves);
  }

  // 5. 루트 가중치 합산 → 각도 분배
  const totalWeight = roots.reduce((sum, r) => sum + rootWeight(r), 0);
  const ringGap = 110;
  const baseRadius = 100;

  // 루트는 중앙에서 약간 떨어진 첫 번째 링에 배치
  let currentAngle = -Math.PI / 2; // 12시 방향에서 시작

  function placeSubtree(node: NodeDefinition, angleStart: number, angleEnd: number) {
    const depth = depths.get(node.id) ?? 0;
    const radius = baseRadius + depth * ringGap;
    const centerAngle = (angleStart + angleEnd) / 2;
    positions.set(node.id, {
      x: Math.cos(centerAngle) * radius,
      y: Math.sin(centerAngle) * radius,
    });

    // 이 노드의 children 중 아직 배치 안 된 것
    const children = (childrenOf.get(node.id) || [])
      .filter(c => !positions.has(c.id) && depths.get(c.id) === depth + 1);
    if (children.length === 0) return;

    // 각 child의 leafCount로 sub-sector 할당
    const childWeights = children.map(c => Math.max(1, leafCount(c.id, new Set([node.id]))));
    const sumW = childWeights.reduce((a, b) => a + b, 0);
    let subAngle = angleStart;
    children.forEach((c, i) => {
      const span = ((angleEnd - angleStart) * childWeights[i]) / sumW;
      placeSubtree(c, subAngle, subAngle + span);
      subAngle += span;
    });
  }

  // 루트들을 sector로 배치
  for (const root of roots) {
    const weight = rootWeight(root);
    const sectorAngle = (weight / totalWeight) * Math.PI * 2;
    placeSubtree(root, currentAngle, currentAngle + sectorAngle);
    currentAngle += sectorAngle;
  }

  // 6. 겹침 해소 (간단한 반발력) — 같은 depth에서 너무 가까운 노드는 밀어내기
  for (let iter = 0; iter < 3; iter++) {
    const byDepth = new Map<number, NodeDefinition[]>();
    for (const n of nodes) {
      const d = depths.get(n.id) ?? 0;
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push(n);
    }
    for (const [, group] of byDepth) {
      // angular sort
      const withAngle = group.map(n => {
        const p = positions.get(n.id)!;
        return { node: n, angle: Math.atan2(p.y, p.x) };
      }).sort((a, b) => a.angle - b.angle);
      const minAngularGap = 0.05; // 라디안
      for (let i = 1; i < withAngle.length; i++) {
        if (withAngle[i].angle - withAngle[i - 1].angle < minAngularGap) {
          withAngle[i].angle = withAngle[i - 1].angle + minAngularGap;
          const node = withAngle[i].node;
          const depth = depths.get(node.id) ?? 0;
          const r = baseRadius + depth * ringGap;
          positions.set(node.id, {
            x: Math.cos(withAngle[i].angle) * r,
            y: Math.sin(withAngle[i].angle) * r,
          });
        }
      }
    }
  }

  return positions;
}

/* ── 노드 스타일 ── */
const TIER_RADIUS: Record<string, number> = { small: 18, medium: 26, large: 36, huge: 46 };
const TIER_LABEL: Record<string, string> = { small: '소형', medium: '중형', large: '키스톤', huge: '초월' };

/* ── 메인 컴포넌트 ── */
export function NodeTreeScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [treeState, setTreeState] = useState<NodeTreeState | null>(null);
  const [activeZone, setActiveZone] = useState('core');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState<NodeDefinition | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // 뷰포트 (pan + zoom)
  const [viewBox, setViewBox] = useState({ x: -700, y: -700, w: 1400, h: 1400 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startVbX: 0, startVbY: 0 });

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const fetchNodes = useCallback(async () => {
    if (!active) return;
    const data = await api<NodeTreeState>(`/characters/${active.id}/nodes`);
    setTreeState(data);
  }, [active?.id]);

  useEffect(() => { fetchNodes(); }, [fetchNodes]);
  useEffect(() => {
    setSelected(null);
    setViewBox({ x: -700, y: -700, w: 1400, h: 1400 });
  }, [activeZone]);

  const invested = treeState ? new Set(treeState.investedNodeIds) : new Set<number>();
  const zones = treeState ? [...new Set(treeState.nodes.map(n => n.zone))] : [];
  const isSingleZone = zones.length <= 1;
  const zoneNodes = treeState ? (isSingleZone ? treeState.nodes : treeState.nodes.filter(n => n.zone === activeZone)) : [];
  const nodeMap = useMemo(() => new Map(zoneNodes.map(n => [n.id, n])), [zoneNodes]);
  // 소환사만 DB position_x/y 사용 (444개 대형 트리 전용)
  // 다른 직업은 기존 computeRadialLayout 유지 (전사/마법사/성직자/도적 원본)
  const positions = useMemo(() => {
    if (active?.className === 'summoner') {
      const scale = 65;
      const m = new Map<number, Position>();
      for (const n of zoneNodes) {
        m.set(n.id, { x: (n.positionX ?? 0) * scale, y: (n.positionY ?? 0) * scale });
      }
      return m;
    }
    return computeRadialLayout(zoneNodes);
  }, [zoneNodes, active?.className]);

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

  /* ── pan/zoom 핸들러 ── */
  function handleMouseDown(e: React.MouseEvent) {
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startVbX: viewBox.x, startVbY: viewBox.y };
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!dragRef.current.dragging) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = viewBox.w / rect.width;
    const scaleY = viewBox.h / rect.height;
    setViewBox(v => ({
      ...v,
      x: dragRef.current.startVbX - (e.clientX - dragRef.current.startX) * scaleX,
      y: dragRef.current.startVbY - (e.clientY - dragRef.current.startY) * scaleY,
    }));
  }
  function handleMouseUp() { dragRef.current.dragging = false; }

  // wheel 이벤트 (1회만 등록)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = svg!.getBoundingClientRect();
      if (rect.width <= 0) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const scale = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      setViewBox(v => {
        const newW = Math.min(4000, Math.max(400, v.w * scale));
        const newH = newW * (v.h / v.w);
        if (!isFinite(newW) || !isFinite(newH)) return v;
        const mxRatio = mx / rect.width;
        const myRatio = my / rect.height;
        return {
          x: v.x + (v.w - newW) * mxRatio,
          y: v.y + (v.h - newH) * myRatio,
          w: newW, h: newH,
        };
      });
    }
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // 터치 (모바일 pan + pinch zoom) — React 합성 이벤트로 단순화
  const touchRef = useRef<{ x: number; y: number; vbX: number; vbY: number; dist?: number; vbW?: number; vbH?: number } | null>(null);
  const viewBoxRef = useRef(viewBox);
  viewBoxRef.current = viewBox;

  function safeViewBox(vb: { x: number; y: number; w: number; h: number }) {
    if (!isFinite(vb.x) || !isFinite(vb.y) || !isFinite(vb.w) || !isFinite(vb.h) || vb.w <= 0 || vb.h <= 0) {
      return { x: -700, y: -700, w: 1400, h: 1400 };
    }
    return {
      x: Math.max(-10000, Math.min(10000, vb.x)),
      y: Math.max(-10000, Math.min(10000, vb.y)),
      w: Math.min(4000, Math.max(400, vb.w)),
      h: Math.min(4000, Math.max(400, vb.h)),
    };
  }

  function handleTouchStart(e: React.TouchEvent) {
    const vb = viewBoxRef.current;
    if (e.touches.length === 1) {
      touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, vbX: vb.x, vbY: vb.y };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 10) return;
      touchRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        vbX: vb.x, vbY: vb.y, dist,
        vbW: vb.w, vbH: vb.h,
      };
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchRef.current) return;
    const vb = viewBoxRef.current;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    if (e.touches.length === 1) {
      const dx = (e.touches[0].clientX - touchRef.current.x) * (vb.w / rect.width);
      const dy = (e.touches[0].clientY - touchRef.current.y) * (vb.h / rect.height);
      if (!isFinite(dx) || !isFinite(dy)) return;
      setViewBox(safeViewBox({ x: touchRef.current.vbX - dx, y: touchRef.current.vbY - dy, w: vb.w, h: vb.h }));
    } else if (e.touches.length === 2 && touchRef.current.dist != null) {
      const ndx = e.touches[0].clientX - e.touches[1].clientX;
      const ndy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.sqrt(ndx * ndx + ndy * ndy);
      if (newDist < 10) return;
      const scale = touchRef.current.dist / newDist;
      if (!isFinite(scale) || scale <= 0) return;
      const baseW = touchRef.current.vbW!;
      const baseH = touchRef.current.vbH!;
      const newW = Math.min(4000, Math.max(400, baseW * scale));
      const newH = newW * (baseH / baseW);
      if (!isFinite(newW) || !isFinite(newH)) return;
      const cx = touchRef.current.x - rect.left;
      const cy = touchRef.current.y - rect.top;
      const newX = touchRef.current.vbX + (baseW - newW) * (cx / rect.width);
      const newY = touchRef.current.vbY + (baseH - newH) * (cy / rect.height);
      setViewBox(safeViewBox({ x: newX, y: newY, w: newW, h: newH }));
    }
  }

  function handleTouchEnd() { touchRef.current = null; }

  // iOS Safari gesture 이벤트 차단 (1회만)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onGesture = (e: Event) => e.preventDefault();
    svg.addEventListener('gesturestart', onGesture as any);
    svg.addEventListener('gesturechange', onGesture as any);
    svg.addEventListener('gestureend', onGesture as any);
    return () => {
      svg.removeEventListener('gesturestart', onGesture as any);
      svg.removeEventListener('gesturechange', onGesture as any);
      svg.removeEventListener('gestureend', onGesture as any);
    };
  }, []);

  // 노드트리 화면에서는 페이지 전체 overscroll/pull-to-refresh 차단
  useEffect(() => {
    const prevHtml = document.documentElement.style.overscrollBehavior;
    const prevBody = document.body.style.overscrollBehavior;
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.documentElement.style.overscrollBehavior = prevHtml;
      document.body.style.overscrollBehavior = prevBody;
    };
  }, []);

  function resetView() {
    setViewBox({ x: -700, y: -700, w: 1400, h: 1400 });
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
  async function resetAll() { if (!active || loading || !confirm('전체 리셋 (5,000G)')) return; setLoading(true); try { await api(`/characters/${active.id}/nodes/reset-all`, { method: 'POST' }); await fetchNodes(); await refreshActive(); setMsg('리셋 완료!'); } catch (e: any) { setMsg(e?.message || '실패'); } setLoading(false); }

  if (!treeState) return <div style={{ color: 'var(--text-dim)' }}>로딩 중...</div>;

  const selectedTotalCost = selected ? calcTotalCost(selected.id, nodeMap, invested) : 0;
  const selectedUnmetCount = selected ? (() => {
    const chain = getPrereqChain(selected.id, nodeMap);
    let count = 0;
    for (const nid of chain) if (!invested.has(nid)) count++;
    return count;
  })() : 0;

  /* ── 색상 ── */
  function getNodeColors(node: NodeDefinition) {
    const status = nodeStatus(node);
    const isSelected = selected?.id === node.id;
    const inChain = highlightChain.has(node.id) && !isSelected;
    const chainNotMet = inChain && !invested.has(node.id);

    if (isSelected) return { fill: '#ff8800', stroke: '#ffaa44', text: '#fff' };
    if (chainNotMet) return { fill: '#5a3a00', stroke: '#ff8800', text: '#ffcc66' };
    if (status === 'invested') return { fill: '#3a2a00', stroke: '#ffd700', text: '#ffd700' };
    if (status === 'available') return { fill: '#0a2a0a', stroke: '#81c784', text: '#a5e6a5' };
    return { fill: '#1a1a1a', stroke: '#444', text: '#666' };
  }

  return (
    <div>
      {/* 헤더 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
        padding: isMobile ? '10px 14px' : 0,
        background: isMobile ? 'linear-gradient(135deg, rgba(201,162,77,0.12), rgba(201,162,77,0.04))' : 'transparent',
        borderRadius: isMobile ? 6 : 0,
        border: isMobile ? '1px solid rgba(201,162,77,0.3)' : 'none',
      }}>
        <h2 style={{ color: 'var(--accent)', margin: 0, fontSize: isMobile ? 18 : 22 }}>노드 트리</h2>
        <div style={{
          padding: isMobile ? '4px 10px' : 0,
          background: isMobile ? 'rgba(0,0,0,0.4)' : 'transparent',
          borderRadius: isMobile ? 4 : 0,
          border: isMobile ? '1px solid var(--border)' : 'none',
        }}>
          <span style={{ fontSize: isMobile ? 18 : 15, fontWeight: 900, color: 'var(--accent)' }}>
            {treeState.availablePoints}
          </span>
          <span style={{ color: 'var(--text-dim)', fontSize: isMobile ? 12 : 14 }}> / {treeState.totalPoints} pt</span>
        </div>
      </div>

      {/* 구역 탭 */}
      {!isSingleZone && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {zones.map(z => (
            <button key={z} onClick={() => setActiveZone(z)} style={{
              padding: isMobile ? '8px 16px' : '5px 12px',
              fontSize: isMobile ? 13 : 12,
              minHeight: isMobile ? 38 : 'auto',
              background: activeZone === z ? 'var(--accent)' : 'var(--bg-panel)',
              color: activeZone === z ? '#000' : 'var(--text-dim)',
              border: `1px solid ${activeZone === z ? 'var(--accent)' : 'var(--border)'}`,
              fontWeight: activeZone === z ? 700 : 500,
              borderRadius: 4,
              flex: isMobile ? '1 1 auto' : '0 0 auto',
            }}>{z}</button>
          ))}
        </div>
      )}

      {msg && <div style={{
        color: 'var(--accent)', marginBottom: 8,
        fontSize: isMobile ? 14 : 13,
        padding: isMobile ? '8px 12px' : 0,
        background: isMobile ? 'rgba(201,162,77,0.1)' : 'transparent',
        borderLeft: isMobile ? '3px solid var(--accent)' : 'none',
        borderRadius: isMobile ? 3 : 0,
      }}>{msg}</div>}

      {/* SVG 트리 */}
      <div style={{
        position: 'relative', width: '100%', height: isMobile ? 560 : 700,
        border: `1px solid ${isMobile ? 'var(--accent)' : 'var(--border)'}`,
        background: 'radial-gradient(ellipse at center, #1a1a2a 0%, #050505 70%)',
        overflow: 'hidden', marginBottom: 12,
        touchAction: 'none',
        borderRadius: isMobile ? 6 : 0,
        boxShadow: isMobile ? '0 0 20px rgba(0,0,0,0.6)' : 'none',
      }}>
        <svg
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          style={{
            width: '100%', height: '100%',
            cursor: dragRef.current.dragging ? 'grabbing' : 'grab',
            touchAction: 'none', userSelect: 'none',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          {/* 동심원 가이드 */}
          {[100, 210, 320, 430, 540, 650].map(r => (
            <circle key={r} cx={0} cy={0} r={r} fill="none" stroke="#222" strokeWidth={1} strokeDasharray="2,4" />
          ))}

          {/* 중앙 마커 */}
          <circle cx={0} cy={0} r={30} fill="#0a0a14" stroke="#ffaa00" strokeWidth={2} opacity={0.6} />
          <text x={0} y={5} fill="#ffaa00" fontSize={11} fontWeight={700} textAnchor="middle">CORE</text>

          {/* 연결선 */}
          {zoneNodes.map(node => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            return node.prerequisites.map(pid => {
              const pre = positions.get(pid);
              if (!pre) return null;
              const bothInvested = invested.has(node.id) && invested.has(pid);
              const inChain = highlightChain.has(node.id) && highlightChain.has(pid);
              const stroke =
                inChain ? '#ff8800' :
                bothInvested ? '#daa520' : '#3a3a3a';
              const strokeWidth = inChain ? 3 : bothInvested ? 2 : 1.2;
              return (
                <line
                  key={`${pid}-${node.id}`}
                  x1={pre.x} y1={pre.y} x2={pos.x} y2={pos.y}
                  stroke={stroke} strokeWidth={strokeWidth}
                  opacity={inChain ? 0.95 : bothInvested ? 0.7 : 0.4}
                  strokeLinecap="round"
                />
              );
            });
          })}

          {/* 노드 */}
          {zoneNodes.map(node => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            const r = TIER_RADIUS[node.tier] || 18;
            const colors = getNodeColors(node);
            const isSelected = selected?.id === node.id;
            const status = nodeStatus(node);
            return (
              <g
                key={node.id}
                onClick={(e) => { e.stopPropagation(); setSelected(isSelected ? null : node); }}
                style={{ cursor: 'pointer' }}
              >
                {/* 글로우 (키스톤/선택/투자됨) */}
                {(node.tier === 'large' || node.tier === 'huge' || isSelected || status === 'invested') && (
                  <circle cx={pos.x} cy={pos.y} r={r + 8}
                    fill={colors.stroke} opacity={isSelected ? 0.4 : 0.15} />
                )}
                {/* 노드 본체 */}
                <circle
                  cx={pos.x} cy={pos.y} r={r}
                  fill={colors.fill}
                  stroke={colors.stroke}
                  strokeWidth={node.tier === 'large' || node.tier === 'huge' ? 3 : node.tier === 'medium' ? 2.5 : 2}
                />
                {/* 키스톤은 별 모양 마커 */}
                {(node.tier === 'large' || node.tier === 'huge') && (
                  <text x={pos.x} y={pos.y - 4} fill={colors.text} fontSize={node.tier === 'huge' ? 18 : 14}
                    textAnchor="middle" fontWeight={700}>{node.tier === 'huge' ? '★★' : '★'}</text>
                )}
                {/* 코스트 */}
                <text x={pos.x} y={pos.y + (node.tier === 'large' || node.tier === 'huge' ? 10 : 4)}
                  fill={colors.text}
                  fontSize={node.tier === 'large' || node.tier === 'huge' ? (isMobile ? 13 : 11) : (isMobile ? 12 : 10)}
                  fontWeight={800} textAnchor="middle"
                  style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.7)', strokeWidth: 2 }}>
                  {node.cost}
                </text>
                {/* 이름 (medium 이상만, 줌 인 시) */}
                {(node.tier !== 'small' || viewBox.w < 1000) && (
                  <text x={pos.x} y={pos.y + r + (isMobile ? 14 : 12)}
                    fill={colors.text}
                    fontSize={node.tier === 'large' || node.tier === 'huge' ? (isMobile ? 13 : 11) : (isMobile ? 11 : 9)}
                    textAnchor="middle"
                    fontWeight={node.tier === 'large' || node.tier === 'huge' ? 800 : 600}
                    style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.85)', strokeWidth: 2.5 }}>
                    {node.name.length > 8 ? node.name.slice(0, 7) + '..' : node.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* 컨트롤 오버레이 */}
        <div style={{
          position: 'absolute', top: 10, right: 10,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <button onClick={() => {
            const scale = 1 / 1.3;
            setViewBox(v => ({
              x: v.x + v.w * (1 - scale) / 2,
              y: v.y + v.h * (1 - scale) / 2,
              w: v.w * scale, h: v.h * scale,
            }));
          }} style={{
            width: isMobile ? 44 : 36, height: isMobile ? 44 : 36,
            fontSize: isMobile ? 22 : 16, fontWeight: 900,
            background: 'rgba(0,0,0,0.75)', color: 'var(--accent)',
            border: '1px solid var(--accent)', borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>+</button>
          <button onClick={() => {
            const scale = 1.3;
            setViewBox(v => ({
              x: v.x - v.w * (scale - 1) / 2,
              y: v.y - v.h * (scale - 1) / 2,
              w: v.w * scale, h: v.h * scale,
            }));
          }} style={{
            width: isMobile ? 44 : 36, height: isMobile ? 44 : 36,
            fontSize: isMobile ? 22 : 16, fontWeight: 900,
            background: 'rgba(0,0,0,0.75)', color: 'var(--accent)',
            border: '1px solid var(--accent)', borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>−</button>
          <button onClick={resetView} style={{
            width: isMobile ? 44 : 36, height: isMobile ? 44 : 36,
            fontSize: isMobile ? 16 : 12, fontWeight: 700,
            background: 'rgba(0,0,0,0.75)', color: 'var(--text-dim)',
            border: '1px solid var(--border)', borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>⊡</button>
        </div>

        {/* 범례 */}
        <div style={{
          position: 'absolute', bottom: 10, left: 10, right: isMobile ? 64 : 'auto',
          display: 'flex', gap: isMobile ? 10 : 12,
          fontSize: isMobile ? 11 : 10, flexWrap: 'wrap',
          background: 'rgba(0,0,0,0.75)',
          padding: isMobile ? '6px 10px' : '4px 8px',
          borderRadius: 4,
          border: '1px solid var(--border)',
          fontWeight: 600,
        }}>
          <span style={{ color: '#ffd700' }}>● 투자됨</span>
          <span style={{ color: '#81c784' }}>● 가능</span>
          <span style={{ color: '#666' }}>● 잠김</span>
          <span style={{ color: '#ff8800' }}>● 선행</span>
        </div>
      </div>

      {/* 선택 노드 패널: 데스크톱 inline */}
      {selected && !isMobile && (
        <NodeDetailPanel
          selected={selected} invested={invested} treeState={treeState}
          selectedTotalCost={selectedTotalCost} selectedUnmetCount={selectedUnmetCount}
          nodeStatus={nodeStatus} canInvestWithPrereqs={canInvestWithPrereqs}
          invest={invest} loading={loading}
        />
      )}

      {/* 모바일 노드 정보 — 화면 하단 컴팩트 카드 (트리 가리지 않음) */}
      {selected && isMobile && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed', left: 8, right: 8, bottom: 8,
            maxWidth: 480, margin: '0 auto',
            padding: '10px 12px',
            background: 'rgba(20,20,28,0.96)',
            border: `1px solid ${nodeStatus(selected) === 'invested' ? 'var(--accent)' : canInvestWithPrereqs(selected) ? 'var(--success)' : '#ff8800'}`,
            borderRadius: 8,
            boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
            zIndex: 1000,
            maxHeight: '38vh', overflowY: 'auto',
            backdropFilter: 'blur(2px)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: nodeStatus(selected) === 'invested' ? 'var(--accent)' : '#fff' }}>
                {selected.name}
                <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 6 }}>
                  {TIER_LABEL[selected.tier]} · {selected.cost}pt
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#bbb', marginTop: 2, lineHeight: 1.35 }}>{selected.description}</div>
            </div>
            <button onClick={() => setSelected(null)} style={{
              flexShrink: 0, padding: '4px 10px', fontSize: 11,
              background: 'transparent', color: 'var(--text-dim)',
              border: '1px solid var(--border)', borderRadius: 3,
            }}>✕</button>
          </div>

          {!invested.has(selected.id) && selectedUnmetCount > 1 && (
            <div style={{ fontSize: 10, color: '#ff8800', marginBottom: 6 }}>
              하위 {selectedUnmetCount - 1}개 자동 습득 · 총 {selectedTotalCost}pt
            </div>
          )}

          {nodeStatus(selected) === 'invested' ? (
            <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 12, textAlign: 'center', padding: '6px 0' }}>투자됨 ✓</div>
          ) : canInvestWithPrereqs(selected) ? (
            <button onClick={() => invest(selected.id)} disabled={loading} style={{
              padding: '8px', background: 'var(--success)', color: '#000',
              border: 'none', fontWeight: 700, fontSize: 13, width: '100%', borderRadius: 4,
            }}>
              {selectedUnmetCount > 1 ? `${selectedTotalCost}pt 일괄투자` : '투자'}
            </button>
          ) : (
            <div style={{ color: 'var(--text-dim)', fontSize: 11, textAlign: 'center', padding: '4px 0' }}>
              포인트 부족 ({selectedTotalCost}pt 필요)
            </div>
          )}
        </div>
      )}

      {/* 리셋 버튼 */}
      <div style={{
        display: 'flex', gap: isMobile ? 6 : 8, padding: isMobile ? 12 : 10,
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: isMobile ? 6 : 0,
        flexWrap: 'wrap',
      }}>
        <button onClick={resetPartial} disabled={loading} style={{
          fontSize: isMobile ? 12 : 11,
          padding: isMobile ? '10px 14px' : '5px 10px',
          flex: isMobile ? '1 1 30%' : '0 0 auto',
          minHeight: isMobile ? 40 : 'auto',
          fontWeight: 600,
        }}>부분 리셋 500G</button>
        <button onClick={resetAll} disabled={loading} style={{
          fontSize: isMobile ? 12 : 11,
          padding: isMobile ? '10px 14px' : '5px 10px',
          flex: isMobile ? '1 1 30%' : '0 0 auto',
          minHeight: isMobile ? 40 : 'auto',
          color: 'var(--danger)', fontWeight: 600,
        }}>전체 리셋 5,000G</button>
      </div>
    </div>
  );
}

/* ── 노드 상세 패널 (공통) ── */
interface NodeDetailPanelProps {
  selected: NodeDefinition;
  invested: Set<number>;
  treeState: NodeTreeState;
  selectedTotalCost: number;
  selectedUnmetCount: number;
  nodeStatus: (n: NodeDefinition) => 'invested' | 'available' | 'locked';
  canInvestWithPrereqs: (n: NodeDefinition) => boolean;
  invest: (id: number) => void;
  loading: boolean;
}

function NodeDetailPanel(props: NodeDetailPanelProps) {
  const { selected, invested, treeState, selectedTotalCost, selectedUnmetCount, nodeStatus, canInvestWithPrereqs, invest, loading } = props;
  const status = nodeStatus(selected);

  return (
    <div style={{
      padding: 14, marginBottom: 12,
      background: 'var(--bg-panel)',
      border: `2px solid ${status === 'invested' ? 'var(--accent)' : canInvestWithPrereqs(selected) ? 'var(--success)' : '#ff8800'}`,
      borderRadius: 8,
    }}>
      <div style={{ fontWeight: 700, fontSize: 16, color: status === 'invested' ? 'var(--accent)' : '#fff' }}>
        {selected.name}
        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 8 }}>
          {TIER_LABEL[selected.tier]} · {selected.cost}pt
        </span>
      </div>
      <div style={{ fontSize: 13, color: '#ccc', marginTop: 6, lineHeight: 1.4 }}>{selected.description}</div>
      {!invested.has(selected.id) && selectedUnmetCount > 1 && (
        <div style={{ fontSize: 12, color: '#ff8800', marginTop: 8 }}>
          하위 노드 {selectedUnmetCount - 1}개 자동 습득 (총 {selectedTotalCost}pt 필요)
        </div>
      )}
      {selected.prerequisites.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
          선행: {selected.prerequisites.map(pid => {
            const pn = treeState.nodes.find(n => n.id === pid);
            const met = invested.has(pid);
            return <span key={pid} style={{ color: met ? 'var(--success)' : '#ff8800', marginRight: 6 }}>
              {pn ? pn.name : `#${pid}`} {met ? '✓' : '→자동'}
            </span>;
          })}
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        {status === 'invested' ? (
          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 14 }}>투자됨 ✓</span>
        ) : canInvestWithPrereqs(selected) ? (
          <button onClick={() => invest(selected.id)} disabled={loading} style={{
            padding: '12px 28px', background: 'var(--success)', color: '#000',
            border: 'none', fontWeight: 700, fontSize: 16, width: '100%',
          }}>
            {selectedUnmetCount > 1 ? `${selectedTotalCost}pt 일괄투자` : '투자'}
          </button>
        ) : (
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>포인트 부족 ({selectedTotalCost}pt)</span>
        )}
      </div>
    </div>
  );
}
