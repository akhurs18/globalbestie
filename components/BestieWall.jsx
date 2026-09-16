import Reveal from './Reveal';
import Sparkle from './Sparkle';
import { instagramUrl, site } from '@/lib/site';

// Placeholder slots until real customer unboxings are added (with their permission).
const COLS = [
  [{ t: 'video', art: 'holo', h: 360 }, { t: 'note', ink: true, text: 'Tag @globalbestie in your unboxing.' }],
  [{ t: 'note', text: 'We repost our favourite hauls every week.' }, { t: 'video', art: 'lilac', h: 300 }],
  [{ t: 'video', art: 'chrome', h: 420 }, { t: 'note', ink: true, text: 'Your friends order, you earn credit.' }],
  [{ t: 'note', text: 'Show us the haul. We will hype it up.' }, { t: 'video', art: 'rose', h: 320 }],
];

function Card({ c }) {
  if (c.t === 'video') {
    return (
      <div className={`ugc ugc--video art art--${c.art}`} style={{ height: c.h }}>
        <span className="chip ugc__tag">Your unboxing here</span>
        <span className="ugc__play" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>
        </span>
        <span className="chip ugc__handle">@{site.instagram}</span>
      </div>
    );
  }
  return (
    <div className={`ugc ugc--note ${c.ink ? 'ugc--ink' : ''}`}>
      <Sparkle size={20} tone={c.ink ? 'chrome' : 'berry'} />
      <p>{c.text}</p>
    </div>
  );
}

export default function BestieWall() {
  return (
    <section className="sec wall">
      <div className="wrap">
        <div className="sec__head">
          <Reveal className="stack">
            <p className="label">The Bestie Wall</p>
            <h2 className="h2">Real besties.<br />Real unboxings.</h2>
          </Reveal>
          <Reveal className="stack" delay={100}>
            <a className="btn btn--ink" href={instagramUrl} target="_blank" rel="noopener noreferrer">Post yours, earn credit →</a>
            <p className="small" style={{ maxWidth: 340, margin: 0 }}>
              Tag @{site.instagram} in your unboxing. Every order your post brings in earns you credit.
            </p>
          </Reveal>
        </div>
        <div className="wall__cols" aria-hidden="true">
          {COLS.map((col, i) => (
            <div className="wall__col" key={i}>
              {[...col, ...col, ...col, ...col].map((c, j) => (
                <Card key={j} c={c} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
