import Reveal from './Reveal';
import { settings } from '@/lib/products';

const STAGES = ['Collecting', 'Sourcing', 'Shipped', 'Arriving', 'Arrived'];

/**
 * `batch` = { number, stage (0–4), dates[5] } from lib/live.js. Nothing renders without one.
 *
 * The markup is the finished trip; the sweep along the rail is CSS, held back until
 * .is-in lands (components/Reveal.jsx) so it plays when the tracker reaches the reader.
 */
export default function BatchTracker({ batch: t }) {
  if (!t) return null;

  return (
    <Reveal className="tracker" style={{ '--p': t.stage / (STAGES.length - 1) }}>
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
    </Reveal>
  );
}
