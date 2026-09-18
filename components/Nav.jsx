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
          <Link href="/my-orders">My orders</Link>
        </nav>
        <div className="nav__actions">
          <Link href="/shop#find" className="nav__search" aria-label="Search products" title="Search products">
            <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="7" cy="7" r="4.6" />
              <path d="M10.6 10.6 14 14" strokeLinecap="round" />
            </svg>
          </Link>
          {/* On a phone these two are the whole point of the header: the drop and the bag.
              They used to sit in a bar floating over the bottom of every page. */}
          <Link href="/#drop" className="btn btn--ink btn--sm nav__drop">Drop</Link>
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
        {/* The magnifier is hidden on the narrowest screens, so search lives here too. */}
        <Link href="/shop#find" onClick={() => setOpen(false)}>Search</Link>
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>
        ))}
        <Link href="/my-orders" onClick={() => setOpen(false)}>My orders</Link>
        <Link href="/#club" onClick={() => setOpen(false)}>Bestie Club</Link>
      </div>
    </header>
  );
}
