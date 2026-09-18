/**
 * A picture for a product whose photo has not landed yet.
 *
 * A new arrival can sit in the shop for a day or two before its shot arrives, and an
 * empty card reads as a broken one. So each category gets a still life of its own, drawn
 * in the site's palette rather than photographed.
 *
 * It is scenery, not the product: every card and page that falls back to one keeps its
 * "photo coming soon" label, so nobody buys expecting the bag in the picture. The shapes
 * carry no gradient <defs>, because the same art repeats across a whole grid and shared
 * ids would repeat with it.
 */

const SHAPES = {
  bags: (
    <>
      <path d="M110 150c0-24 14-38 40-38s40 14 40 38" fill="none" stroke="#2A2124" strokeOpacity=".5" strokeWidth="9" strokeLinecap="round" />
      <rect x="72" y="146" width="156" height="118" rx="24" fill="#FFF8F4" />
      <rect x="72" y="182" width="156" height="9" fill="#DDA3A8" />
      <circle cx="150" cy="208" r="11" fill="#C2255C" />
    </>
  ),
  shoes: (
    <>
      <path d="M62 236c16-6 28-18 42-33 10-11 23-9 29 3l10 20c6 12 18 19 32 21l27 4c14 2 24 11 24 23v8H62z" fill="#FFF8F4" />
      <rect x="52" y="272" width="196" height="28" rx="14" fill="#DDA3A8" />
      <circle cx="196" cy="252" r="9" fill="#C2255C" />
      <path d="M104 214l16 16M124 196l16 16" stroke="#2A2124" strokeOpacity=".35" strokeWidth="7" strokeLinecap="round" />
    </>
  ),
  beauty: (
    <>
      <circle cx="104" cy="206" r="46" fill="#FFF8F4" />
      <circle cx="104" cy="206" r="23" fill="#E9B8BB" />
      <rect x="176" y="164" width="34" height="48" rx="7" fill="#C2255C" />
      <rect x="170" y="210" width="46" height="60" rx="10" fill="#FFF8F4" />
      <rect x="238" y="146" width="15" height="86" rx="7.5" fill="#2A2124" opacity=".6" />
      <path d="M238 232h15v32c0 9-3 14-7.5 14s-7.5-5-7.5-14z" fill="#DDA3A8" />
    </>
  ),
  fragrance: (
    <>
      <rect x="102" y="172" width="96" height="122" rx="22" fill="#FFF8F4" />
      <rect x="134" y="148" width="32" height="30" rx="6" fill="#DDA3A8" />
      <rect x="126" y="124" width="48" height="28" rx="11" fill="#C2255C" />
      <rect x="122" y="206" width="56" height="44" rx="11" fill="#E9B8BB" opacity=".55" />
    </>
  ),
  accessories: (
    <>
      <rect x="56" y="158" width="78" height="54" rx="23" fill="#FFF8F4" />
      <rect x="166" y="158" width="78" height="54" rx="23" fill="#FFF8F4" />
      <path d="M134 176h32" stroke="#2A2124" strokeOpacity=".45" strokeWidth="9" strokeLinecap="round" />
      <rect x="94" y="240" width="112" height="68" rx="13" fill="#DDA3A8" />
      <rect x="94" y="266" width="112" height="11" fill="#C2255C" opacity=".85" />
    </>
  ),
};

export default function CategoryArt({ category, className = '', label, children }) {
  const slug = SHAPES[category] ? category : 'beauty';
  return (
    <div className={`art catart catart--${slug} ${className}`}>
      <svg className="catart__svg" viewBox="0 0 300 370" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {SHAPES[slug]}
      </svg>
      {label && <span className="art__label">{label}</span>}
      {children}
    </div>
  );
}
