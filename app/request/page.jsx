import RequestForm from '@/components/RequestForm';
import Sparkle from '@/components/Sparkle';

export const metadata = {
  title: 'Request anything',
  description: 'Paste any US product link and get a final PKR quote. Nothing to pay until we confirm.',
};

export const revalidate = 300;

export default function RequestPage() {
  return (
    <div className="wrap two-col">
      <div className="stack-lg">
        <p className="label">Request anything</p>
        <h1 className="display-serif">Seen it in the States? We&rsquo;ll get it.</h1>
        <p className="lead">
          Paste a link from any US store and tell us your size, shade or colour. We check stock and send your final PKR price and batch. Nothing to pay until you say yes.
        </p>
        <ul className="trust">
          <li><Sparkle size={14} tone="berry" />Final PKR price before you pay</li>
          <li><Sparkle size={14} tone="berry" />50% after we confirm, 50% when it lands (preorders)</li>
          <li><Sparkle size={14} tone="berry" />A real person replies, not a bot guessing prices</li>
        </ul>
      </div>
      <RequestForm />
    </div>
  );
}
