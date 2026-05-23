// 백그라운드 탭 스로틀링 방지용 무음 오디오 keepalive.
// 크롬은 비활성 탭의 타이머/렌더를 강하게 스로틀(5분 후 1분에 1회)하지만,
// "오디오 재생 중"인 탭은 이 강제 스로틀에서 제외된다. 사실상 무음 오디오를
// 흘려보내 온라인 방치(전투) 화면이 백그라운드에서도 계속 갱신되게 한다.

let ctx: AudioContext | null = null;
let osc: OscillatorNode | null = null;

export function startKeepAlive(): void {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      const gain = ctx.createGain();
      gain.gain.value = 0.0008; // 사실상 무음 (가청 한계 이하)
      osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 1; // 1Hz — 들리지 않음
      osc.connect(gain).connect(ctx.destination);
      osc.start();
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* 오디오 미지원/차단 — 무시 */ }
}

export function stopKeepAlive(): void {
  try { osc?.stop(); } catch { /* noop */ }
  try { void ctx?.close(); } catch { /* noop */ }
  osc = null;
  ctx = null;
}
