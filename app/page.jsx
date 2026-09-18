import Hero from '@/components/Hero';
import Marquee from '@/components/Marquee';
import HowItWorks from '@/components/HowItWorks';
import TheDrop from '@/components/TheDrop';
import PriceReceipt from '@/components/PriceReceipt';
import BatchTracker from '@/components/BatchTracker';
import ShopByVibe from '@/components/ShopByVibe';
import BestieWall from '@/components/BestieWall';
import BestieClub from '@/components/BestieClub';
import Reveal from '@/components/Reveal';
import { getBatchInfo, getShopProducts } from '@/lib/live';

// Products, prices and batches come from the order system; refresh every 5 minutes.
export const revalidate = 300;

export default async function Home() {
  const [items, batches] = await Promise.all([getShopProducts(), getBatchInfo()]);
  const featured = items.find((p) => p.orderable && p.b.usd != null) ?? items.find((p) => p.orderable) ?? items[0];
  // Real stock first; our own sample pages only fill in when the OMS has nothing yet.
  const drop = items.filter((p) => p.orderable && (p.oms || p.inDrop)).slice(0, 10);

  return (
    <>
      <Hero product={featured} />
      <Marquee />
      <TheDrop items={drop} batch={batches.open} />
      <PriceReceipt product={featured} batchNo={batches.open?.number} />

      {batches.current && (
        <section className="sec sec--blush">
          <div className="wrap">
            <div className="sec__head">
              <Reveal className="stack">
                <p className="label">Live batch tracker</p>
                <h2 className="h2">Watch it fly<br />home.</h2>
              </Reveal>
              <Reveal delay={100}>
                <p className="lead">Every preorder ships in a batch. Here&rsquo;s where the latest one is right now.</p>
              </Reveal>
            </div>
            <BatchTracker batch={batches.current} />
          </div>
        </section>
      )}

      <section className="sec" id="vibes">
        <div className="wrap">
          <div className="sec__head">
            <Reveal className="stack">
              <p className="label">Shop by vibe</p>
              <h2 className="h2">Pick your<br />vibe.</h2>
            </Reveal>
            <Reveal delay={100}>
              <p className="lead">Every piece shows its final PKR price and whether it ships now or on preorder.</p>
            </Reveal>
          </div>
          <ShopByVibe items={items} />
        </div>
      </section>

      <BestieWall />
      {/* Near the end: by here a shopper has seen the goods and the price, and "how does
          this reach me?" is the question actually left over. */}
      <HowItWorks sample={featured} batchNo={batches.open?.number} />
      <BestieClub />
    </>
  );
}
