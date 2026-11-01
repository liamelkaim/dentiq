// Original vector mountain scene for the top of every signed-in page (no photo, no stock image).
// Colors come from the --mountain-* tokens so the scene works in light and dark.

type Pt = [number, number];

// Ridge crests, left to right. Taller peaks sit on the right half, like the design mockups.
const FAR: Pt[] = [
  [0, 168], [70, 140], [130, 158], [210, 112], [262, 138], [330, 96], [386, 124], [452, 70], [500, 104], [548, 84],
  [606, 36], [650, 78], [700, 56], [752, 20], [800, 66], [846, 44], [902, 14], [950, 62], [1004, 40], [1058, 84],
  [1110, 52], [1160, 24], [1214, 72], [1266, 46], [1320, 88], [1366, 62], [1400, 84],
];
const NEAR: Pt[] = [
  [0, 200], [90, 176], [170, 196], [250, 160], [320, 184], [400, 140], [470, 176], [560, 128], [640, 170], [720, 120],
  [800, 168], [880, 112], [960, 160], [1040, 126], [1120, 172], [1200, 136], [1290, 178], [1400, 150],
];

function ridge(points: Pt[]): string {
  return `M0 230 L${points.map(([x, y]) => `${x} ${y}`).join(" L")} L1400 230 Z`;
}

/** Snow cap for each crest that is higher than `limit`: a ragged triangle running down both sides of the peak. */
function snow(points: Pt[], limit: number): string {
  return points
    .map(([x, y], i) => {
      const prev = points[i - 1];
      const next = points[i + 1];
      if (!prev || !next || y > limit) return "";
      const depth = 40 + ((i * 7) % 16);
      const lx = x - (x - prev[0]) * 0.52;
      const rx = x + (next[0] - x) * 0.52;
      return `M${x} ${y} L${lx} ${y + depth * 0.9} L${(lx + x) / 2 + 4} ${y + depth * 0.6} L${x - 2} ${y + depth} L${(rx + x) / 2} ${y + depth * 0.62} L${rx} ${y + depth * 0.95} Z`;
    })
    .join(" ");
}

/** Absolutely positioned band: sky, two ridge layers with snow caps, and a fade into the page background. */
export function MountainHeader({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={className}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1400 230" preserveAspectRatio="xMaxYMin slice">
        <defs>
          <linearGradient id="mh-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--mountain-sky)" />
            <stop offset="1" stopColor="var(--bg)" />
          </linearGradient>
          <linearGradient id="mh-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.5" stopColor="var(--bg)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--bg)" />
          </linearGradient>
          <linearGradient id="mh-left" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--bg)" stopOpacity="0.75" />
            <stop offset="0.45" stopColor="var(--bg)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="1400" height="230" fill="url(#mh-sky)" />
        <path d={ridge(FAR)} fill="var(--mountain-far)" />
        <path d={snow(FAR, 112)} fill="var(--mountain-snow)" />
        <path d={ridge(NEAR)} fill="var(--mountain-near)" />
        <path d={snow(NEAR, 150)} fill="var(--mountain-snow)" opacity="0.55" />
        <rect width="1400" height="230" fill="url(#mh-left)" />
        <rect width="1400" height="230" fill="url(#mh-fade)" />
      </svg>
    </div>
  );
}
