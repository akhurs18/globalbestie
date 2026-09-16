import BagView from '@/components/BagView';
import { getShopProducts } from '@/lib/live';

export const metadata = { title: 'Your bag' };
export const revalidate = 300;

export default async function BagPage() {
  const items = await getShopProducts();
  // Only what the bag needs to show; prices are the live ones.
  const catalogue = items.map((p) => ({
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    art: p.art,
    image: p.images?.[0]?.url ?? null,
    shades: p.shades?.map((s) => ({ name: s.name, sellable: s.sellable, image: s.image })) ?? null,
    stock: p.stock,
    orderable: p.orderable !== false,
    missing: Boolean(p.missing),
    total: p.b.total,
  }));

  return (
    <div className="wrap">
      <header className="page-head">
        <p className="label">Your bag</p>
        <h1 className="display-serif">Almost yours.</h1>
        <p className="lead">Send your order request. We confirm stock, final price and batch before you pay anything.</p>
      </header>
      <BagView catalogue={catalogue} />
    </div>
  );
}
