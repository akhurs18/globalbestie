'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { pkr } from '@/lib/products';
import { channel, contactLink } from '@/lib/site';
import './account.css';

const ERRORS = {
  invalid_phone: 'Enter the mobile number you ordered with, e.g. 0300 1234567.',
  wrong_code: 'That code is not right, or it has expired.',
  locked: 'Too many wrong tries. Ask for a new code.',
  rate_limited: 'Too many tries. Please wait a few minutes.',
  send_failed: 'We could not send a code just now. Please try again in a minute.',
  account_offline: 'Sign-in is unavailable right now. Please try again shortly.',
  oms_unreachable: 'We could not reach our system. Check your connection and try again.',
};
const message = (e) => ERRORS[e] ?? 'Something went wrong. Please try again.';

const day = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' }) : '';

/** One order, told the way the customer would tell it. */
function OrderCard({ o }) {
  return (
    <article className="ord">
      <header className="ord__top">
        <div>
          <p className="mono ord__no">{o.orderNo}</p>
          <p className="small muted" style={{ margin: 0 }}>Placed {day(o.placedAt)}</p>
        </div>
        <span className={`chip ord__stage ord__stage--${o.stage.tone}`}>{o.stage.label}</span>
      </header>

      {o.stage.detail && <p className="small muted" style={{ margin: 0 }}>{o.stage.detail}</p>}

      {!o.cancelled && (
        <ol className="ord__steps">
          {o.steps.map((s) => (
            <li key={s.label} className={s.done ? 'is-done' : ''}>
              <i aria-hidden="true" />
              <span>
                {s.label}
                {s.date && <em>{s.expected ? `expected ${day(s.date)}` : day(s.date)}</em>}
              </span>
            </li>
          ))}
        </ol>
      )}

      <ul className="ord__items">
        {o.items.map((it, i) => (
          <li key={`${it.name}-${i}`}>
            <span>{it.name} × {it.qty}</span>
            {it.note && <span className="small muted">{it.note}</span>}
          </li>
        ))}
      </ul>

      <div className="ord__money">
        <div><span className="mono muted">Total</span><b>{pkr(o.totalMinor)}</b></div>
        {o.paidMinor > 0 && <div><span className="mono muted">Paid</span><b className="paid">{pkr(o.paidMinor)}</b></div>}
        {o.dueNowMinor > 0 && <div><span className="mono muted">Due now</span><b className="berry">{pkr(o.dueNowMinor)}</b></div>}
        {o.dueOnArrivalMinor > 0 && (
          <div><span className="mono muted">Due when it lands</span><b>{pkr(o.dueOnArrivalMinor)}</b></div>
        )}
      </div>

      {o.shipments.map((s, i) => (
        <p className="small muted" key={i} style={{ margin: 0 }}>
          {s.deliveredAt ? `Delivered ${day(s.deliveredAt)}` : `Dispatched ${day(s.shippedAt)}`}
          {s.carrier ? ` · ${s.carrier}` : ''}
          {s.trackingUrl ? (
            <> · <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="ulink">Track {s.trackingNumber}</a></>
          ) : s.trackingNumber ? ` · ${s.trackingNumber}` : ''}
        </p>
      ))}
    </article>
  );
}

export default function AccountView() {
  const [step, setStep] = useState('loading');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/account/orders', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        setData(json.data);
        setStep('orders');
        return true;
      }
    } catch {}
    return false;
  }, []);

  // Already signed in on this device? Go straight to the orders.
  useEffect(() => {
    load().then((signedIn) => setStep((s) => (signedIn ? s : 'phone')));
  }, [load]);

  async function post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { res, json: await res.json().catch(() => ({})) };
  }

  async function sendCode(e) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { res, json } = await post('/api/account/code', { phone });
      if (res.ok && json.ok) {
        setStep('code');
        setNotice('If this number has orders with us, a 6-digit code is on its way to the email on your order. It works for 10 minutes.');
      } else {
        setError(message(json.error));
      }
    } catch {
      setError(message('oms_unreachable'));
    }
    setBusy(false);
  }

  async function signIn(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { res, json } = await post('/api/account/verify', { phone, code });
      if (res.ok && json.ok) {
        setCode('');
        setNotice(null);
        await load();
      } else {
        setError(message(json.error));
      }
    } catch {
      setError(message('oms_unreachable'));
    }
    setBusy(false);
  }

  async function signOut() {
    await fetch('/api/account/sign-out', { method: 'POST' }).catch(() => {});
    setData(null);
    setPhone('');
    setCode('');
    setNotice(null);
    setStep('phone');
  }

  if (step === 'loading') {
    return <div className="notice acct__wrap">Checking if you&rsquo;re signed in…</div>;
  }

  if (step === 'orders' && data) {
    return (
      <div className="acct">
        <header className="acct__head">
          <div className="stack">
            <p className="label">My orders</p>
            <h1 className="display-serif">Hi {data.firstName}.</h1>
          </div>
          <button type="button" className="link-btn" onClick={signOut}>Sign out</button>
        </header>

        {data.orders.length === 0 ? (
          <div className="confirm">
            <h2 className="h2">No orders yet.</h2>
            <p className="lead">When you place your first order it shows up here, with every stage from the US to your door.</p>
            <Link href="/shop" className="btn btn--berry">Shop the drop →</Link>
          </div>
        ) : (
          <div className="acct__list">
            {data.orders.map((o) => <OrderCard key={o.orderNo} o={o} />)}
          </div>
        )}

        {data.paymentInstructions && data.orders.some((o) => o.dueNowMinor > 0) && (
          <div className="notice acct__pay">
            <b>How to pay</b>
            <span>{data.paymentInstructions}</span>
          </div>
        )}

        <p className="small muted acct__foot">
          Something not right? <a href={contactLink('Hi Global Bestie! A question about my order: ')} target="_blank" rel="noopener noreferrer" className="ulink">Message us on {channel}</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="acct__wrap">
      <div className="acct__card">
        <p className="label">{step === 'code' ? 'Check your email' : 'My orders'}</p>
        <h1 className="display-serif">
          {step === 'code' ? 'Enter your code.' : 'Everything you’ve ordered, in one place.'}
        </h1>

        {step === 'phone' ? (
          <>
            <p className="lead">
              Sign in with the mobile number you ordered with. We&rsquo;ll email you a 6-digit code — no password to remember.
            </p>
            <form className="form" onSubmit={sendCode}>
              <label>
                Your mobile number
                <input
                  className="input"
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="03XX XXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              {error && <p className="notice notice--error" role="alert" style={{ margin: 0 }}>{error}</p>}
              <button className="btn btn--berry btn--lg btn--block" type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Send me a code'}
              </button>
            </form>
            <p className="small muted" style={{ margin: 0 }}>
              Ordered as a guest? You can still <Link href="/track" className="ulink">track a single order</Link> with your order number.
            </p>
          </>
        ) : (
          <>
            {notice && <p className="lead">{notice}</p>}
            <form className="form" onSubmit={signIn}>
              <label>
                6-digit code
                <input
                  className="input input--code"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
              </label>
              {error && <p className="notice notice--error" role="alert" style={{ margin: 0 }}>{error}</p>}
              <button className="btn btn--berry btn--lg btn--block" type="submit" disabled={busy || code.length !== 6}>
                {busy ? 'Checking…' : 'See my orders'}
              </button>
            </form>
            <div className="acct__links">
              <button type="button" className="link-btn" onClick={() => { setStep('phone'); setError(null); setNotice(null); }}>
                Use a different number
              </button>
              <button type="button" className="link-btn" onClick={sendCode} disabled={busy}>Send a new code</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
