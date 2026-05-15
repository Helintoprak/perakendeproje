interface Props {
  className?: string;
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: { w: 130, h: 38 },
  md: { w: 175, h: 52 },
  lg: { w: 230, h: 68 },
};

export default function SporthinkLogo({ className = '', variant = 'dark', size = 'md' }: Props) {
  const { w, h } = sizes[size];
  const textFill = variant === 'light' ? '#FFFFFF' : '#1A1A1A';
  const pinFill  = variant === 'light' ? '#FFFFFF' : '#D42B2B';
  const pinHole  = variant === 'light' ? '#D42B2B' : '#FFFFFF';
  const regFill  = variant === 'light' ? 'rgba(255,255,255,0.7)' : 'rgba(26,26,26,0.5)';

  // ViewBox: 280 × 72  |  tüm ölçüler bu koordinat sistemine göre
  // Baseline: y = 58   |  fontSize = 54 bold
  // Cap-height ≈ 39px  →  cap-top  ≈ 58 − 39 = 19
  // "sp" genişliği ≈ 68px  →  pin x-başlangıcı = 68
  // Pin: 28 × 38 (genişlik × yükseklik)  →  translate(68, 20)  bottom = 20+38 = 58 ✓
  // "rthink" x-başlangıcı = 68 + 28 + 2 = 98

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 280 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Sporthink"
    >
      {/* "sp" */}
      <text
        x="0"
        y="58"
        fontSize="54"
        fontWeight="800"
        fill={textFill}
        fontFamily="Inter, Montserrat, system-ui, sans-serif"
        letterSpacing="-1"
      >
        sp
      </text>

      {/* Konum iğnesi — "o" yerine, tip baseline'a (y=58) değiyor */}
      {/* translate(68, 20): top=20, bottom=20+38=58, width=28 */}
      <g transform="translate(68, 20)">
        {/* Pin gövdesi */}
        <path
          d="M14 0C6.27 0 0 6.27 0 14C0 24.5 14 38 14 38C14 38 28 24.5 28 14C28 6.27 21.73 0 14 0Z"
          fill={pinFill}
        />
        {/* İç daire */}
        <circle cx="14" cy="14" r="5.5" fill={pinHole} />
      </g>

      {/* "rthink" — pin bittikten hemen sonra başlıyor */}
      <text
        x="100"
        y="58"
        fontSize="54"
        fontWeight="800"
        fill={textFill}
        fontFamily="Inter, Montserrat, system-ui, sans-serif"
        letterSpacing="-1"
      >
        rthink
      </text>

      {/* ® işareti — "k" harfinin hemen sağ üstü */}
      <text
        x="258"
        y="26"
        fontSize="16"
        fontWeight="400"
        fill={regFill}
        fontFamily="Inter, system-ui, sans-serif"
      >
        ®
      </text>
    </svg>
  );
}
