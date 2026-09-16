import Sparkle from './Sparkle';

const WORDS = ['The Drop', 'Bags', 'Shoes', 'Beauty', 'Fragrance', 'Accessories'];

export default function Marquee() {
  const row = [...WORDS, ...WORDS, ...WORDS, ...WORDS];
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee__track">
        {row.map((w, i) => (
          <span key={i} className="marquee__item">
            <span className="marquee__word">{w.toUpperCase()}</span>
            <Sparkle size={18} tone="berry" />
          </span>
        ))}
      </div>
    </div>
  );
}
