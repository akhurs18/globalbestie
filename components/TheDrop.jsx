'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import ProductCard from './ProductCard';
import Countdown from './Countdown';
import { channel, contactLink } from '@/lib/site';

export default function TheDrop({ items, batch }) {
  const section = useRef(null);
  const viewport = useRef(null);
  const track = useRef(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add('(min-width: 901px) and (prefers-reduced-motion: no-preference)', () => {
      const distance = () => Math.max(0, track.current.scrollWidth - viewport.current.clientWidth);
      gsap.to(track.current, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: section.current,
          start: 'top top',
          end: () => `+=${distance()}`,
          pin: true,
          scrub: 0.6,
          invalidateOnRefresh: true,
        },
      });
    });
    return () => mm.revert();
  }, []);

  return (
    <section id="drop" className="drop" ref={section}>
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
      <div className="drop__viewport" ref={viewport}>
        <div className="drop__track" ref={track}>
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
