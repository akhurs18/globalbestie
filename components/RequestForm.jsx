'use client';

import { useMemo, useState } from 'react';
import { categories, pkr, settings, shippingEstimates } from '@/lib/products';
import { channel, sendMessage } from '@/lib/site';

/** `pricing` = { fxRate, markup } from the order system (lib/live.js getPricing). */
export default function RequestForm({ pricing }) {
  const fxRate = pricing?.fxRate ?? settings.fxRate;
  const markup = pricing?.markup ?? settings.markup;
  const [f, setF] = useState({ link: '', details: '', category: 'bags', usd: '', city: '', whatsapp: '' });
  const [copied, setCopied] = useState(false);
  const set = (key) => (e) => setF((s) => ({ ...s, [key]: e.target.value }));

  const estimate = useMemo(() => {
    const usd = parseFloat(f.usd);
    if (!usd || usd <= 0) return null;
    const base = usd * fxRate * (1 + markup);
    const [lo, hi] = shippingEstimates[f.category];
    return { low: base + lo, high: base + hi };
  }, [f.usd, f.category, fxRate, markup]);

  async function submit(e) {
    e.preventDefault();
    const lines = [
      'Hi Global Bestie! New request:',
      `Product: ${f.link}`,
      f.details && `Size / shade / colour: ${f.details}`,
      f.usd && `US price: $${f.usd}`,
      estimate && `Site estimate: ${pkr(estimate.low)} – ${pkr(estimate.high)}`,
      `City: ${f.city}`,
      `My WhatsApp: ${f.whatsapp}`,
    ].filter(Boolean);
    setCopied(await sendMessage(lines.join('\n')));
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Product link or name
        <input className="input" required type="text" placeholder="https://… or “mini shoulder bag in blush”" value={f.link} onChange={set('link')} />
      </label>
      <label>
        Size, shade or colour
        <input className="input" type="text" placeholder="e.g. size 7, shade 02, black" value={f.details} onChange={set('details')} />
      </label>
      <div className="form__row">
        <label>
          Category
          <select value={f.category} onChange={set('category')}>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </label>
        <label>
          US price (optional)
          <input className="input" type="number" min="0" step="0.01" inputMode="decimal" placeholder="$" value={f.usd} onChange={set('usd')} />
        </label>
      </div>
      {estimate && (
        <div className="estimate" aria-live="polite">
          <span className="mono muted">Estimated final price</span>
          <b>{pkr(estimate.low)} – {pkr(estimate.high)}</b>
          <span className="small muted">
            US price × {fxRate} + {Math.round(markup * 100)}% + shipping. We confirm the exact price before you pay.
          </span>
        </div>
      )}
      <div className="form__row">
        <label>
          City
          <input className="input" required type="text" autoComplete="address-level2" placeholder="Lahore" value={f.city} onChange={set('city')} />
        </label>
        <label>
          Your WhatsApp number
          <input className="input" required type="tel" inputMode="tel" autoComplete="tel" placeholder="+92 3XX XXXXXXX" value={f.whatsapp} onChange={set('whatsapp')} />
        </label>
      </div>
      <button className="btn btn--berry btn--lg" type="submit">Send request on {channel}</button>
      {copied && <p className="form-note" role="status">Request copied. Paste it into our DMs and hit send.</p>}
      <p className="mono muted" style={{ fontSize: 10.5 }}>Nothing to pay until we confirm price, stock and batch.</p>
    </form>
  );
}
