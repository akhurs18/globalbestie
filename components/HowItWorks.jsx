import Reveal from './Reveal';
import Sparkle from './Sparkle';
import { products, priceBreakdown, pkr, settings } from '@/lib/products';

export default function HowItWorks({ withHead = true, sample, batchNo = settings.currentBatch.number }) {
  const b = priceBreakdown(sample ?? products[0]);
  return (
    <section className="sec" id="how">
      <div className="wrap">
        {withHead && (
          <div className="sec__head">
            <Reveal className="stack">
              <p className="label">How it works</p>
              <h2 className="h2">Three taps.<br />Zero stress.</h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="lead">No DM ping-pong, no hidden fees. You request it, we confirm it, you pay in two halves.</p>
            </Reveal>
          </div>
        )}
        <div className="steps">
          <Reveal className="step">
            <span className="step__n">01</span>
            <h3>Request it</h3>
            <p>Pick from the drop or paste any US link. Nothing to pay yet, it&rsquo;s just a request.</p>
            <div className="step__ui"><span className="field-fake"><Sparkle size={14} />paste a US link…</span></div>
          </Reveal>
          <Reveal className="step step--hot" delay={100}>
            <span className="step__n">02</span>
            <h3>We confirm</h3>
            <p>The team checks stock and sends your final PKR price and shipment batch.</p>
            <div className="step__ui"><span className="chip chip--ink">Confirmed · {pkr(b.total)}{batchNo ? ` · Batch ${batchNo}` : ''}</span></div>
          </Reveal>
          <Reveal className="step" delay={200}>
            <span className="step__n">03</span>
            <h3>Pay 50/50</h3>
            <p>Pay 50% by bank transfer to lock it in. The other 50% when it lands in Pakistan.</p>
            <div className="step__ui">
              <div className="split">
                <div className="split__now"><small>50% now</small><b>{pkr(b.advance)}</b></div>
                <div><small>50% on arrival</small><b>{pkr(b.balance)}</b></div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
