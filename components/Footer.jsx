import Link from 'next/link';
import Logo from './Logo';
import { categories } from '@/lib/products';
import { contactLink, instagramUrl, site } from '@/lib/site';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__top">
          <div className="stack" style={{ maxWidth: 360 }}>
            <Logo />
            <p className="muted small" style={{ margin: 0 }}>
              USA brands, final PKR prices, 50/50 payments. Your rich bestie in the States, basically.
            </p>
          </div>
          <div className="footer__cols">
            <div className="footer__col">
              <p className="mono muted">Shop</p>
              <Link href="/#drop">The Drop</Link>
              {categories.map((c) => (
                <Link key={c.slug} href={`/shop?c=${c.slug}`}>{c.name}</Link>
              ))}
            </div>
            <div className="footer__col">
              <p className="mono muted">Help</p>
              <Link href="/my-orders">My orders</Link>
              <Link href="/track">Track order</Link>
              <Link href="/how-it-works">How it works</Link>
              <Link href="/request">Request anything</Link>
              <Link href="/how-it-works#faq">FAQ</Link>
            </div>
            <div className="footer__col">
              <p className="mono muted">Social</p>
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer">Instagram</a>
              {site.whatsapp && (
                <a href={contactLink()} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              )}
            </div>
          </div>
        </div>
        <p className="footer__word" aria-hidden="true">Global Bestie</p>
        <div className="footer__bar">
          <span>© {new Date().getFullYear()} Global Bestie by HAR</span>
          <span>Prices in PKR · Lahore / Karachi / Islamabad</span>
          <span>Preorder timing can vary by batch</span>
        </div>
      </div>
    </footer>
  );
}
