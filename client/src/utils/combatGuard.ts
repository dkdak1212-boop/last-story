// 전투 중 변경 가드 — 사냥터(field:*) 위치면 확인창 띄움.
// 사용자 결정(2026-05-10): 차단이 아닌 확인창. OK 시 그대로 진행.
import { useCharacterStore } from '../stores/characterStore';

export function confirmIfInCombat(label: string): boolean {
  const active = useCharacterStore.getState().activeCharacter;
  if (!active?.location?.startsWith('field:')) return true;
  return confirm(
    `⚠ 전투 중 ${label} 변경\n\n` +
    `현재 사냥터에 있습니다. 즉시 적용되어 데미지·생존·쿨다운 등에 영향이 있을 수 있습니다.\n\n` +
    `계속하시겠습니까?`
  );
}
