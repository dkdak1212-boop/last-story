import { motion } from 'framer-motion';
import { useCharacterStore } from '../../stores/characterStore';
import { GRADE_COLOR } from './ItemStats';

export function OfflineReportOverlay() {
  const report = useCharacterStore((s) => s.pendingReport);
  const ack = useCharacterStore((s) => s.ackReport);

  if (!report) return null;

  const totalItems = report.itemsDropped.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          width: '90%', maxWidth: 420, padding: 24,
          background: 'linear-gradient(180deg, var(--bg-panel) 0%, var(--bg) 100%)',
          border: '2px solid var(--accent)', borderRadius: 8,
          boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 20px rgba(201,162,77,0.1)',
        }}
      >
        {/* 타이틀 */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--accent)', letterSpacing: 2 }}>방치 보상</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
            {report.minutesAccounted}분 동안의 모험 결과
          </div>
        </div>

        {/* 주요 보상 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <RewardCard label="처치" value={`${report.killCount.toLocaleString()}마리`} color="var(--danger)" />
          <RewardCard label="경험치" value={`+${report.expGained.toLocaleString()}`} color="#8b8bef" />
          <RewardCard label="골드" value={`+${report.goldGained.toLocaleString()}G`} color="#e0a040" />
          <RewardCard label="레벨업" value={report.levelsGained > 0 ? `+${report.levelsGained}` : '-'} color={report.levelsGained > 0 ? 'var(--accent)' : 'var(--text-dim)'} />
        </div>

        {/* 아이템 */}
        {report.itemsDropped.length > 0 && (
          <div style={{
            padding: 10, marginBottom: 12, borderRadius: 4,
            background: 'var(--bg)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>
              획득 아이템 ({totalItems}개)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 150, overflowY: 'auto' }}>
              {report.itemsDropped.map((i) => (
                <div key={i.itemId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: GRADE_COLOR[i.grade] || 'var(--text)', fontWeight: 700 }}>{i.name}</span>
                  <span style={{ color: 'var(--text-dim)' }}>x{i.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {report.overflow > 0 && (
          <div style={{
            padding: '6px 10px', marginBottom: 12, borderRadius: 4, fontSize: 11,
            background: 'rgba(192,90,74,0.1)', color: 'var(--danger)',
            border: '1px solid rgba(192,90,74,0.3)',
          }}>
            가방 초과분 {report.overflow}개 → 우편함 배송
          </div>
        )}

        <button onClick={ack} style={{
          width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 700,
          background: 'var(--accent)', color: '#000', border: 'none',
          borderRadius: 4, cursor: 'pointer',
        }}>
          확인
        </button>
      </motion.div>
    </div>
  );
}

function RewardCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 4,
      background: 'var(--bg)', border: '1px solid var(--border)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color }}>{value}</div>
    </div>
  );
}
