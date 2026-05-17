// 망토 강화 화면
// - 7효과 현재 단계 + 환산 수치 표시
// - 정수 종류별 보유량 + "1개 사용 / 전체 사용" 버튼
// - 적용 후 굴림 결과 토스트
// spec: server/specs/cloak-equipment-system.md

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

interface CloakEffect {
  key: string;
  label: string;
  level: number;
  perStep: number;
  total: number;
  unit: 'flat' | 'pct';
}
interface CloakEssence {
  kind: 'balacas' | 'atras' | 'carnas';
  name: string;
  owned: number;
  stepGain: number;
}
interface CloakState {
  characterId: number;
  effects: CloakEffect[];
  totalEssencesUsed: number;
  essences: CloakEssence[];
}
interface ApplyResp {
  characterId: number;
  consumed: { kind: string; name: string; count: number };
  summary: { key: string; label: string; totalGain: number }[];
  rolls: { key: string; label: string; gain: number }[];
  effects: CloakEffect[];
  totalEssencesUsed: number;
}

const ESSENCE_COLOR: Record<string, string> = {
  balacas: '#ff7a59',  // 발라카스 = 용왕/파괴 = 적황
  atras: '#7cbbff',    // 아트라스 = 천공/방어 = 청
  carnas: '#c452ff',   // 카르나스 = 심연/치명 = 보라
};

function formatTotal(eff: CloakEffect): string {
  if (eff.unit === 'flat') return `+${eff.total}`;
  // pct — perStep 0.5, level N → N×0.5%
  const v = eff.level * eff.perStep;
  return `+${v.toFixed(1)}%`;
}

export function CloakScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [state, setState] = useState<CloakState | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function refresh() {
    if (!active) return;
    try {
      const r = await api<CloakState>(`/cloak/${active.id}`);
      setState(r);
    } catch (e) {
      console.error(e);
    }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [active?.id]);

  async function apply(kind: CloakEssence['kind'], count: number) {
    if (!active || busy || count <= 0) return;
    setBusy(true);
    try {
      const r = await api<ApplyResp>(`/cloak/${active.id}/apply`, {
        method: 'POST',
        body: JSON.stringify({ kind, count }),
      });
      const summary = r.summary.map(s =>
        `${s.label} +${s.totalGain}단계`
      ).join(' · ');
      setToast(`${r.consumed.name} ${count}개 → ${summary}`);
      setState({
        characterId: r.characterId,
        effects: r.effects,
        totalEssencesUsed: r.totalEssencesUsed,
        essences: state?.essences.map(e => e.kind === kind ? { ...e, owned: e.owned - count } : e) ?? [],
      });
      await refreshActive();
      setTimeout(() => setToast(null), 4500);
    } catch (e: any) {
      setToast(`실패: ${e?.message || '오류'}`);
      setTimeout(() => setToast(null), 3000);
    } finally {
      setBusy(false);
    }
  }

  if (!active) return <div style={{ padding: 16 }}>캐릭터를 선택하세요.</div>;
  if (!state) return <div style={{ padding: 16 }}>로딩 중...</div>;

  return (
    <div style={{ padding: 12, maxWidth: 600 }}>
      <h2 style={{ marginTop: 0 }}>망토 강화</h2>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
        정수 사용 시 7효과 중 1개가 균등 확률로 선택되어 단계가 오릅니다.
        <br />발라카스 +1단계 · 아트라스 +2단계 · 카르나스 +3단계 · cap 없음
      </div>

      <h3>현재 효과 (낡은 망토 +방어 10)</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #444' }}>
            <th style={{ textAlign: 'left', padding: '4px 6px' }}>효과</th>
            <th style={{ textAlign: 'right', padding: '4px 6px' }}>단계</th>
            <th style={{ textAlign: 'right', padding: '4px 6px' }}>누적</th>
            <th style={{ textAlign: 'right', padding: '4px 6px' }}>1단계당</th>
          </tr>
        </thead>
        <tbody>
          {state.effects.map(e => (
            <tr key={e.key} style={{ borderBottom: '1px solid #2a2a2a' }}>
              <td style={{ padding: '4px 6px' }}>{e.label}</td>
              <td style={{ padding: '4px 6px', textAlign: 'right', color: e.level > 0 ? '#ffe135' : '#888' }}>
                Lv.{e.level}
              </td>
              <td style={{ padding: '4px 6px', textAlign: 'right', color: e.total > 0 ? '#7cbbff' : '#888' }}>
                {formatTotal(e)}
              </td>
              <td style={{ padding: '4px 6px', textAlign: 'right', fontSize: 11, opacity: 0.7 }}>
                {e.unit === 'flat' ? `+${e.perStep}` : `+${e.perStep}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>
        누적 사용 정수: {state.totalEssencesUsed}개
      </div>

      <h3 style={{ marginTop: 18 }}>정수 사용</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {state.essences.map(e => (
          <div key={e.kind}
            style={{
              border: `1px solid ${ESSENCE_COLOR[e.kind]}`, borderRadius: 6, padding: 10,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: ESSENCE_COLOR[e.kind], fontWeight: 600 }}>
                {e.name} <span style={{ fontSize: 11, opacity: 0.8 }}>(+{e.stepGain}단계)</span>
              </div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>보유 {e.owned}</div>
            </div>
            <button disabled={busy || e.owned < 1} onClick={() => apply(e.kind, 1)}
              style={{ padding: '6px 10px' }}>
              1개 사용
            </button>
            <button disabled={busy || e.owned < 1} onClick={() => apply(e.kind, e.owned)}
              style={{ padding: '6px 10px' }}>
              전체 ({e.owned})
            </button>
          </div>
        ))}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a1a', border: '1px solid #ffe135', padding: '10px 16px',
          borderRadius: 6, zIndex: 100, maxWidth: '90%',
        }}>
          🎲 {toast}
        </div>
      )}
    </div>
  );
}
