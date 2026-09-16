import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import { categories, settings } from '@/lib/products';
import { getShopProducts } from '@/lib/live';

export const metadata = {
  title: 'Shop',
  description: 'US bags, shoes, beauty, fragrance and accessories with final PKR prices.',
};

export default async function ShopPage({ searchParams }) {
  const { c } = (await searchParams) ?? {};
  const cat = categories.find((x) => x.slug === c);
  const all = await getShopProducts();
  const list = cat ? all.filter((p) => p.category === cat.slug) : all;

  return (
    <div className="wrap">
      <header className="page-head">
        <p className="label">Shop</p>
        <h1 className="display-serif">{cat ? cat.name : 'Everything'}</h1>
        <p className="lead">
          Every price is the final PKR price. Preorders take ~{settings.preorderWeeks} weeks; in-stock pieces ship now.
        </p>
      </header>
      <nav className="pills" aria-label="Categories" style={{ marginBottom: 32 }}>
        <Link className="pill-opt" href="/shop" aria-current={!cat ? 'page' : undefined}>All</Link>
        {categories.map((x) => (
          <Link key={x.slug} className="pill-opt" href={`/shop?c=${x.slug}`} aria-current={cat?.slug === x.slug ? 'page' : undefined}>
            {x.name}
          </Link>
        ))}
      </nav>
      <div className="grid-products" style={{ paddingBottom: 'var(--sec)' }}>
        {list.map((p) => (
          <ProductCard key={p.slug} p={p} grid />
        ))}
      </div>
    </div>
  );
}
