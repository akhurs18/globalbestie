'use client';

import Link from 'next/link';
import { useBag } from './BagProvider';

export default function BagLink({ className = '', label = 'Bag' }) {
  const { count, ready } = useBag();
  const n = ready ? count : 0;
  return (
    <Link href="/bag" className={className} aria-label={`${label}, ${n} item${n === 1 ? '' : 's'}`}>
      {label}
      {n > 0 && <span className="bag-count">{n}</span>}
    </Link>
  );
}
