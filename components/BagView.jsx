'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import Art from './Art';
import { useBag } from './BagProvider';
import { pkr, settings } from '@/lib/products';
import { channel, sendMessage } from '@/lib/site';

const ERRORS = {
  missing_details: 'Please fill in your name, WhatsApp number, city and address.',
  invalid_phone: 'That number looks too short. Use the format 03XX XXXXXXX.',
  invalid_email: 'Please enter a valid email. We send your order updates and sign-in code there.',
  item_unavailable: "Something in your bag can't be ordered right now. Remove it and try again.",
  empty_bag: 'Your bag is empty.',
  rate_limited: 'Too many tries in a minute. Wait a moment, then try again.',
  retry: 'We are still processing your last attempt. Try again in a few seconds.',
};

// When the order system is off or unreachable, the order goes to us by DM instead.
const FALLBACK = new Set(['checkout_offline', 'oms_unreachable', 'order_failed']);

const newKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function BagView({ catalogue }) {
  const { lines, ready, setQty, remove, clear } = useBag();
  const bySlug = useMemo(() => Object.fromEntries(catalogue.map((p) => [p.slug, p])), [catalogue]);
  const items = lines
    .map((l, index) => {
      const p = bySlug[l.slug];
      const shade = p?.shades?.find((s) => l.options?.includes(`Shade: ${s.name}`));
      // A line can be sold out on its own shade even when the product still has others.
      const orderable = Boolean(p?.orderable && (!p.shades?.length || shade?.sellable));
      return { ...l, index, p, shade, orderable };
    })
    .filter((x) => x.p);

  const total = items.reduce((a, x) => a + x.p.total * x.qty, 0);
  const anyPre = items.some((x) => x.p.stock === 'preorder');
  const payNow = anyPre ? Math.ceil(total / 2) : total;
  const blocked = items.some((x) => !x.orderable);

  const [form, setForm] = useState({ name: '', phone: '', city: '', address: '', email: '', note: '' });
  const [state, setState] = useState({ status: 'idle' });
  // One key per checkout attempt: a retry of the same order reuses it, so it can never
  // create a second order. Any change to the bag or the form starts a new attempt.
  const keyRef = useRef(null);
  useEffect(() => {
    keyRef.current = null;
  }, [lines]);

  const set = (k) => (e) => {
    keyRef.current = null;
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  function orderText() {
    return [
      'Hi Global Bestie! New order request:',
      ...items.map((x) => `• ${x.p.name}${x.options ? ` (${x.options})` : ''} × ${x.qty} = ${pkr(x.p.total * x.qty)}`),
      `Total: ${pkr(total)}`,
      `Name: ${form.name}`,
      `WhatsApp: ${form.phone}`,
      form.email && `Email: ${form.email}`,
      `City: ${form.city}`,
      `Address: ${form.address}`,
      form.note && `Note: ${form.note}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  async function submit(e) {
    e.preventDefault();
    if (state.status === 'sending' || blocked || items.length === 0) return;
    keyRef.current ??= newKey();
    setState({ status: 'sending' });
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': keyRef.current },
        body: JSON.stringify({
          customer: { name: form.name, phone: form.phone, city: form.city, address: form.address, email: form.email },
          note: form.note,
          lines: items.map((x) => ({ slug: x.slug, qty: x.qty, options: x.options })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        setState({ status: 'done', order: json.data });
        clear();
        return;
      }
      if (FALLBACK.has(json.error)) {
        const copied = await sendMessage(orderText());
        setState({ status: 'fallback', copied });
        return;
      }
      setState({ status: 'error', message: ERRORS[json.error] ?? 'Something went wrong. Please try again.' });
    } catch {
      setState({ status: 'error', message: 'We could not reach the server. Check your connection and try again.' });
    }
  }

  if (state.status === 'done') {
    const o = state.order;
    return (
      <div className="confirm" style={{ marginBottom: 'var(--sec)' }} role="status">
        <p className="label">Request sent</p>
        <h2 className="h2">You&rsquo;re in, bestie.</h2>
        <p className="lead">
          Your order number is <b className="berry">{o.orderNo}</b>. Keep it: you&rsquo;ll need it (with your phone number) to track your order.
        </p>
        {!o.fullyAvailable && (
          <p className="notice">Heads up: some pieces are short on stock. We&rsquo;ll tell you your options when we confirm.</p>
        )}
        <ol className="steps-v">
          <li className="is-current"><span><b>We review your request</b><span className="muted small">Stock, your final PKR price and batch, sent to you on {channel}.</span></span></li>
          <li><span><b>You pay {anyPre ? 'the 50% advance' : 'in full'}</b><span className="muted small">By bank transfer, only after we confirm. Nothing to pay before that.</span></span></li>
          <li><span><b>{anyPre ? 'Your batch flies home' : 'We dispatch'}</b><span className="muted small">{anyPre ? `The balance is due when it lands, ~${settings.preorderWeeks} wks after your batch closes.` : `Straight to your door, within ~${settings.inStockDays} days.`}</span></span></li>
        </ol>
        <div className="hero__ctas">
          <Link href="/track" className="btn btn--berry">Track my order</Link>
          <Link href="/shop" className="btn btn--ghost">Keep shopping</Link>
        </div>
      </div>
    );
  }

  if (!ready) return <div className="notice" style={{ marginBottom: 'var(--sec)' }}>Loading your bag…</div>;

  if (items.length === 0) {
    return (
      <div className="confirm" style={{ marginBottom: 'var(--sec)' }}>
        <h2 className="h2">Your bag is empty.</h2>
        <p className="lead">Every piece shows its final PKR price. Pre-orders are 50% now, 50% when they land.</p>
        {state.status === 'fallback' && (
          <p className="notice">
            {state.copied ? 'Your order was copied. Paste it into our DMs and hit send.' : 'We opened our chat so you can send your order.'}
          </p>
        )}
        <Link href="/shop" className="btn btn--berry">Shop the drop →</Link>
      </div>
    );
  }

  return (
    <div className="bag-grid">
      <div className="bag-lines">
        {items.map((x) => (
          <div className="bag-line" key={`${x.slug}-${x.options}-${x.index}`}>
            {x.shade?.image || x.p.image ? (
              <img className="bag-line__img" src={x.shade?.image || x.p.image} alt="" loading="lazy" />
            ) : (
              <Art art={x.p.art} />
            )}
            <div className="bag-line__meta">
              {x.p.brand && <span className="pcard__brand">{x.p.brand}</span>}
              <Link href={`/p/${x.slug}`} className="pcard__name">{x.p.name}</Link>
              {x.options && <span className="muted small">{x.options}</span>}
              <span className="mono muted" style={{ fontSize: 11 }}>
                {!x.orderable ? (x.p.missing ? 'Coming soon: remove to continue' : 'Sold out: remove to continue') : x.p.stock === 'preorder' ? `Preorder · ~${settings.preorderWeeks} wks` : `In stock · ~${settings.inStockDays} days`}
              </span>
            </div>
            <div className="bag-line__right">
              <b>{pkr(x.p.total * x.qty)}</b>
              <div className="qty" role="group" aria-label={`Quantity of ${x.p.name}`}>
                <button type="button" onClick={() => setQty(x.index, x.qty - 1)} aria-label="One less" disabled={x.qty <= 1}>−</button>
                <span>{x.qty}</span>
                <button type="button" onClick={() => setQty(x.index, x.qty + 1)} aria-label="One more">+</button>
              </div>
              <button type="button" className="link-btn" onClick={() => remove(x.index)}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      <form className="form summary" onSubmit={submit}>
        <div className="kv">
          <div className="sum-row"><span>Total (final PKR)</span><b>{pkr(total)}</b></div>
          <div className="sum-row"><span>{anyPre ? 'Pay after we confirm (50%)' : 'Pay after we confirm'}</span><b className="berry">{pkr(payNow)}</b></div>
          {anyPre && <div className="sum-row muted small"><span>When it lands in Pakistan</span><span>{pkr(total - payNow)}</span></div>}
        </div>
        <p className="notice" style={{ margin: 0 }}>Nothing to pay now. We confirm stock, final price and batch first, then send bank details. Your email is where order updates and your sign-in code go.</p>

        <label>Full name<input className="input" required autoComplete="name" value={form.name} onChange={set('name')} /></label>
        <label>WhatsApp number<input className="input" required type="tel" inputMode="tel" autoComplete="tel" placeholder="03XX XXXXXXX" value={form.phone} onChange={set('phone')} /></label>
        <div className="form__row">
          <label>City<input className="input" required autoComplete="address-level2" placeholder="Lahore" value={form.city} onChange={set('city')} /></label>
          <label>Email<input className="input" required type="email" autoComplete="email" placeholder="you@email.com" value={form.email} onChange={set('email')} /></label>
        </div>
        <label>Delivery address<input className="input" required autoComplete="street-address" value={form.address} onChange={set('address')} /></label>
        <label>Anything we should know? (optional)<input className="input" value={form.note} onChange={set('note')} placeholder="Size, shade, gift note…" /></label>

        {state.status === 'error' && <p className="notice notice--error" role="alert" style={{ margin: 0 }}>{state.message}</p>}
        {blocked && <p className="notice notice--error" style={{ margin: 0 }}>Remove the unavailable pieces to continue.</p>}

        <button className="btn btn--berry btn--lg" type="submit" disabled={state.status === 'sending' || blocked}>
          {state.status === 'sending' ? 'Sending…' : 'Send order request'}
        </button>
      </form>
    </div>
  );
}
