// 8 class pixel art icons (DCSS CC0)
import type { ClassName } from '../../types';

interface Props {
  className: ClassName;
  size?: number;
}

export function ClassIcon({ className, size = 32 }: Props) {
  return (
    <img
      src={`/images/classes/${className}.png`}
      alt={className}
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated', flexShrink: 0 }}
    />
  );
}
