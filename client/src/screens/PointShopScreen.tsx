import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { useNavigate } from 'react-router-dom';

interface CloakSlot {
  index: number;
  prefixId: number;
  name: string;
  tier: number;
  statKey: string;
  value: number;
}

interface InfoState {
  points: number;
  exp: number;
  level: number;
  gold: number;
  convertibleExp: number;
  convertiblePoints: number;
  rates: { expPerPoint: number; goldPerPoint: number; rollCost: number };
  maxSlots: number;
  cloak: CloakSlot[];
}

// 접두사 효과 간단 설명 (PrefixDisplay 와 동일 문구)
const EFFECT_DESC: Record<string, (v: number) => string> = {
  str: v => `힘 +${v}`, dex: v => `민첩 +${v}`, int: v => `지능 +${v}`, vit: v => `체력 +${v}`,
  spd: v => `스피드 +${v}`, cri: v => `치명타 확률 +${v}%`, accuracy: v => `명중 +${v}`, dodge: v => `회피 +${v}`,
  atk_pct: v => `공격력 +${v}%`, matk_pct: v => `마법공격 +${v}%`, max_hp_pct: v => `최대 HP +${v}%`,
  crit_dmg_pct: v => `치명타 데미지 +${v}%`, lifesteal_pct: v => `흡혈 ${v}%`, multi_hit_amp_pct: v => `다단 타격 +${v}%`,
  berserk_pct: v => `HP 35%↓ 데미지 +${v}%`, def_pierce_pct: v => `적 방어 ${v}% 무시`,
  single_hit_amp_pct: v => `단일 타격 +${v}%`, enemy_frenzy: v => `적 속도 +${v}% / 적뎀 -${(v * 0.1).toFixed(1)}%`,
  boss_slayer_pct: v => `보스·엘리트 +${v}%`, spd_to_dmg_pct: v => `속도 비례 (1000당 +${v}%, 최대 40%)`,
  crit_resist_pierce_pct: v => `적 치명저항 -${v}%p`,
};
function describe(statKey: string, value: number): string {
  const f = EFFECT_DESC[statKey];
  return f ? f(value) : `${statKey} +${value}`;
}
function tierColor(t: number): string {
  return t === 4 ? '#ff4444' : t === 3 ? '#ffcc33' : t === 2 ? '#b060cc' : '#5b8ecc';
}

