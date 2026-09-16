import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="wrap page-head" style={{ minHeight: '60vh', alignContent: 'center' }}>
      <p className="label">404</p>
      <h1 className="display-serif">This page got lost in customs.</h1>
      <p className="lead">It doesn&rsquo;t exist, or it moved. Let&rsquo;s get you back to the good stuff.</p>
      <Link href="/" className="btn btn--berry">Back home →</Link>
    </div>
  );
}
