import Sparkle from './Sparkle';

const ITEMS = ['New drop every Friday', 'Final prices in PKR', 'Pay 50% now, 50% when it lands', 'Request anything from the US'];

export default function AnnouncementBar() {
  const row = [...ITEMS, ...ITEMS, ...ITEMS, ...ITEMS];
  return (
    <div className="announce" role="note" aria-label={ITEMS.join('. ')}>
      <div className="announce__track" aria-hidden="true">
        {row.map((t, i) => (
          <span key={i} className="announce__item">
            {t}
            <Sparkle size={9} tone="ink" />
          </span>
        ))}
      </div>
    </div>
  );
}
