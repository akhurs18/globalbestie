'use client';

import { useState } from 'react';
import { pkr } from '@/lib/products';
import { channel, sendMessage } from '@/lib/site';

const STEPS = [
  ['Request received', "We're checking stock, your final price and batch."],
  ['Confirmed', 'Your piece is being sourced in the US.'],
  ['Landed in Pakistan', 'Pay any balance and we dispatch.'],
  ['On its way', 'With the courier.'],
  ['Delivered', 'Enjoy it, bestie.'],
];
const STAGE_INDEX = { pending_review: 0, confirmed: 1, ready: 2, partially_shipped: 3, shipped: 3, delivered: 4 };

const KIND = { DEPOSIT: '50% advance', BALANCE: 'Balance', INVOICE: 'Payment' };
function payStatus(p) {
  if (p.status === 'PAID') return 'Paid';
  if (p.status === 'PARTIAL') return 'Part paid';
  if (p.status === 'VOID') return 'Cancelled';
  if (p.kind === 'BALANCE' && p.trigger === 'ON_ARRIVAL' && !p.activatedAt) return 'Due when it lands';
  return 'Due';
}
const date = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' }) : '');

export default function TrackForm() {
  const [orderNo, setOrderNo] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState({ status: 'idle' });

  async function submit(e) {
    e.preventDefault();
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNo, phone }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) return setState({ status: 'found', order: json.data });
      if (json.error === 'not_found') return setState({ status: 'error', message: "We couldn't find that order with that phone number. Check both and try again." });
      if (json.error === 'missing_details') return setState({ status: 'error', message: 'Enter your order number and the phone number you ordered with.' });
      if (json.error === 'rate_limited') return setState({ status: 'error', message: 'Too many lookups in a minute. Wait a moment and try again.' });
      // Order system off or unreachable: ask a human instead.
      const copied = await sendMessage(`Hi Global Bestie! Can I get an update on my order? Order number: ${orderNo} · Phone: ${phone}`);
      setState({ status: 'fallback', copied });
    } catch {
      setState({ status: 'error', message: 'We could not reach the server. Check your connection and try again.' });
    }
  }

  const o = state.order;
  const at = o ? STAGE_INDEX[o.stage] ?? 0 : 0;

  return (
    <div className="track-result">
      <form className="form" onSubmit={submit}>
        <label>
          Order number
          <input className="input" required value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="SO-0042" autoComplete="off" />
        </label>
        <label>
          Phone number you ordered with
          <input className="input" required type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03XX XXXXXXX" />
        </label>
        <button className="btn btn--berry btn--lg" type="submit" disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Looking…' : 'Track order'}
        </button>
        {state.status === 'error' && <p className="notice notice--error" role="alert" style={{ margin: 0 }}>{state.message}</p>}
        {state.status === 'fallback' && (
          <p className="form-note" role="status">
            {state.copied ? 'Live tracking is unavailable right now, so we copied your details. Paste them into our DMs.' : `We opened ${channel} so you can ask us directly.`}
          </p>
        )}
      </form>

      {o && (
        <div className="card" aria-live="polite">
          <p className="label">Order {o.orderNo}</p>
          <h3>Hi {o.customerFirstName}, here&rsquo;s where it is.</h3>
          {o.stage === 'cancelled' ? (
            <p className="notice">This order was cancelled. Message us on {channel} if that&rsquo;s a surprise.</p>
          ) : (
            <ol className="steps-v">
              {STEPS.map(([title, text], i) => (
                <li key={title} className={i < at ? 'is-done' : i === at ? 'is-current' : ''}>
                  <span><b>{title}</b><span className="muted small">{text}</span></span>
                </li>
              ))}
            </ol>
          )}

          <div className="kv">
            {o.lines.map((l) => (
              <div className="sum-row small" key={l.sku}>
                <span>{l.name} × {l.qty}</span>
                <span className="muted">{l.batch ? `Batch ${l.batch.number}` : ''}</span>
              </div>
            ))}
          </div>

          <div className="kv">
            <div className="sum-row"><span>Total</span><b>{pkr(o.totalMinor)}</b></div>
            {o.payments.map((p, i) => (
              <div className="sum-row small" key={i}>
                <span>{KIND[p.kind] ?? p.kind} · {pkr(p.amountMinor)}</span>
                <span className={p.status === 'PAID' ? 'berry' : 'muted'}>{payStatus(p)}</span>
              </div>
            ))}
            {o.outstandingMinor > 0 && o.payments.length > 0 && (
              <div className="sum-row small"><span>Still to pay</span><b>{pkr(o.outstandingMinor)}</b></div>
            )}
          </div>

          {o.shipments.map((s, i) => (
            <p className="small" key={i} style={{ margin: 0 }}>
              {s.status === 'DELIVERED' ? `Delivered ${date(s.deliveredAt)}` : `Dispatched ${date(s.shippedAt)}`}
              {s.carrier ? ` · ${s.carrier}` : ''}
              {s.trackingUrl ? (
                <> · <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>Track {s.trackingNumber}</a></>
              ) : s.trackingNumber ? ` · ${s.trackingNumber}` : ''}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
