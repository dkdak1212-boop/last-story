import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { NodeDefinition, NodeTreeState } from '../types';

const ZONE_LABELS: Record<string, string> = {
  south: '기본', east: '공격', west: '유틸', center: '중앙',
  north_warrior: '전사', north_mage: '마법사', north_cleric: '성직자', north_rogue: '도적',
};

const NODE_RADIUS: Record<string, number> = { small: 14, medium: 20, large: 28 };
const NODE_COLORS = {
  invested: '#daa520',
  available: '#4caf50',
  locked: '#555',
  border_invested: '#ffd700',
  border_available: '#81c784',
  border_locked: '#333',
};
const TIER_GLOW: Record<string, string> = { small: '', medium: 'rgba(218,165,32,0.3)', large: 'rgba(255,60,60,0.5)' };

const CELL = 48; // 노드 간 간격
const PADDING = 60;

export function NodeTreeScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [treeState, setTreeState] = useState<NodeTreeState | null>(null);
  const [activeZone, setActiveZone] = useState('south');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState<NodeDefinition | null>(null);
  const [tooltip, setTooltip] = useState<{ node: NodeDefinition; x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 뷰포트 드래그
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startOx: 0, startOy: 0 });

  const fetchNodes = useCallback(async () => {
    if (!active) return;
    const data = await api<NodeTreeState>(`/characters/${active.id}/nodes`);
    setTreeState(data);
  }, [active?.id]);

  useEffect(() => { fetchNodes(); }, [fetchNodes]);

  // 존 변경 시 오프셋 리셋
  useEffect(() => { setOffset({ x: 0, y: 0 }); setSelected(null); }, [activeZone]);

  const invested = treeState ? new Set(treeState.investedNodeIds) : new Set<number>();
  const zones = treeState ? [...new Set(treeState.nodes.map(n => n.zone))] : [];
  const zoneNodes = treeState ? treeState.nodes.filter(n => n.zone === activeZone) : [];
  const nodeMap = new Map(zoneNodes.map(n => [n.id, n]));

  // 노드 위치를 로컬 좌표로 변환
  function getNodePos(node: NodeDefinition) {
    // 노드의 position_x, position_y를 캔버스 좌표로
    const minX = Math.min(...zoneNodes.map(n => n.positionX));
    const minY = Math.min(...zoneNodes.map(n => n.positionY));
    return {
      x: (node.positionX - minX) * CELL + PADDING + offset.x,
      y: (node.positionY - minY) * CELL + PADDING + offset.y,
    };
  }

  function canInvest(node: NodeDefinition): boolean {
    if (!treeState) return false;
    if (invested.has(node.id)) return false;
    if (treeState.availablePoints < node.cost) return false;
    if (node.prerequisites.length > 0 && !node.prerequisites.every(pid => invested.has(pid))) return false;
    return true;
  }

  function nodeStatus(node: NodeDefinition): 'invested' | 'available' | 'locked' {
    if (invested.has(node.id)) return 'invested';
    if (canInvest(node)) return 'available';
    return 'locked';
  }

  // 캔버스 렌더
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || zoneNodes.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = containerRef.current;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = 500;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 연결선 그리기
    for (const node of zoneNodes) {
      const pos = getNodePos(node);
      for (const preId of node.prerequisites) {
        const preNode = nodeMap.get(preId);
        if (!preNode) continue;
        const prePos = getNodePos(preNode);
        const bothInvested = invested.has(node.id) && invested.has(preId);
        ctx.beginPath();
        ctx.moveTo(prePos.x, prePos.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = bothInvested ? '#daa520' : canInvest(node) && invested.has(preId) ? '#4caf50' : '#333';
        ctx.lineWidth = bothInvested ? 2.5 : 1.5;
        ctx.stroke();
      }
    }

    // 노드 그리기
    for (const node of zoneNodes) {
      const pos = getNodePos(node);
      const r = NODE_RADIUS[node.tier] || 14;
      const status = nodeStatus(node);

      // 글로우
      if (TIER_GLOW[node.tier]) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r + 6, 0, Math.PI * 2);
        ctx.fillStyle = TIER_GLOW[node.tier];
        ctx.fill();
      }

      // 배경
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fillStyle = status === 'invested' ? '#2a2000' : status === 'available' ? '#0a200a' : '#1a1a1a';
      ctx.fill();

      // 테두리
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = status === 'invested' ? NODE_COLORS.border_invested :
        status === 'available' ? NODE_COLORS.border_available : NODE_COLORS.border_locked;
      ctx.lineWidth = status === 'invested' ? 3 : status === 'available' ? 2.5 : 1;
      ctx.stroke();

      // 내부 채움 (invested)
      if (status === 'invested') {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r - 3, 0, Math.PI * 2);
        ctx.fillStyle = NODE_COLORS.invested;
        ctx.globalAlpha = 0.6;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // 텍스트 (코스트)
      ctx.fillStyle = status === 'invested' ? '#fff' : status === 'available' ? '#cfc' : '#666';
      ctx.font = `bold ${node.tier === 'large' ? 12 : node.tier === 'medium' ? 11 : 9}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.cost.toString(), pos.x, pos.y);
    }
  }, [zoneNodes, invested, offset, treeState]);

  // 캔버스 클릭 → 노드 찾기
  function handleCanvasClick(e: React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (const node of zoneNodes) {
      const pos = getNodePos(node);
      const r = NODE_RADIUS[node.tier] || 14;
      const dist = Math.sqrt((mx - pos.x) ** 2 + (my - pos.y) ** 2);
      if (dist <= r + 4) {
        setSelected(node);
        return;
      }
    }
    setSelected(null);
  }

  // 캔버스 호버 → 툴팁
  function handleCanvasMove(e: React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas || dragRef.current.dragging) { setTooltip(null); return; }
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (const node of zoneNodes) {
      const pos = getNodePos(node);
      const r = NODE_RADIUS[node.tier] || 14;
      if (Math.sqrt((mx - pos.x) ** 2 + (my - pos.y) ** 2) <= r + 4) {
        setTooltip({ node, x: e.clientX, y: e.clientY });
        return;
      }
    }
    setTooltip(null);
  }

  // 드래그
  function handleMouseDown(e: React.MouseEvent) {
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startOx: offset.x, startOy: offset.y };
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!dragRef.current.dragging) { handleCanvasMove(e); return; }
    setOffset({
      x: dragRef.current.startOx + (e.clientX - dragRef.current.startX),
      y: dragRef.current.startOy + (e.clientY - dragRef.current.startY),
    });
  }
  function handleMouseUp() { dragRef.current.dragging = false; }

  async function invest(nodeId: number) {
    if (!active || loading) return;
    setLoading(true); setMsg('');
    try {
      await api(`/characters/${active.id}/nodes/invest`, { method: 'POST', body: JSON.stringify({ nodeId }) });
      await fetchNodes(); await refreshActive();
    } catch (e: any) { setMsg(e?.message || '투자 실패'); }
    setLoading(false);
  }

  async function resetPartial() {
    if (!active || loading) return;
    if (!confirm('부분 리셋 (500G)')) return;
    setLoading(true);
    try { await api(`/characters/${active.id}/nodes/reset-partial`, { method: 'POST' }); await fetchNodes(); await refreshActive(); setMsg('리셋 완료!'); }
    catch (e: any) { setMsg(e?.message || '실패'); }
    setLoading(false);
  }
  async function resetZone() {
    if (!active || loading) return;
    if (!confirm(`구역 리셋 (2,000G): ${ZONE_LABELS[activeZone]}`)) return;
    setLoading(true);
    try { await api(`/characters/${active.id}/nodes/reset-zone`, { method: 'POST', body: JSON.stringify({ zone: activeZone }) }); await fetchNodes(); await refreshActive(); setMsg('리셋 완료!'); }
    catch (e: any) { setMsg(e?.message || '실패'); }
    setLoading(false);
  }
  async function resetAll() {
    if (!active || loading) return;
    if (!confirm('전체 리셋 (5,000G)')) return;
    setLoading(true);
    try { await api(`/characters/${active.id}/nodes/reset-all`, { method: 'POST' }); await fetchNodes(); await refreshActive(); setMsg('리셋 완료!'); }
    catch (e: any) { setMsg(e?.message || '실패'); }
    setLoading(false);
  }

  if (!treeState) return <div style={{ color: 'var(--text-dim)' }}>로딩 중...</div>;

  const tierLabel = (t: string) => t === 'large' ? '키스톤' : t === 'medium' ? '중형' : '소형';

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ color: 'var(--accent)' }}>노드 트리</h2>
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          <span style={{ color: 'var(--accent)' }}>{treeState.availablePoints}</span>
          <span style={{ color: 'var(--text-dim)' }}> / {treeState.totalPoints} pt</span>
        </div>
      </div>

      {/* Zone tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {zones.map(z => (
          <button key={z} onClick={() => setActiveZone(z)} style={{
            padding: '5px 12px', fontSize: 12,
            background: activeZone === z ? 'var(--accent)' : 'var(--bg-panel)',
            color: activeZone === z ? '#000' : 'var(--text-dim)',
            border: `1px solid ${activeZone === z ? 'var(--accent)' : 'var(--border)'}`,
            fontWeight: activeZone === z ? 700 : 400,
          }}>
            {ZONE_LABELS[z] || z}
          </button>
        ))}
      </div>

      {msg && <div style={{ color: 'var(--accent)', marginBottom: 8, fontSize: 13 }}>{msg}</div>}

      {/* Canvas */}
      <div ref={containerRef} style={{
        position: 'relative', border: '1px solid var(--border)', background: '#0d0d0d',
        marginBottom: 12, cursor: dragRef.current.dragging ? 'grabbing' : 'grab',
        overflow: 'hidden',
      }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: 500 }}
          onClick={handleCanvasClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { handleMouseUp(); setTooltip(null); }}
        />
        {/* 범례 */}
        <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', gap: 12, fontSize: 11 }}>
          <span style={{ color: NODE_COLORS.border_invested }}>● 투자됨</span>
          <span style={{ color: NODE_COLORS.border_available }}>● 투자 가능</span>
          <span style={{ color: NODE_COLORS.border_locked }}>● 잠김</span>
          <span style={{ color: 'var(--text-dim)' }}>드래그로 이동</span>
        </div>

        {/* 툴팁 */}
        {tooltip && (
          <div style={{
            position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 10,
            padding: '8px 12px', background: 'rgba(0,0,0,0.9)', border: '1px solid var(--accent)',
            fontSize: 12, pointerEvents: 'none', zIndex: 100, maxWidth: 250,
          }}>
            <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>
              {tooltip.node.name} <span style={{ color: 'var(--text-dim)' }}>({tooltip.node.cost}pt {tierLabel(tooltip.node.tier)})</span>
            </div>
            <div style={{ color: '#ccc' }}>{tooltip.node.description}</div>
          </div>
        )}
      </div>

      {/* Selected node detail */}
      {selected && (
        <div style={{
          padding: 14, background: 'var(--bg-panel)', border: `1px solid ${
            nodeStatus(selected) === 'invested' ? 'var(--accent)' :
            nodeStatus(selected) === 'available' ? 'var(--success)' : 'var(--border)'}`,
          marginBottom: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: nodeStatus(selected) === 'invested' ? 'var(--accent)' : '#fff' }}>
                {selected.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                {tierLabel(selected.tier)} · {selected.cost}pt · {selected.description}
              </div>
              {selected.prerequisites.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  선행: {selected.prerequisites.map(pid => {
                    const pn = treeState.nodes.find(n => n.id === pid);
                    return pn ? pn.name : `#${pid}`;
                  }).join(', ')}
                  {selected.prerequisites.every(pid => invested.has(pid))
                    ? ' (충족)' : ' (미충족)'}
                </div>
              )}
            </div>
            <div>
              {nodeStatus(selected) === 'available' && (
                <button onClick={() => invest(selected.id)} disabled={loading} style={{
                  padding: '6px 16px', background: 'var(--success)', color: '#000', border: 'none', fontWeight: 700,
                }}>투자</button>
              )}
              {nodeStatus(selected) === 'invested' && (
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>투자됨</span>
              )}
              {nodeStatus(selected) === 'locked' && (
                <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>선행 노드 필요</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reset buttons */}
      <div style={{ display: 'flex', gap: 8, padding: 10, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
        <button onClick={resetPartial} disabled={loading} style={{ fontSize: 11, padding: '5px 10px' }}>부분 리셋 500G</button>
        <button onClick={resetZone} disabled={loading} style={{ fontSize: 11, padding: '5px 10px' }}>구역 리셋 2,000G</button>
        <button onClick={resetAll} disabled={loading} style={{ fontSize: 11, padding: '5px 10px', color: 'var(--danger)' }}>전체 리셋 5,000G</button>
      </div>
    </div>
  );
}
