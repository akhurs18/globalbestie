import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import { categories, settings } from '@/lib/products';
import { getShopProducts } from '@/lib/live';

export const metadata = {
  title: 'Shop',
  description: 'US bags, shoes, beauty, fragrance and accessories with final PKR prices.',
};

/* Category and availability filter together, so picking one keeps the other. */
const STOCK_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'in-stock', label: 'In stock' },
  { key: 'preorder', label: 'Preorder' },
];

function shopHref({ c, s } = {}) {
  const q = new URLSearchParams();
  if (c) q.set('c', c);
  if (s && s !== 'all') q.set('s', s);
  const qs = q.toString();
  return qs ? `/shop?${qs}` : '/shop';
}

export default async function ShopPage({ searchParams }) {
  const { c, s } = (await searchParams) ?? {};
  const cat = categories.find((x) => x.slug === c);
  // An unknown ?s= falls back to "all" rather than showing an empty shop.
  const stock = STOCK_FILTERS.find((f) => f.key === s)?.key ?? 'all';
  const all = await getShopProducts();
  const byCat = cat ? all.filter((p) => p.category === cat.slug) : all;
  // p.stock is the OMS supply mode: 'in_stock' ships now, anything else is a preorder.
  const list =
    stock === 'all'
      ? byCat
      : byCat.filter((p) => (stock === 'preorder' ? p.stock === 'preorder' : p.stock === 'in_stock'));

  return (
    <div className="wrap">
      <header className="page-head">
        <p className="label">Shop</p>
        <h1 className="display-serif">{cat ? cat.name : 'Everything'}</h1>
        <p className="lead">
          Every price is the final PKR price. Preorders take ~{settings.preorderWeeks} weeks; in-stock pieces ship now.
        </p>
      </header>
      <nav className="pills" aria-label="Categories" style={{ marginBottom: 12 }}>
        <Link className="pill-opt" href={shopHref({ s: stock })} aria-current={!cat ? 'page' : undefined}>All</Link>
        {categories.map((x) => (
          <Link key={x.slug} className="pill-opt" href={shopHref({ c: x.slug, s: stock })} aria-current={cat?.slug === x.slug ? 'page' : undefined}>
            {x.name}
          </Link>
        ))}
      </nav>
      <nav className="pills" aria-label="Availability" style={{ marginBottom: 32 }}>
        {STOCK_FILTERS.map((f) => (
          <Link
            key={f.key}
            className="pill-opt"
            href={shopHref({ c: cat?.slug, s: f.key })}
            aria-current={stock === f.key ? 'page' : undefined}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {list.length === 0 ? (
        <p className="lead" style={{ paddingBottom: 'var(--sec)' }}>
          Nothing here right now.{' '}
          <Link href={shopHref({ c: cat?.slug })} style={{ textDecoration: 'underline' }}>
            See everything in {cat ? cat.name : 'the shop'}
          </Link>
          .
        </p>
      ) : (
        <div className="grid-products" style={{ paddingBottom: 'var(--sec)' }}>
          {list.map((p) => (
            <ProductCard key={p.slug} p={p} grid />
          ))}
        </div>
      )}
    </div>
  );
}
