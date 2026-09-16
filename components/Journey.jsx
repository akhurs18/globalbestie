'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Reveal from './Reveal';
import { products, priceBreakdown, pkr, settings } from '@/lib/products';
import './journey.css';

// The flight path, in the SVG's 1200 × 340 space: USA on the left, Pakistan on the right.
const C = [[80, 270], [330, 20], [870, 20], [1120, 270]];
const D = `M ${C[0]} C ${C[1]} ${C[2]} ${C[3]}`;
const PLANE = 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';

function bezier(t) {
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [0, 1].map((axis) => k.reduce((sum, w, i) => sum + w * C[i][axis], 0));
}

// Sampled by length, so the plane, the drawn line and the waypoints all move at one pace.
const SAMPLES = (() => {
  const out = [];
  let len = 0;
  let prev = bezier(0);
  for (let i = 0; i <= 200; i++) {
    const pt = bezier(i / 200);
    len += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
    out.push({ x: pt[0], y: pt[1], len });
    prev = pt;
  }
  return out;
})();
const TOTAL = SAMPLES[SAMPLES.length - 1].len;

function at(f) {
  const target = Math.min(1, Math.max(0, f)) * TOTAL;
  let i = SAMPLES.findIndex((s) => s.len >= target);
  if (i <= 0) i = 1;
  const a = SAMPLES[i - 1];
  const b = SAMPLES[i];
  const k = b.len === a.len ? 0 : (target - a.len) / (b.len - a.len);
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
  };
}

const r2 = (n) => Math.round(n * 100) / 100;
const planeAt = (f) => {
  const { x, y, angle } = at(f);
  return `translate(${r2(x)} ${r2(y)}) rotate(${r2(angle + 90)})`;
};

const STEPS = [
  {
    f: 0.08, side: 'top', title: 'You send the wish',
    body: ({ name }) => (
      <>
        <p className="jmeta">Instagram DM</p>
        <p className="jbubble">Bestie, can you get me this? 🥺</p>
        <p className="jlink">🔗 {name}</p>
      </>
    ),
  },
  {
    f: 0.25, side: 'bottom', title: 'We quote in PKR',
    body: ({ b }) =>
      b.usd != null ? (
        <dl className="jrows">
          <div style={{ '--i': 0 }}><dt>US price</dt><dd>${b.usd.toLocaleString('en-US')}</dd></div>
          <div style={{ '--i': 1 }}><dt>× rate {b.fx}</dt><dd>{pkr(b.inPkr)}</dd></div>
          <div style={{ '--i': 2 }}><dt>+ {Math.round(b.markupRate * 100)}% markup</dt><dd>{pkr(b.markup)}</dd></div>
          <div style={{ '--i': 3 }}><dt>+ shipping</dt><dd>{pkr(b.shipping)}</dd></div>
          <div style={{ '--i': 4 }} className="jrows__total"><dt>Final price</dt><dd>{pkr(b.total)}</dd></div>
        </dl>
      ) : (
        <>
          <p className="jbig">{pkr(b.total)}</p>
          <p className="jnote">Your final PKR price. Nothing gets added later.</p>
        </>
      ),
  },
  {
    f: 0.42, side: 'top', title: 'You approve, pay 50%',
    body: ({ b }) => (
      <>
        <p className="jmeta">Bank transfer · 50% now</p>
        <p className="jbig">{pkr(b.advance)}</p>
        <span className="jstamp">✓ Advance confirmed</span>
      </>
    ),
  },
  {
    f: 0.58, side: 'bottom', title: 'We buy it in the US',
    body: ({ batchNo }) => (
      <>
        <p className="jicons" aria-hidden="true"><span>👜</span><span>👟</span><span>💄</span><b>→</b><span>📦</span></p>
        <p className="jnote">Bought from US retailers and packed for the flight.</p>
        {batchNo ? <span className="chip">Batch {batchNo}</span> : null}
      </>
    ),
  },
  {
    f: 0.74, side: 'top', title: 'It flies home',
    body: () => (
      <>
        <p className="jroute">USA <span>→</span> PK</p>
        <span className="chip jlive"><i />Batch in transit</span>
        <p className="jnote">About {settings.preorderWeeks} weeks. Timings can vary.</p>
      </>
    ),
  },
  {
    f: 0.9, side: 'bottom', title: 'It lands at your door',
    body: ({ b }) => (
      <>
        <p className="jsplit"><span>Other 50% on arrival</span><b>{pkr(b.balance)}</b></p>
        <p className="jdone">Delivered 🎁</p>
        <p className="jnote">We collect the balance before local delivery.</p>
      </>
    ),
  },
];

const LAST = STEPS.length - 1;

