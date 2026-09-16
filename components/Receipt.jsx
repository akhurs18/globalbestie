import { pkr } from '@/lib/products';

/**
 * What the customer pays, and when. Deliberately no cost breakdown: what a piece costs
 * us, the rate we bought at and our margin are ours, not the shopper's.
 */
export default function Receipt({ b, item, batch, rootRef, totalRef, split = true }) {
  return (
    <div className="receipt" ref={rootRef}>
      <div className="receipt__head">Global Bestie · Receipt</div>
      <div className="receipt__item">{item}{batch ? ` · Batch ${batch}` : ''}</div>
      <hr className="receipt__rule" />
      <div className="receipt__row" data-row>
        <span>Shipping to Pakistan</span>
        <b>Included</b>
      </div>
      <div className="receipt__row" data-row>
        <span>Customs &amp; extras</span>
        <b>None</b>
      </div>
      <hr className="receipt__rule" />
      <div className="receipt__total" data-row>
        <span>You pay</span>
        <b ref={totalRef}>{pkr(b.total)}</b>
      </div>
      {split && (
        <div className="split" data-row>
          <div className="split__now"><small>50% now</small><b>{pkr(b.advance)}</b></div>
          <div><small>50% on arrival</small><b>{pkr(b.balance)}</b></div>
        </div>
      )}
      <div className="barcode" aria-hidden="true" />
    </div>
  );
}
