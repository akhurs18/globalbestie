import { pkr } from '@/lib/products';

const n = (v) => v.toLocaleString('en-US');

export default function Receipt({ b, item, batch, rootRef, totalRef, split = true }) {
  // Without a breakdown from the order system, show the final price only: a breakdown
  // that doesn't add up to the price charged would be worse than none.
  const rows =
    b.usd == null
      ? []
      : [
          ['US price', `$${b.usd.toFixed(2)}`],
          ['× FX rate (today)', String(b.fx)],
          ['= in PKR', n(b.inPkr)],
          [`+ our ${Math.round(b.markupRate * 100)}%`, n(b.markup)],
          ['+ shipping to PK', n(b.shipping)],
        ];
  return (
    <div className="receipt" ref={rootRef}>
      <div className="receipt__head">Global Bestie · Receipt</div>
      <div className="receipt__item">{item}{batch ? ` · Batch ${batch}` : ''}</div>
      {rows.length > 0 && (
        <>
          <hr className="receipt__rule" />
          {rows.map(([label, value]) => (
            <div className="receipt__row" key={label} data-row>
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
        </>
      )}
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
