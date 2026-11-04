/** Dhaka at dusk: Shaheed Minar, the National Parliament (Sangsad Bhaban) and city towers. */
export function DhakaSkyline({ className = "" }: { className?: string }) {
  // Deterministic "lit windows" so server and client render the same thing.
  const windows = Array.from({ length: 90 }, (_, i) => {
    const r = Math.sin(i * 12.9898) * 43758.5453;
    return { x: (i * 53) % 1440, y: 70 + ((i * 37) % 110), on: r - Math.floor(r) > 0.45 };
  });
  return (
    <svg viewBox="0 0 1440 240" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="sky-fade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0d1430" stopOpacity="0.6" />
          <stop offset="1" stopColor="#070b1a" />
        </linearGradient>
      </defs>
      {/* far towers */}
      <g fill="#141c3d">
        {[[20, 90, 60], [95, 60, 45], [150, 110, 70], [240, 75, 40], [960, 95, 55], [1030, 55, 70], [1120, 120, 50], [1190, 80, 60], [1270, 100, 45], [1330, 65, 80], [1400, 105, 40]].map(([x, y, w]) => (
          <rect key={x} x={x} y={y} width={w} height={240 - y} />
        ))}
      </g>
      {windows.map((w, i) => w.on && <rect key={i} x={w.x + 6} y={w.y} width="4" height="5" fill="#ffcf73" opacity="0.55" />)}
      {/* Shaheed Minar: sun disc behind five frames, the centre one bowing forward */}
      <circle cx="420" cy="118" r="34" fill="#e8443a" opacity="0.85" />
      <g fill="none" stroke="#0a1024" strokeWidth="7" strokeLinejoin="round">
        <path d="M392 240 V122 Q420 100 448 122 V240" />
        <path d="M362 240 V150 H378 V240" />
        <path d="M462 240 V150 H478 V240" />
        <path d="M338 240 V172 H350 V240" />
        <path d="M490 240 V172 H502 V240" />
      </g>
      {/* National Parliament: concrete block with circle and triangle openings */}
      <g>
        <rect x="560" y="120" width="330" height="120" fill="#0f1633" />
        <rect x="650" y="95" width="150" height="145" fill="#111a3a" />
        {[600, 690, 760, 850].map((cx) => <circle key={cx} cx={cx} cy="165" r="17" fill="#ffb347" opacity="0.18" />)}
        <path d="M700 230 L725 182 L750 230 Z" fill="#ffb347" opacity="0.22" />
        <path d="M655 120 L680 104 L705 120 Z" fill="#ffb347" opacity="0.15" />
        <rect x="545" y="232" width="360" height="8" fill="#1d2c55" opacity="0.9" />
      </g>
      {/* near towers */}
      <g fill="#0a1024">
        {[[0, 150, 80], [180, 165, 90], [270, 140, 55], [910, 160, 60], [1000, 140, 90], [1240, 155, 70], [1360, 130, 80]].map(([x, y, w]) => (
          <rect key={x} x={x} y={y} width={w} height={240 - y} />
        ))}
      </g>
      <rect x="0" y="200" width="1440" height="40" fill="url(#sky-fade)" />
    </svg>
  );
}
