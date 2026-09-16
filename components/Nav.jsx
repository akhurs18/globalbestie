'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Logo from './Logo';
import BagLink from './BagLink';

const LINKS = [
  ['/shop', 'Shop'],
  ['/#drop', 'The Drop'],
  ['/request', 'Request anything'],
  ['/how-it-works', 'How it works'],
  ['/track', 'Track order'],
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className={`nav ${open ? 'is-open' : ''}`}>
      <div className="wrap nav__inner">
        <Logo />
        <nav className="nav__links" aria-label="Main">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
        </nav>
        <div className="nav__actions">
          <Link href="/#club" className="btn btn--ghost btn--sm hide-sm">Bestie Club</Link>
          <BagLink className="btn btn--berry btn--sm" />
          <button
            type="button"
            className="nav__burger"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="nav-sheet"
            onClick={() => setOpen((o) => !o)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>
      <div className="nav__sheet" id="nav-sheet">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>
        ))}
        <Link href="/#club" onClick={() => setOpen(false)}>Bestie Club</Link>
      </div>
    </header>
  );
}
