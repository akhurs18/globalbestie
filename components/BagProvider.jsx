'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const BagContext = createContext(null);
const STORAGE_KEY = 'gb-bag';
const MAX_QTY = 20;

/**
 * The bag lives in this browser only (localStorage). It holds product slugs, quantities
 * and chosen options — never prices, which always come fresh from the catalogue.
 */
export function BagProvider({ children }) {
  const [lines, setLines] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(saved)) setLines(saved.filter((l) => l && typeof l.slug === 'string'));
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {}
  }, [lines, ready]);

  const add = useCallback((slug, options = '', qty = 1) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.slug === slug && l.options === options);
      if (i === -1) return [...ls, { slug, options, qty: Math.min(MAX_QTY, qty) }];
      const next = [...ls];
      next[i] = { ...next[i], qty: Math.min(MAX_QTY, next[i].qty + qty) };
      return next;
    });
  }, []);

  const setQty = useCallback((index, qty) => {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, qty: Math.max(1, Math.min(MAX_QTY, qty)) } : l)));
  }, []);

  const remove = useCallback((index) => setLines((ls) => ls.filter((_, i) => i !== index)), []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({ lines, ready, add, setQty, remove, clear, count: lines.reduce((a, l) => a + l.qty, 0) }),
    [lines, ready, add, setQty, remove, clear]
  );

  return <BagContext.Provider value={value}>{children}</BagContext.Provider>;
}

export function useBag() {
  const ctx = useContext(BagContext);
  if (!ctx) throw new Error('useBag must be used inside <BagProvider>');
  return ctx;
}
