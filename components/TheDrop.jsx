'use client';

import Link from 'next/link';
import ProductCard from './ProductCard';
import Countdown from './Countdown';
import { channel, contactLink } from '@/lib/site';

/**
 * The Drop: one row of what is landing next.
 *
 * The row scrolls sideways under the reader's own finger or trackpad, and never on its
 * own. It used to be pinned to the viewport and dragged across as you scrolled down,
 * which takes the page away from the person reading it — you scroll to leave and the
 * page refuses. Vertical scrolling stays vertical; sideways is a choice.
 */
export default function TheDrop({ items, batch }) {
  return (
    <section id="drop" className="drop">
      <div className="wrap drop__head">
        <div className="stack">
          <p className="label">The Drop{batch ? ` / Batch ${batch.number}` : ''}</p>
          <h2 className="h2">Fresh from<br />the States.</h2>
        </div>
        <div className="countdown">
          {batch?.closesAt ? (
            <>
              <p className="mono muted">Batch closes in</p>
              <Countdown to={batch.closesAt} />
            </>
          ) : (
            <p className="mono muted">Next batch opens soon</p>
          )}
          <a
            className="btn btn--ink btn--sm"
            href={contactLink('Hi Global Bestie! Please let me know when the next drop is live.')}
            target="_blank"
            rel="noopener noreferrer"
          >
            Notify me on {channel}
          </a>
        </div>
      </div>
      <div className="drop__viewport">
        <div className="drop__track">
          {items.map((p) => (
            <ProductCard key={p.slug} p={p} />
          ))}
          <Link href="/shop" className="drop__end">
            <span className="h2" style={{ fontSize: 40 }}>See it all</span>
            <span className="btn btn--berry btn--sm">Shop everything →</span>
          </Link>
        </div>
      </div>
      <p className="wrap drop__hint mono muted">Scroll sideways →</p>
    </section>
  );
}
