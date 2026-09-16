const TONES = {
  chrome: 'url(#gb-chrome)',
  berry: 'var(--berry)',
  ink: 'var(--ink)',
  rose: 'var(--rose)',
  white: '#fff',
};

export default function Sparkle({ size = 24, tone = 'chrome', className = '', style }) {
  return (
    <svg
      className={`sparkle ${className}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      <path d="M50 0C54 36 64 46 100 50C64 54 54 64 50 100C46 64 36 54 0 50C36 46 46 36 50 0Z" fill={TONES[tone] || tone} />
    </svg>
  );
}
