import Link from 'next/link';

export function LogoMark({ className = '' }) {
  return (
    <span className={`logo ${className}`}>
      <span className="logo__word">GLOBAL BESTIE</span>
      <span className="logo__script">by HAR</span>
    </span>
  );
}

export default function Logo({ className = '' }) {
  return (
    <Link href="/" className={`logo ${className}`} aria-label="Global Bestie by HAR, home">
      <span className="logo__word">GLOBAL BESTIE</span>
      <span className="logo__script">by HAR</span>
    </Link>
  );
}
