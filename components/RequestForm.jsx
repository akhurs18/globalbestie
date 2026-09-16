'use client';

import { useState } from 'react';
import { categories } from '@/lib/products';
import { channel, sendMessage } from '@/lib/site';

/**
 * The US price is asked for because it makes quoting quick, but no estimate is shown
 * back: a number worked out from it would give away what we add.
 */
export default function RequestForm() {
  const [f, setF] = useState({ link: '', details: '', category: 'bags', usd: '', city: '', whatsapp: '' });
  const [copied, setCopied] = useState(false);
  const set = (key) => (e) => setF((s) => ({ ...s, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const lines = [
      'Hi Global Bestie! New request:',
      `Product: ${f.link}`,
      f.details && `Size / shade / colour: ${f.details}`,
      f.usd && `US price: $${f.usd}`,
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
