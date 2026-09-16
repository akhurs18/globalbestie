'use client';

import Link from 'next/link';
import { useState } from 'react';
import { pkr } from '@/lib/products';
import { channel, sendMessage } from '@/lib/site';
import { useBag } from './BagProvider';

const SWATCH = { Blush: '#F7E4E3', Ink: '#2A2124', Cream: '#FFF8F4', Lilac: '#DCCFF3', Rose: '#E9B8BB', White: '#FFFFFF' };

export default function ProductBuy({ p, b }) {
  const { add } = useBag();
  const [colour, setColour] = useState(p.colours?.[0] ?? null);
  const [option, setOption] = useState(p.options?.values?.[0] ?? null);
  const shades = p.shades ?? [];
  const [shade, setShade] = useState(shades.find((s) => s.sellable) ?? shades[0] ?? null);
  const [added, setAdded] = useState(false);
  const [copied, setCopied] = useState(false);
  const pre = p.stock === 'preorder';

  // A shade is its own SKU; checkout reads it back from "Shade: <name>".
  const details = [shade && `Shade: ${shade.name}`, colour && `Colour: ${colour}`, option && `${p.options.label}: ${option}`]
    .filter(Boolean)
    .join(', ');
  const soldOut = p.orderable === false || (shade && !shade.sellable);

  function addToBag() {
    add(p.slug, details, 1);
    setAdded(true);
  }

  async function ask() {
    setCopied(await sendMessage(`Hi Global Bestie! Quick question about ${p.name}: `));
  }

  return (
    <div className="buy">
      {shades.length > 0 && (
        <div className="opt">
          <span className="mono muted">Shade · {shade?.name}{shade && !shade.sellable ? ' (sold out)' : ''}</span>
          <div className="pills">
            {shades.map((s) => (
              <button
                key={s.sku}
                type="button"
                className="pill-opt shade-opt"
                aria-pressed={shade?.sku === s.sku}
                data-soldout={!s.sellable || undefined}
                onClick={() => { setShade(s); setAdded(false); }}
              >
                {s.image && <img src={s.image} alt="" loading="lazy" />}
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {p.colours && (
        <div className="opt">
          <span className="mono muted">Colour · {colour}</span>
          <div className="swatches">
            {p.colours.map((c) => (
              <button
                key={c}
                type="button"
                className="swatch"
                style={{ background: SWATCH[c] || '#eee' }}
                aria-label={c}
                aria-pressed={colour === c}
                onClick={() => { setColour(c); setAdded(false); }}
              />
            ))}
          </div>
        </div>
      )}
      {p.options && (
        <div className="opt">
          <span className="mono muted">{p.options.label}</span>
          <div className="pills">
            {p.options.values.map((v) => (
              <button key={v} type="button" className="pill-opt" aria-pressed={option === v} onClick={() => { setOption(v); setAdded(false); }}>{v}</button>
            ))}
          </div>
        </div>
      )}
      {pre ? (
        <div className="split">
          <div className="split__now"><small>50% after we confirm</small><b>{pkr(b.advance)}</b></div>
          <div><small>50% on arrival</small><b>{pkr(b.balance)}</b></div>
        </div>
      ) : (
        <div className="split">
          <div className="split__now"><small>Pay in full after we confirm</small><b>{pkr(b.total)}</b></div>
        </div>
      )}
      {soldOut ? (
        <button type="button" className="btn btn--berry btn--lg btn--block" disabled>
          {p.missing ? 'Coming soon' : shade && p.orderable !== false ? 'This shade is sold out' : 'Sold out right now'}
        </button>
      ) : (
        <button type="button" className="btn btn--berry btn--lg btn--block" onClick={addToBag}>Add to bag</button>
      )}
      {added && (
        <p className="form-note" role="status">
          Added to your bag. <Link href="/bag" style={{ textDecoration: 'underline' }}>View bag →</Link>
        </p>
      )}
      <button type="button" className="btn btn--ghost btn--block" onClick={ask}>Ask on {channel}</button>
      {copied && <p className="form-note" role="status">Message copied. Paste it into our DMs.</p>}
      <p className="mono muted" style={{ fontSize: 10.5 }}>Nothing to pay until we confirm your price + batch</p>
    </div>
  );
}
