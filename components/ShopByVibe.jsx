import Link from 'next/link';
import Sparkle from './Sparkle';
import { categories, products } from '@/lib/products';

const ART = { bags: 'holo', shoes: 'pink', beauty: 'chrome', fragrance: 'lilac', accessories: 'rose' };

export default function ShopByVibe({ items = products }) {
  return (
    <div className="vibe">
      {categories.map((c) => {
        const count = items.filter((p) => p.category === c.slug).length;
        return (
          <Link key={c.slug} href={`/shop?c=${c.slug}`} className={`tile art art--${ART[c.slug]}`} aria-label={`Shop ${c.name}`}>
            <span className="tile__count">{count} {count === 1 ? 'piece' : 'pieces'}</span>
            <Sparkle size={26} tone={c.slug === 'beauty' ? 'berry' : 'chrome'} />
            <span className="art__orb" aria-hidden="true" />
            <span className="tile__v" aria-hidden="true">{c.name}</span>
            <span className="tile__h">
              <b>{c.name}</b>
              <span className="btn btn--ink btn--sm">Shop {c.name.toLowerCase()} →</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
