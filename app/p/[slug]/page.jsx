import Link from 'next/link';
import { notFound } from 'next/navigation';
import Gallery from '@/components/Gallery';
import ProductBuy from '@/components/ProductBuy';
import ProductCard from '@/components/ProductCard';
import Countdown from '@/components/Countdown';
import FaqList from '@/components/FaqList';
import Sparkle from '@/components/Sparkle';
import { categories, pkr, products, settings } from '@/lib/products';
import { getBatchInfo, getLiveProduct, getShopProducts } from '@/lib/live';

export const revalidate = 300;

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const p = await getLiveProduct(slug);
  if (!p) return {};
  return {
    title: p.name,
    description: `${p.name}: ${pkr(p.b.total)} final price in Pakistan. ${p.stock === 'preorder' ? 'Preorder: pay 50% after we confirm, 50% when it lands.' : 'In stock, ships now.'}`,
  };
}

function journey(b, pre) {
  if (!pre) {
    return [
      ['01', 'Request it', 'Add to bag and send your request. No payment yet.', 'PKR 0 now'],
      ['02', 'We confirm', 'Stock and final PKR price, sent to you.', 'Final price'],
      ['03', 'Pay in full', 'Bank transfer after we confirm. We verify your proof.', pkr(b.total)],
      ['04', 'We dispatch', 'Packed with love and sent to your door.', 'Ships now'],
    ];
  }
  return [
    ['01', 'Request it', 'Add to bag and send your request. No payment yet.', 'PKR 0 now'],
    ['02', 'We confirm', 'Stock, final PKR price and your batch, sent to you.', 'Final price'],
    ['03', 'Pay 50%', 'Bank transfer to lock it in. We verify your proof.', pkr(b.advance)],
    ['04', 'Batch flies', 'Your piece ships with the batch. Track every stage.', `~${settings.preorderWeeks} weeks`],
    ['05', 'Pay 50%, delivered', 'Balance when it lands in Pakistan, then we dispatch.', pkr(b.balance)],
  ];
}

export default async function ProductPage({ params }) {
  const { slug } = await params;
  const [p, all, batches] = await Promise.all([getLiveProduct(slug), getShopProducts(), getBatchInfo()]);
  if (!p) notFound();

  const b = p.b;
  const pre = p.stock === 'preorder';
  const open = pre ? batches.open : null;
  const cat = categories.find((c) => c.slug === p.category);
  // Same category first, so a blush suggests other beauty rather than a bag.
  const more = [...all.filter((x) => x.slug !== p.slug && x.category === p.category), ...all.filter((x) => x.category !== p.category)].slice(0, 4);
  const steps = journey(b, pre);

  return (
    <>
      <div className="wrap">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/shop">Shop</Link><span>/</span>
          <Link href={`/shop?c=${p.category}`}>{cat?.name}</Link><span>/</span>
          <span aria-current="page">{p.name}</span>
        </nav>

        <div className="pdp">
          <Gallery p={p} batch={open?.number ?? null} />

          <div className="info">
            {p.brand && <span className="pcard__brand">{p.brand}</span>}
            <h1>{p.name}</h1>
            <div className="pills">
              <span className={`chip ${pre ? 'chip--pre' : ''}`}>{pre ? `Preorder · ~${settings.preorderWeeks} wks` : 'In stock · ships now'}</span>
              {open && <span className="chip">Batch {open.number}</span>}
            </div>
            <div>
              <div className="price-big">{pkr(b.total)}</div>
              <p className="muted small" style={{ margin: '6px 0 0' }}>Final price. Shipping to Pakistan included.</p>
            </div>

            {p.description && <p className="muted" style={{ margin: 0 }}>{p.description}</p>}

            <ProductBuy p={p} b={b} />

            {open?.closesAt && (
              <div className="batch-card">
                <div className="batch-card__row">
                  <span className="mono">Batch {open.number} closes in</span>
                  <Countdown compact to={open.closesAt} />
                </div>
                <p className="small muted" style={{ margin: 0 }}>
                  Estimated arrival ~{settings.preorderWeeks} weeks after the batch closes. Timing can vary; we update you at every stage.
                </p>
              </div>
            )}

            <ul className="trust">
              <li><Sparkle size={14} tone="berry" />Sourced from US retailers</li>
              <li><Sparkle size={14} tone="berry" />Team confirms before you pay</li>
              <li><Sparkle size={14} tone="berry" />Track every stage of your {pre ? 'batch' : 'order'}</li>
            </ul>
          </div>
        </div>
      </div>

      <section className="sec sec--blush">
        <div className="wrap">
          <div className="sec__head">
            <div className="stack">
              <p className="label">How your order works</p>
              <h2 className="h2">From tap to doorstep.</h2>
            </div>
            <p className="lead">No surprises at any step. You always know what you owe and where your piece is.</p>
          </div>
          <div className="journey" style={{ '--n': steps.length }}>
            {steps.map(([num, title, text, tag]) => (
              <div className="jstep" key={num}>
                <span className="step__n">{num}</span>
                <h3>{title}</h3>
                <p>{text}</p>
                <span className="chip chip--pre">{tag}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec__head">
            <div className="stack">
              <p className="label">Complete the vibe</p>
              <h2 className="h2">Pairs well with.</h2>
            </div>
            <Link className="btn btn--ghost" href="/shop">Shop everything →</Link>
          </div>
          <div className="grid-products">
            {more.map((x) => (
              <ProductCard key={x.slug} p={x} grid />
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec--white">
        <div className="wrap faq">
          <div className="stack-lg">
            <p className="label">FAQ</p>
            <h2 className="h2">Questions?<br />Obviously.</h2>
            <p className="lead">Still unsure? Message us. A real person from the team replies.</p>
          </div>
          <FaqList />
        </div>
      </section>
    </>
  );
}
