import Link from 'next/link';
import BagLink from './BagLink';

export default function StickyBar() {
  return (
    <div className="sticky">
      <Link href="/#drop" className="btn btn--berry">Shop the drop</Link>
      <BagLink className="btn btn--white" />
    </div>
  );
}
