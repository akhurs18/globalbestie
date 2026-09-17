import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import { categories, settings } from '@/lib/products';
import { getShopProducts } from '@/lib/live';
import { searchProducts } from '@/lib/search';

export const metadata = {
  title: 'Shop',
  description: 'US bags, shoes, beauty, fragrance and accessories with final PKR prices.',
};

/* Search, category and availability all travel in the URL, so a filtered shop can be
   shared, bookmarked and reached by the back button — and picking one keeps the others. */
const STOCK_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'in-stock', label: 'In stock' },
  { key: 'preorder', label: 'Preorder' },
];

function shopHref({ c, s, q } = {}) {
  const params = new URLSearchParams();
  if (c) params.set('c', c);
  if (s && s !== 'all') params.set('s', s);
  if (q) params.set('q', q);
  const qs = params.toString();
  return qs ? `/shop?${qs}` : '/shop';
}

export default async function ShopPage({ searchParams }) {
  const { c, s, q } = (await searchParams) ?? {};
  // Long enough for "fenty extra fu y lip liner mini gloss duo", short enough to be a query.
  const query = typeof q === 'string' ? q.trim().slice(0, 80) : '';
  const cat = categories.find((x) => x.slug === c);
  // An unknown ?s= falls back to "all" rather than showing an empty shop.
  const stock = STOCK_FILTERS.find((f) => f.key === s)?.key ?? 'all';

  const all = await getShopProducts();
  const byCat = cat ? all.filter((p) => p.category === cat.slug) : all;
  // p.stock is the OMS supply mode: 'in_stock' ships now, anything else is a preorder.
  const inStock =
    stock === 'all'
      ? byCat
      : byCat.filter((p) => (stock === 'preorder' ? p.stock === 'preorder' : p.stock === 'in_stock'));
  const list = query ? searchProducts(inStock, query) : inStock;

  const where = cat ? cat.name : 'the shop';

  return (
    <div className="wrap">
      <header className="page-head">
        <p className="label">Shop</p>
        <h1 className="display-serif">{query ? `“${query}”` : cat ? cat.name : 'Everything'}</h1>
        {/* With no matches the message below carries it; "0 matches" twice reads as a fault. */}
        {(!query || list.length > 0) && (
          <p className="lead">
            {query
              ? `${list.length} ${list.length === 1 ? 'match' : 'matches'} in ${where}.`
              : `Every price is the final PKR price. Preorders take ~${settings.preorderWeeks} weeks; in-stock pieces ship now.`}
          </p>
        )}
      </header>

      <form className="searchbar" action="/shop" method="get" role="search" id="find">
        {/* Searching inside a category or availability keeps you there. */}
        {cat && <input type="hidden" name="c" value={cat.slug} />}
        {stock !== 'all' && <input type="hidden" name="s" value={stock} />}
        <input
          className="input"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by brand, product or shade"
          aria-label="Search products"
        />
        <button className="btn btn--berry" type="submit">Search</button>
        {query && (
          <Link className="pill-opt" href={shopHref({ c: cat?.slug, s: stock })}>
            Clear
          </Link>
        )}
      </form>

      <nav className="pills" aria-label="Categories" style={{ marginBottom: 12 }}>
        <Link className="pill-opt" href={shopHref({ s: stock, q: query })} aria-current={!cat ? 'page' : undefined}>All</Link>
        {categories.map((x) => (
          <Link key={x.slug} className="pill-opt" href={shopHref({ c: x.slug, s: stock, q: query })} aria-current={cat?.slug === x.slug ? 'page' : undefined}>
            {x.name}
          </Link>
        ))}
      </nav>
      <nav className="pills" aria-label="Availability" style={{ marginBottom: 32 }}>
        {STOCK_FILTERS.map((f) => (
          <Link
            key={f.key}
            className="pill-opt"
            href={shopHref({ c: cat?.slug, s: f.key, q: query })}
            aria-current={stock === f.key ? 'page' : undefined}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {list.length === 0 ? (
        <p className="lead" style={{ paddingBottom: 'var(--sec)' }}>
          {query ? (
            <>
              Nothing matches &ldquo;{query}&rdquo; in {where}.{' '}
              <Link href={shopHref({ c: cat?.slug })} style={{ textDecoration: 'underline' }}>
                See everything in {where}
              </Link>
              , or <Link href="/request" style={{ textDecoration: 'underline' }}>ask us to get it</Link> — we source
              anything from the US.
            </>
          ) : (
            <>
              Nothing here right now.{' '}
              <Link href={shopHref({ c: cat?.slug })} style={{ textDecoration: 'underline' }}>
                See everything in {where}
              </Link>
              .
            </>
          )}
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
