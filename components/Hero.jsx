import Link from 'next/link';
import Sparkle from './Sparkle';
import Parallax from './Parallax';
import Art from './Art';
import { LogoMark } from './Logo';
import { products, priceBreakdown, pkr, settings } from '@/lib/products';

export default function Hero({ product }) {
  const p = product ?? products[0];
  const b = priceBreakdown(p);

  return (
    <section className="hero">
      <div className="hero__curtain" aria-hidden="true">
        <LogoMark className="logo--lg" />
      </div>

      <div className="wrap hero__grid">
        <div className="hero__copy">
          <p className="eyebrow fade-in" style={{ '--d': '1.3s' }}>
            <Sparkle size={12} />
            Official US retailers / delivered to Pakistan
          </p>
          <h1 className="hero__title">
            <span className="line"><span style={{ '--i': 0 }}>US BRANDS.</span></span>
            <span className="line"><span style={{ '--i': 1 }}>PK PRICES.</span></span>
            <span className="line"><span className="berry" style={{ '--i': 2 }}>ZERO DRAMA.</span></span>
          </h1>
          <p className="hero__serif fade-in" style={{ '--d': '1.8s' }}>your rich bestie in the States, basically.</p>
          <p className="hero__sub fade-in" style={{ '--d': '1.9s' }}>
            Bags, shoes, beauty and fragrance bought from official US retailers, never resellers, with the receipt kept for every order. See the final PKR price upfront, pay 50% now and 50% when it lands in Pakistan.
          </p>
          <div className="hero__ctas fade-in" style={{ '--d': '2s' }}>
            <Link href="/#drop" className="btn btn--berry btn--lg">Shop the drop →</Link>
            <Link href="/request" className="btn btn--ghost btn--lg">Request anything</Link>
          </div>
          <dl className="hero__stats fade-in" style={{ '--d': '2.1s' }}>
            <div><dt>~{settings.preorderWeeks} wks</dt><dd>preorder delivery</dd></div>
            <div><dt>PKR</dt><dd>final prices, no surprises</dd></div>
            <div><dt>50/50</dt><dd>split payments</dd></div>
          </dl>
        </div>

        <Parallax className="hero__visual">
          <div className="glow" aria-hidden="true" />
          <div className="orb fade-only" style={{ '--d': '1.5s' }} aria-hidden="true" />
          <Link href={`/p/${p.slug}`} className="float-card fade-only" style={{ '--d': '1.9s' }}>
            {p.images?.[0] ? (
              <div className="art photo">
                <img src={p.images[0].url} alt={p.images[0].alt || p.name} />
                <span className="chip chip--berry">{p.stock === 'preorder' ? 'Preorder' : 'In stock'}</span>
              </div>
            ) : (
              <Art art={p.art}>
                <span className="chip chip--berry">{p.stock === 'preorder' ? 'Preorder' : 'In stock'}</span>
              </Art>
            )}
            <span className="float-card__meta">
              {p.brand && <span className="pcard__brand">{p.brand}</span>}
              <span className="pcard__name">{p.name}</span>
              <span className="pcard__price"><b>{pkr(b.total)}</b><small>final</small></span>
            </span>
          </Link>
          <span className="sticker sticker--script pop" style={{ '--d': '2.2s', '--r': '-8deg' }} aria-hidden="true">she got it!</span>
          <span className="badge-5050 pop" style={{ '--d': '2.35s', '--r': '12deg' }} aria-hidden="true">
            <b>50/50</b>
            <small>split pay</small>
          </span>
          <Sparkle size={58} className="pop" style={{ '--d': '2.4s', right: '10%', top: '0%' }} />
          <Sparkle size={30} className="pop" style={{ '--d': '2.5s', left: '2%', top: '6%' }} />
          <Sparkle size={24} tone="berry" className="pop" style={{ '--d': '2.6s', right: '0%', top: '52%' }} />
        </Parallax>
      </div>
    </section>
  );
}
