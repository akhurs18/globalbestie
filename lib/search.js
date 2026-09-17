import { categories } from './products';

/**
 * Searching the shop.
 *
 * Shoppers arrive knowing a brand, a product or a shade — "nyx", "blush", "buttermelt",
 * "my butta half" — and rarely the exact name we hold. So every word typed has to appear
 * somewhere in the product, in any order, and the words are matched as prefixes: "but"
 * finds "Buttermelt". Accents and punctuation are ignored on both sides, because "e.l.f."
 * and "elf" are the same brand to everyone except a string comparison.
 *
 * The description is deliberately left out of the haystack: matching it makes a search for
 * "lip" return every product whose blurb mentions lips, which reads as noise.
 */

const strip = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** The words a shopper typed, punctuation discarded. */
export const terms = (q) => strip(q).split(/[^a-z0-9]+/).filter(Boolean);

function haystack(p) {
  const cat = categories.find((c) => c.slug === p.category);
  return terms(
    [p.name, p.brand, cat?.name, p.category, ...(p.shades ?? []).map((s) => s.name)].filter(Boolean).join(' '),
  );
}

/** Every word typed has to match the start of some word in the product. */
function hits(words, q) {
  return q.every((t) => words.some((w) => w.startsWith(t)));
}

/**
 * Products matching `q`, best first: a hit in the name outranks one that is only in a
 * shade or a brand, so "blush" leads with the blushes rather than everything by a brand
 * with "Blush" in its name.
 */
export function searchProducts(list, q) {
  const wanted = terms(q);
  if (wanted.length === 0) return list;

  return list
    .map((p) => {
      if (!hits(haystack(p), wanted)) return null;
      const name = terms(p.name);
      const score = hits(name, wanted) ? 0 : 1;
      return { p, score };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)
    .map((x) => x.p);
}
