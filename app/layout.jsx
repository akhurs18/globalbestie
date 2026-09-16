import './globals.css';
import SmoothScroll from '@/components/SmoothScroll';
import AnnouncementBar from '@/components/AnnouncementBar';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import StickyBar from '@/components/StickyBar';
import { BagProvider } from '@/components/BagProvider';

export const metadata = {
  title: {
    default: 'Global Bestie by HAR · US brands, PK prices, zero drama',
    template: '%s · Global Bestie',
  },
  description:
    'Bags, shoes, beauty and fragrance from the US, delivered to Pakistan. Final PKR prices upfront. Pay 50% now, 50% when it lands.',
};

export const viewport = { themeColor: '#FFF8F4' };

const introScript =
  "try{if(sessionStorage.getItem('gb-intro'))document.documentElement.classList.add('no-intro');else sessionStorage.setItem('gb-intro','1')}catch(e){}";

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: introScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&family=Mrs+Saint+Delafield&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Poiret+One&display=swap"
        />
      </head>
      <body>
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="gb-chrome" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#F7F8FB" />
              <stop offset=".28" stopColor="#B4B8C4" />
              <stop offset=".5" stopColor="#FFFFFF" />
              <stop offset=".74" stopColor="#8C90A0" />
              <stop offset="1" stopColor="#E3E5EA" />
            </linearGradient>
          </defs>
        </svg>
        <SmoothScroll />
        <BagProvider>
          <AnnouncementBar />
          <Nav />
          <main>{children}</main>
          <Footer />
          <StickyBar />
        </BagProvider>
      </body>
    </html>
  );
}
