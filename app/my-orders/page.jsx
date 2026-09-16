import AccountView from '@/components/AccountView';

export const metadata = {
  title: 'My orders',
  description: 'Sign in with your mobile number to see every Global Bestie order: where it is, what you paid and what is left.',
  // Nothing here is for a search engine, and the page is per-customer.
  robots: { index: false, follow: false },
};

// Everything on this page belongs to the signed-in customer, so it is never cached.
export const dynamic = 'force-dynamic';

export default function MyOrdersPage() {
  return (
    <div className="wrap">
      <AccountView />
    </div>
  );
}
