'use client';

import { useEffect, useState } from 'react';

function parts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
}

const pad = (n) => String(n).padStart(2, '0');

export default function Countdown({ to, compact = false }) {
  const [left, setLeft] = useState(null);

  useEffect(() => {
    const target = new Date(to).getTime();
    const tick = () => setLeft(target - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [to]);

  const p = left == null ? null : parts(left);
  const closed = left != null && left <= 0;

  if (compact) {
    return <b className="berry">{closed ? 'Closed' : p ? `${p[0]}d ${pad(p[1])}h ${pad(p[2])}m` : '—'}</b>;
  }

  if (closed) {
    return <span className="chip">Batch closed · next one opens soon</span>;
  }

  return (
    <div className="countdown__units" role="timer" aria-label="Time until this batch closes">
      {['Days', 'Hrs', 'Min', 'Sec'].map((label, i) => (
        <div className="countdown__u" key={label}>
          <b>{p ? pad(p[i]) : '--'}</b>
          <small>{label.toUpperCase()}</small>
        </div>
      ))}
    </div>
  );
}
