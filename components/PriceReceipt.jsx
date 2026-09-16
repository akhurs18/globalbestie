'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Receipt from './Receipt';
import Sparkle from './Sparkle';
import Reveal from './Reveal';
import { products, priceBreakdown, pkr, settings } from '@/lib/products';

export default function PriceReceipt({ product, batchNo = settings.currentBatch.number }) {
  const p = product ?? products[0];
  const b = priceBreakdown(p);
  const wrap = useRef(null);
  const root = useRef(null);
  const total = useRef(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const el = root.current;
      const rows = el.querySelectorAll('[data-row]');
      const counter = { v: 0 };
      gsap.set(el, { clipPath: 'inset(0 0 100% 0)' });
      gsap.set(rows, { opacity: 0, y: 8 });
      gsap
        .timeline({ scrollTrigger: { trigger: wrap.current, start: 'top 70%', once: true } })
        .to(el, { clipPath: 'inset(0 0 0% 0)', duration: 1.4, ease: 'power2.out' })
        .to(rows, { opacity: 1, y: 0, stagger: 0.12, duration: 0.4 }, '<0.2')
        .to(counter, {
          v: b.total,
          duration: 1.1,
          ease: 'power1.out',
          onUpdate: () => {
            if (total.current) total.current.textContent = pkr(counter.v);
          },
        }, '-=0.6');
    });
    return () => mm.revert();
  }, [b.total]);

  return (
    <section className="sec">
      <div className="wrap receipt-grid">
        <Reveal className="stack-lg">
          <p className="label">No hidden fees</p>
          <h2 className="h2">One price.<br />Everything in.</h2>
          <p className="lead">
            The price on the tag is the price you pay. Shipping from the US is already in it, there is no customs bill at
            your door, and we confirm it with you before you pay a rupee.
          </p>
          <Link href="/how-it-works" className="btn btn--ink">How pricing works →</Link>
        </Reveal>
        <div className="receipt-wrap" ref={wrap}>
          <span className="sticker">honest pricing</span>
          <Sparkle size={40} tone="ink" />
          <Receipt b={b} item={p.name} batch={batchNo} rootRef={root} totalRef={total} />
        </div>
      </div>
    </section>
  );
}
