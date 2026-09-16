'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { settings } from '@/lib/products';

const STAGES = ['Collecting', 'Sourcing', 'Shipped', 'Arriving', 'Arrived'];

/** `batch` = { number, stage (0–4), dates[5] } from lib/live.js. Nothing renders without one. */
export default function BatchTracker({ batch }) {
  if (!batch) return null;
  return <Tracker t={batch} />;
}

function Tracker({ t }) {
  const target = t.stage / (STAGES.length - 1);
  const box = useRef(null);
  const stageEls = useRef([]);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = box.current;
    const apply = (p) => {
      el.style.setProperty('--p', p.toFixed(4));
      stageEls.current.forEach((s, i) => {
        const reached = i / (STAGES.length - 1) <= p + 0.001;
        s.classList.toggle('is-done', reached && i < t.stage);
        s.classList.toggle('is-current', reached && i === t.stage);
      });
    };
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const o = { p: 0 };
      apply(0);
      gsap.to(o, {
        p: target,
        ease: 'none',
        onUpdate: () => apply(o.p),
        scrollTrigger: { trigger: el, start: 'top 80%', end: 'top 30%', scrub: 0.8 },
      });
    });
    mm.add('(prefers-reduced-motion: reduce)', () => apply(target));
    return () => mm.revert();
  }, [target, t.stage]);

  return (
    <div className="tracker" ref={box} style={{ '--p': target }}>
      <div className="tracker__ends">
        <div className="tracker__place"><b>USA</b><small>New York</small></div>
        <span className="chip">Batch {t.number} · ETA ~{settings.preorderWeeks} weeks*</span>
        <div className="tracker__place" style={{ textAlign: 'right' }}><b>PK</b><small>Lahore / Karachi / Islamabad</small></div>
      </div>
      <div className="tracker__rail" aria-hidden="true">
        <div className="tracker__fill" />
        <span className="tracker__plane chip chip--ink">Batch {t.number}</span>
      </div>
      <ol className="tracker__stages" style={{ listStyle: 'none', padding: 0 }}>
        {STAGES.map((s, i) => (
          <li
            key={s}
            ref={(node) => { stageEls.current[i] = node; }}
            className={`stage ${i < t.stage ? 'is-done' : ''} ${i === t.stage ? 'is-current' : ''}`}
            style={{ '--i': i }}
            aria-current={i === t.stage ? 'step' : undefined}
          >
            <span className="stage__dot" />
            <span className="stage__label">{s}</span>
            <span className="stage__date">{t.dates?.[i] ?? ''}</span>
          </li>
        ))}
      </ol>
      <p className="tracker__note">*Batch timing can vary. We update you at every stage.</p>
    </div>
  );
}
