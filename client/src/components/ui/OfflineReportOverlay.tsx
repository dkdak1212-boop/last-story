import { motion } from 'framer-motion';
import { useCharacterStore } from '../../stores/characterStore';
import { GRADE_COLOR } from './ItemStats';

export function OfflineReportOverlay() {
  const report = useCharacterStore((s) => s.pendingReport);
  const ack = useCharacterStore((s) => s.ackReport);

  if (!report) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          width: 440,
          padding: 28,
          background: 'var(--bg-panel)',
          border: '1px solid var(--accent)',
        }}
      >
        <h2 style={{ color: 'var(--accent)', marginBottom: 6 }}>돌아온 이야기</h2>
        <p style={{ color: 'var(--text-dim)', marginBottom: 20, fontSize: 13 }}>
          {report.minutesAccounted}분 간 모험의 결과 · 효율 {Math.round(report.efficiency * 100)}%
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <Stat label="처치" value={`${report.killCount}마리`} />
          <Stat label="경험치" value={`+${report.expGained}`} />
          <Stat label="골드" value={`+${report.goldGained}G`} />
          <Stat label="레벨업" value={report.levelsGained > 0 ? `+${report.levelsGained}` : '-'} highlight={report.levelsGained > 0} />
        </div>

        {report.itemsDropped.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>획득 아이템</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {report.itemsDropped.map((i) => (
                <div key={i.itemId} style={{ fontSize: 13 }}>
                  <span style={{ color: GRADE_COLOR[i.grade], fontWeight: 700 }}>{i.name}</span>
                  <span style={{ color: 'var(--text-dim)' }}> ×{i.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {report.overflow > 0 && (
          <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>
            가방 초과분 {report.overflow}개가 우편함에 배송됨
          </div>
        )}

        <button className="primary" onClick={ack} style={{ width: '100%' }}>
          받기
        </button>
      </motion.div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ padding: 10, background: 'var(--bg-elev)', border: '1px solid var(--border)' }}>
      <div style={{ color: 'var(--text-dim)', fontSize: 11, marginBottom: 2 }}>{label}</div>
      <div style={{ color: highlight ? 'var(--accent)' : 'var(--text)', fontWeight: 700 }}>{value}</div>
    </div>
  );
}
