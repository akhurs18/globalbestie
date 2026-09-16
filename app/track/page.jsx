import Link from 'next/link';
import TrackForm from '@/components/TrackForm';
import BatchTracker from '@/components/BatchTracker';
import { getBatchInfo } from '@/lib/live';

export const metadata = {
  title: 'Track your order',
  description: 'Check your Global Bestie order and where your batch is, from the US to Pakistan.',
};

export const revalidate = 60;

export default async function TrackPage() {
  const batches = await getBatchInfo();
  return (
    <>
      <div className="wrap two-col">
        <div className="stack-lg">
          <p className="label">Track order</p>
          <h1 className="display-serif">Where&rsquo;s my stuff?</h1>
          <p className="lead">Enter your order number and the phone number you ordered with. We&rsquo;ll show you every stage, what you&rsquo;ve paid and what&rsquo;s left.</p>
          <div className="notice" style={{ margin: 0 }}>
            <b>Lost your order number?</b> Sign in with your email address instead and see every order you&rsquo;ve
            placed with us, what you&rsquo;ve paid and what&rsquo;s left.{' '}
            <Link href="/my-orders" style={{ textDecoration: 'underline' }}>Sign in to My orders →</Link>
          </div>
        </div>
        <TrackForm />
      </div>
      {batches.current && (
        <section className="sec sec--blush">
          <div className="wrap">
            <div className="sec__head">
              <div className="stack">
                <p className="label">Live batch tracker</p>
                <h2 className="h2">Watch it fly home.</h2>
              </div>
            </div>
            <BatchTracker batch={batches.current} />
          </div>
        </section>
      )}
    </>
  );
}
