'use client';

import { useState } from 'react';
import Art from './Art';

const VARIANTS = ['holo', 'pink', 'chrome', 'lilac', 'rose'];

export default function Gallery({ p, batch }) {
  const [active, setActive] = useState(0);
  // Real photos when the OMS has them: the product's own, then each shade's.
  const photos = [...new Set([...(p.images ?? []).map((i) => i.url), ...(p.shades ?? []).map((s) => s.image)])]
    .filter(Boolean)
    .slice(0, 8);

  const chips = (
    <div className="gallery__chips">
      <span className="chip chip--berry">{p.stock === 'preorder' ? 'Preorder' : 'In stock'}</span>
      {batch && <span className="chip chip--ink">Batch {batch}</span>}
    </div>
  );

  if (photos.length) {
    const main = photos[Math.min(active, photos.length - 1)];
    return (
      <div className="gallery">
        <div className="gallery__main photo">
          <img src={main} alt={p.name} />
          {chips}
        </div>
        {photos.length > 1 && (
          <div className="gallery__thumbs">
            {photos.map((url, i) => (
              <button
                key={url}
                type="button"
                className="thumb photo"
                aria-label={`Show photo ${i + 1}`}
                aria-pressed={active === i}
                onClick={() => setActive(i)}
              >
                <img src={url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const views = [p.art, ...VARIANTS.filter((v) => v !== p.art)].slice(0, 4);
  return (
    <div className="gallery">
      <Art art={views[active]} className="gallery__main" label="product photos coming soon">
        {chips}
        <span className="sticker sticker--script" aria-hidden="true">she got it!</span>
      </Art>
      <div className="gallery__thumbs">
        {views.map((v, i) => (
          <button
            key={v}
            type="button"
            className={`thumb art art--${v}`}
            aria-label={`Show view ${i + 1}`}
            aria-pressed={active === i}
            onClick={() => setActive(i)}
          >
            <span className="art__orb" />
          </button>
        ))}
      </div>
    </div>
  );
}