export function PointShopScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const navigate = useNavigate();
  const [info, setInfo] = useState<InfoState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [convertQty, setConvertQty] = useState(1);
  const [goldQty, setGoldQty] = useState(1);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  const load = async () => {
    if (!active) return;
    setLoading(true);
    try {
      const data = await api<InfoState>(`/point-shop/${active.id}/info`);
      setInfo(data);
    } catch (e: any) {
      setMsg(typeof e?.message === 'string' ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [active?.id]);

  const doConvert = async () => {
    if (!active || busy || convertQty <= 0) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ gainedPoints: number; spentExp: number }>(
        `/point-shop/${active.id}/convert`,
        { method: 'POST', body: JSON.stringify({ points: convertQty }) }
      );
      setMsg(`EXP ${r.spentExp.toLocaleString()} → 포인트 +${r.gainedPoints.toLocaleString()}`);
      await load();
    } catch (e: any) {
      setMsg(typeof e?.message === 'string' ? e.message : '전환 실패');
    } finally { setBusy(false); }
  };

  const doBuyGold = async () => {
    if (!active || busy || goldQty <= 0) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ spentPoints: number; gainedGold: number }>(
        `/point-shop/${active.id}/buy-gold`,
        { method: 'POST', body: JSON.stringify({ points: goldQty }) }
      );
      setMsg(`포인트 ${r.spentPoints.toLocaleString()} → 골드 +${r.gainedGold.toLocaleString()}`);
      await load();
    } catch (e: any) {
      setMsg(typeof e?.message === 'string' ? e.message : '환전 실패');
    } finally { setBusy(false); }
  };

  const doRoll = async () => {
    if (!active || busy || !info) return;
    const full = info.cloak.length >= info.maxSlots;
    if (full && selectedSlot === null) {
      setMsg('접두사가 3개 꽉 찼습니다. 교체할 슬롯을 선택하세요.');
      return;
    }
    if (!confirm(`낡은 망토 굴림 (${info.rates.rollCost.toLocaleString()} 포인트 소모)${full ? ` — 슬롯 ${selectedSlot! + 1} 교체` : ''} 진행할까요?`)) return;
    setBusy(true); setMsg(null);
    try {
      const body = full ? { slotIndex: selectedSlot } : {};
      const r = await api<{ roll: { statKey: string; value: number; tier: number; replacedSlot: number | null } }>(
        `/point-shop/${active.id}/roll-cloak`,
        { method: 'POST', body: JSON.stringify(body) }
      );
      setMsg(`굴림 결과: [T${r.roll.tier}] ${describe(r.roll.statKey, r.roll.value)}`);
      setSelectedSlot(null);
      await load();
    } catch (e: any) {
      setMsg(typeof e?.message === 'string' ? e.message : '굴림 실패');
    } finally { setBusy(false); }
  };

  if (!active) return <div style={{ padding: 20, color: '#aaa' }}>캐릭터를 선택해주세요.</div>;
  if (loading || !info) return <div style={{ padding: 20, color: '#aaa' }}>로딩 중…</div>;

  const full = info.cloak.length >= info.maxSlots;
  const box = { padding: '8px 14px', background: '#1a1612', border: '1px solid #444', borderRadius: 4, fontSize: 14 } as const;
  const card = { background: '#15120f', border: '1px solid #3a332b', borderRadius: 6, padding: 16, marginBottom: 16 } as const;
  const btn = (enabled: boolean) => ({
    padding: '8px 16px', background: enabled ? '#3a2f1a' : '#222', color: enabled ? '#daa520' : '#666',
    border: `1px solid ${enabled ? '#daa520' : '#444'}`, borderRadius: 4, cursor: enabled ? 'pointer' : 'not-allowed', fontWeight: 700,
  } as const);

  return (
    <div style={{ padding: 20, maxWidth: 760, margin: '0 auto', color: '#ddd' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <button onClick={() => navigate(-1)} style={{ padding: '6px 14px', background: '#2a2520', color: '#daa520', border: '1px solid #444', cursor: 'pointer', marginRight: 12 }}>← 돌아가기</button>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#daa520' }}>포인트 상점</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={box}>포인트: <span style={{ color: '#ffcc33', fontWeight: 700 }}>{info.points.toLocaleString()}</span></div>
          <div style={box}>골드: <span style={{ color: '#daa520', fontWeight: 700 }}>{info.gold.toLocaleString()}</span></div>
        </div>
      </div>

      {msg && <div style={{ padding: 10, marginBottom: 12, background: '#1e2a1e', border: '1px solid #555', fontSize: 13 }}>{msg}</div>}

      {/* §3 EXP → 포인트 전환 */}
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#9fd', marginBottom: 8 }}>만렙 후 EXP → 포인트 전환</div>
        {info.level < 100 ? (
          <div style={{ color: '#c88', fontSize: 13 }}>만렙(100) 도달 후 누적 EXP를 포인트로 전환할 수 있습니다. (현재 Lv.{info.level})</div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: '#aaa', marginBottom: 8 }}>
              전환 가능 EXP <b style={{ color: '#ddd' }}>{info.convertibleExp.toLocaleString()}</b> · 최대 <b style={{ color: '#ffcc33' }}>{info.convertiblePoints.toLocaleString()}</b> 포인트
              <span style={{ color: '#777' }}> (1,000만 EXP = 1 포인트)</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="number" min={1} max={Math.max(1, info.convertiblePoints)} value={convertQty}
                onChange={e => setConvertQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                style={{ width: 100, padding: 6, background: '#0d0b09', color: '#ddd', border: '1px solid #444', borderRadius: 4 }} />
              <span style={{ fontSize: 12, color: '#888' }}>포인트 = {(convertQty * info.rates.expPerPoint).toLocaleString()} EXP</span>
              <button onClick={doConvert} disabled={busy || info.convertiblePoints < convertQty} style={btn(!busy && info.convertiblePoints >= convertQty)}>전환</button>
            </div>
          </>
        )}
      </div>

      {/* §4-1 낡은 망토 접두사 굴림 */}
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#cda', marginBottom: 8 }}>낡은 망토 접두사 굴림 <span style={{ fontSize: 12, color: '#888' }}>({info.rates.rollCost.toLocaleString()} 포인트 / 회 · T1 95% · T4 0.1%)</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {Array.from({ length: info.maxSlots }).map((_, i) => {
            const slot = info.cloak[i];
            const selectable = full;
            const sel = selectedSlot === i;
            return (
              <div key={i}
                onClick={() => { if (selectable) setSelectedSlot(sel ? null : i); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  background: sel ? '#2a2212' : '#0f0d0b',
                  border: `1px solid ${sel ? '#ffcc33' : '#333'}`, borderRadius: 4,
                  cursor: selectable ? 'pointer' : 'default',
                }}>
                <span style={{ fontSize: 11, color: '#777', width: 44 }}>슬롯 {i + 1}</span>
                {slot ? (
                  <>
                    <span style={{ fontSize: 11, fontWeight: 900, color: tierColor(slot.tier), border: `1px solid ${tierColor(slot.tier)}`, borderRadius: 2, padding: '0 4px' }}>T{slot.tier}</span>
                    <span style={{ color: tierColor(slot.tier), fontWeight: 600 }}>{slot.name} · {describe(slot.statKey, slot.value)}</span>
                  </>
                ) : (
                  <span style={{ color: '#555', fontStyle: 'italic' }}>비어 있음</span>
                )}
              </div>
            );
          })}
        </div>
        {full && <div style={{ fontSize: 12, color: '#c88', marginBottom: 8 }}>3개 꽉 참 — 재굴림할 슬롯을 클릭해 선택하세요. {selectedSlot !== null && <b style={{ color: '#ffcc33' }}>(슬롯 {selectedSlot + 1} 선택됨)</b>}</div>}
        <button onClick={doRoll} disabled={busy || info.points < info.rates.rollCost || (full && selectedSlot === null)}
          style={btn(!busy && info.points >= info.rates.rollCost && (!full || selectedSlot !== null))}>
          {full ? '선택 슬롯 재굴림' : '새 접두사 굴림'}
        </button>
        <div style={{ fontSize: 11, color: '#777', marginTop: 6 }}>※ 낡은 망토는 거래 불가(귀속). 수치는 levelScale 1.5 고정 적용.</div>
      </div>

      {/* §4-2 포인트 → 골드 환전 */}
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#dca', marginBottom: 8 }}>포인트 → 골드 환전 <span style={{ fontSize: 12, color: '#888' }}>(1 포인트 = {info.rates.goldPerPoint.toLocaleString()} 골드)</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="number" min={1} max={Math.max(1, info.points)} value={goldQty}
            onChange={e => setGoldQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            style={{ width: 100, padding: 6, background: '#0d0b09', color: '#ddd', border: '1px solid #444', borderRadius: 4 }} />
          <span style={{ fontSize: 12, color: '#888' }}>포인트 → {(goldQty * info.rates.goldPerPoint).toLocaleString()} 골드</span>
          <button onClick={doBuyGold} disabled={busy || info.points < goldQty} style={btn(!busy && info.points >= goldQty)}>환전</button>
        </div>
      </div>
    </div>
  );
}
