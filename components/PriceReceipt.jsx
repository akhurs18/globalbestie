import Link from 'next/link';
import Receipt from './Receipt';
import Sparkle from './Sparkle';
import Reveal from './Reveal';
import { products, priceBreakdown, settings } from '@/lib/products';

export default function PriceReceipt({ product, batchNo = settings.currentBatch.number }) {
  const p = product ?? products[0];
  const b = priceBreakdown(p);

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
        <div className="receipt-wrap">
          <span className="sticker">honest pricing</span>
          <Sparkle size={40} tone="ink" />
          {/* The receipt prints itself: a clip-path wipe in CSS, run once .is-in lands. */}
          <Reveal className="receipt-print">
            <Receipt b={b} item={p.name} batch={batchNo} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
