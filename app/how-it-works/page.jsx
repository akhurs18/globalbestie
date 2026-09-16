import Link from 'next/link';
import HowItWorks from '@/components/HowItWorks';
import Receipt from '@/components/Receipt';
import FaqList from '@/components/FaqList';
import { getBatchInfo, getLiveProducts } from '@/lib/live';

export const metadata = {
  title: 'How it works',
  description: 'How Global Bestie pricing, 50/50 payments and preorder batches work.',
};

export const revalidate = 300;

export default async function HowItWorksPage() {
  const [items, batches] = await Promise.all([getLiveProducts(), getBatchInfo()]);
  const p = items[0];

  return (
    <>
      <div className="wrap">
        <header className="page-head">
          <p className="label">How it works</p>
          <h1 className="display-serif">Honest prices.<br />Zero drama.</h1>
          <p className="lead">Everything you need to know about how we price, when you pay, and how long it takes.</p>
        </header>
      </div>

      <HowItWorks withHead={false} sample={p} batchNo={batches.open?.number} />

      <section className="sec sec--blush">
        <div className="wrap receipt-grid">
          <div className="stack-lg">
            <p className="label">Pricing</p>
            <h2 className="h2">One price, everything in.</h2>
            <p className="lead">Every price on the site is the final PKR price. No hidden fees, no &ldquo;DM for price&rdquo;.</p>
            <p className="small muted" style={{ margin: 0 }}>
              Shipping from the US is included and there is nothing to pay at your door. We confirm your price with you
              before you pay anything.
            </p>
          </div>
          <div className="receipt-wrap">
            <Receipt b={p.b} item={p.name} />
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec__head">
            <div className="stack">
              <p className="label">Payments</p>
              <h2 className="h2">When you pay.</h2>
            </div>
          </div>
          <div className="cards-2">
            <div className="card">
              <span className="chip chip--pre" style={{ justifySelf: 'start' }}>Preorder</span>
              <h3>50% after we confirm, 50% on arrival</h3>
              <p>Once we confirm your price and batch, pay 50% by bank transfer to lock it in. The other 50% is due when the shipment lands in Pakistan, before we dispatch to you.</p>
            </div>
            <div className="card">
              <span className="chip" style={{ justifySelf: 'start' }}>In stock</span>
              <h3>Pay in full, ships now</h3>
              <p>In-stock pieces are already in Pakistan. Pay in full after we confirm, and we dispatch straight away.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec sec--white" id="faq">
        <div className="wrap faq">
          <div className="stack-lg">
            <p className="label">FAQ</p>
            <h2 className="h2">Questions?<br />Obviously.</h2>
            <Link className="btn btn--berry" href="/request">Request something →</Link>
          </div>
          <FaqList />
        </div>
      </section>
    </>
  );
}
