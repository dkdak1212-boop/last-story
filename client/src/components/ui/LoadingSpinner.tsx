export function LoadingSpinner({ message }: { message?: string }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
      <div>{message || '로딩 중...'}</div>
    </div>
  );
}
