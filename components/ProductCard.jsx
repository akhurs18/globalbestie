import Link from 'next/link';
import CategoryArt from './CategoryArt';
import { priceBreakdown, pkr, settings } from '@/lib/products';

export default function ProductCard({ p, grid = false }) {
  const b = priceBreakdown(p);
  const pre = p.stock === 'preorder';
  const chip = p.missing ? 'Coming soon' : p.orderable === false ? 'Sold out' : pre ? 'Preorder' : 'In stock';
  const chipEl = <span className={`chip ${pre && p.orderable !== false ? 'chip--berry' : ''}`}>{chip}</span>;
  const photo = p.images?.[0];
  const shades = p.shades?.length ?? 0;
  return (
    <Link href={`/p/${p.slug}`} className={`pcard ${grid ? 'pcard--grid' : ''}`}>
      {photo ? (
        <div className="pcard__art photo">
          <img src={photo.url} alt={photo.alt || p.name} loading="lazy" />
          {chipEl}
        </div>
      ) : (
        <CategoryArt category={p.category} className="pcard__art" label="photo coming soon">
          {chipEl}
        </CategoryArt>
      )}
      {p.brand && <span className="pcard__brand">{p.brand}</span>}
      <span className="pcard__name">{p.name}</span>
      {shades > 1 && <span className="mono muted" style={{ fontSize: 11 }}>{shades} shades</span>}
      <span className="pcard__price">
        <b>{pkr(b.total)}</b>
        <small>{pre ? `final · ~${settings.preorderWeeks} wks` : `final · ~${settings.inStockDays} days`}</small>
      </span>
    </Link>
  );
}