export default function Journey({ sample, batchNo }) {
  const product = sample ?? products[0];
  const ctx = { b: priceBreakdown(product), name: product.name, batchNo };

  const rootRef = useRef(null);
  const pinRef = useRef(null);
  const mapRef = useRef(null);
  const pathRef = useRef(null);
  const planeRef = useRef(null);
  const fillRef = useRef(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const root = rootRef.current;
    const cards = [...root.querySelectorAll('.jwp')];
    const dots = [...root.querySelectorAll('.jdot--step')];
    let current = null;

    const setStep = (idx) => {
      if (idx === current) return;
      current = idx;
      cards.forEach((c, i) => {
        c.classList.toggle('is-on', i <= idx);
        c.classList.toggle('is-now', i === idx);
      });
      dots.forEach((d, i) => d.classList.toggle('is-on', i <= idx));
      root.classList.toggle('is-landed', idx === LAST);
    };

    const fly = (p) => {
      pathRef.current.style.strokeDashoffset = String(1 - p);
      planeRef.current.setAttribute('transform', planeAt(p));
      setStep(STEPS.reduce((acc, s, i) => (p >= s.f ? i : acc), -1));
    };

    // Every layout needs a condition here: matchMedia only runs this when one matches.
    const mm = gsap.matchMedia();
    mm.add(
      { desktop: '(min-width: 901px)', mobile: '(max-width: 900px)', reduce: '(prefers-reduced-motion: reduce)' },
      ({ conditions }) => {
        // Reduced motion: the whole trip, drawn and landed, with nothing moving.
        if (conditions.reduce) {
          fly(1);
          return;
        }
        root.classList.add('is-live');

        if (conditions.desktop) {
          // Pinned: the scroll IS the flight, and scrolling back up rewinds it.
          const state = { p: 0 };
          fly(0);
          gsap.to(state, {
            p: 1,
            ease: 'none',
            onUpdate: () => fly(state.p),
            scrollTrigger: {
              trigger: pinRef.current,
              start: 'top top',
              end: '+=300%',
              pin: true,
              scrub: 0.6,
              anticipatePin: 1,
            },
          });
        } else {
          // Mobile: a vertical timeline. The rail fills with the scroll and each stop
          // switches on as it reaches the reader.
          setStep(-1);
          gsap.fromTo(fillRef.current, { scaleY: 0 }, {
            scaleY: 1,
            ease: 'none',
            scrollTrigger: { trigger: mapRef.current, start: 'top 70%', end: 'bottom 70%', scrub: true },
          });
          cards.forEach((c) =>
            ScrollTrigger.create({
              trigger: c,
              start: 'top 78%',
              onEnter: () => c.classList.add('is-on'),
              onLeaveBack: () => c.classList.remove('is-on'),
            })
          );
        }

        return () => {
          root.classList.remove('is-live');
          current = null;
          fly(1);
        };
      }
    );
    return () => mm.revert();
  }, []);

  return (
    <section className="flight" id="how" ref={rootRef} aria-labelledby="flight-title">
      <div className="wrap">
        <div className="sec__head">
          <Reveal className="stack">
            <p className="label">How it works</p>
            <h2 className="h2" id="flight-title">From wish<br />to <em>doorstep</em>.</h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="lead">Every preorder takes the same trip, from a US store to your door. Keep scrolling and follow yours.</p>
          </Reveal>
        </div>
      </div>

      <div className="flight__pin" ref={pinRef}>
        <div className="wrap">
          <div className="flight__map" ref={mapRef}>
            <svg className="flight__svg" viewBox="0 0 1200 340" aria-hidden="true">
              <defs>
                <pattern id="flight-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1.6" />
                </pattern>
              </defs>
              <rect className="jgrid" width="1200" height="340" fill="url(#flight-grid)" />
              <path className="jtrack" d={D} />
              <path className="jpath" d={D} pathLength="1" ref={pathRef} />
              <circle className="jdot jdot--pin" cx={C[0][0]} cy={C[0][1]} r="8" />
              {STEPS.map((s) => {
                const p = at(s.f);
                return <circle key={s.f} className="jdot jdot--step is-on" cx={r2(p.x)} cy={r2(p.y)} r="6" />;
              })}
              <circle className="jdot jdot--end" cx={C[3][0]} cy={C[3][1]} r="8" />
            </svg>
            <span className="jpin" style={{ '--x': `${r2((C[0][0] / 1200) * 100)}%`, '--y': `${r2((C[0][1] / 340) * 100)}%` }}>USA</span>
            <span className="jpin" style={{ '--x': `${r2((C[3][0] / 1200) * 100)}%`, '--y': `${r2((C[3][1] / 340) * 100)}%` }}>Pakistan</span>
            <span className="jrail" aria-hidden="true"><i ref={fillRef} /></span>

            <ol className="jsteps">
              {STEPS.map((s, i) => {
                const p = at(s.f);
                // Cards lean away from the path: outward above it, under the arc below it.
                const leftHalf = p.x < 600;
                const k = s.side === 'top' ? (leftHalf ? 0.85 : 0.15) : (leftHalf ? 0.15 : 0.85);
                return (
                  <li
                    key={s.title}
                    className={`jwp jwp--${s.side} is-on${i === LAST ? ' is-now' : ''}`}
                    style={{ '--x': `${r2((p.x / 1200) * 100)}%`, '--y': `${r2((p.y / 340) * 100)}%`, '--k': k }}
                  >
                    <div className="jcard">
                      <div className="jcard__top">
                        <span className="jcard__n">{String(i + 1).padStart(2, '0')}</span>
                        <h3 className="jcard__t">{s.title}</h3>
                      </div>
                      <div className="jcard__body">{s.body(ctx)}</div>
                    </div>
                  </li>
                );
              })}
            </ol>

            {/* Its own layer, after the stops, so the plane flies over the cards and not behind them. */}
            <svg className="flight__svg flight__svg--plane" viewBox="0 0 1200 340" aria-hidden="true">
              <g className="jplane" ref={planeRef} transform={planeAt(1)}>
                <circle r="17" />
                <path d={PLANE} transform="scale(.85) translate(-12 -12)" />
              </g>
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
