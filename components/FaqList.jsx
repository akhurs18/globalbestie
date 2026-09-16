import { faqs } from '@/lib/faq';

export default function FaqList() {
  return (
    <div>
      {faqs.map(([q, a], i) => (
        <details key={q} open={i === 0}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  );
}
