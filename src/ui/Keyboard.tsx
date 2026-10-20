import { memo } from 'react';

const LOW = 36;
const HIGH = 96;
const BLACK = new Set([1, 3, 6, 8, 10]);

function KeyboardImpl({ active }: { active: readonly number[] }) {
  const on = new Set(active);
  const whites: number[] = [];
  for (let n = LOW; n <= HIGH; n++) if (!BLACK.has(n % 12)) whites.push(n);
  const w = 1000 / whites.length;
  const blacks: { n: number; x: number }[] = [];
  whites.forEach((n, i) => {
    if (BLACK.has((n + 1) % 12) && n + 1 <= HIGH)
      blacks.push({ n: n + 1, x: (i + 1) * w - w * 0.3 });
  });
  return (
    <svg
      viewBox="0 0 1000 72"
      preserveAspectRatio="none"
      role="img"
      aria-label="Keyboard"
    >
      {whites.map((n, i) => (
        <rect
          key={n}
          x={i * w}
          y={0}
          width={w}
          height={72}
          style={{ fill: on.has(n) ? 'var(--pink)' : 'var(--black)' }}
        />
      ))}
      {whites.slice(1).map((n, i) => (
        <line
          key={n}
          x1={(i + 1) * w}
          x2={(i + 1) * w}
          y1={0}
          y2={72}
          style={{ stroke: 'var(--white)' }}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {blacks.map(({ n, x }) => (
        <rect
          key={n}
          x={x}
          y={0}
          width={w * 0.6}
          height={44}
          style={{ fill: on.has(n) ? 'var(--pink)' : 'var(--white)' }}
        />
      ))}
    </svg>
  );
}

export const Keyboard = memo(
  KeyboardImpl,
  (a, b) =>
    a.active.length === b.active.length && a.active.every((n, i) => n === b.active[i]),
);
