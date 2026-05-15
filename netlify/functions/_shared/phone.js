// Canonical Pakistani mobile-number handling. Used by BOTH the client and
// the Netlify functions so the customer's identity is the same string no
// matter where it gets touched.
//
// Canonical form: E.164 without the leading '+', so a PK mobile becomes
// `923xxxxxxxxx`. WhatsApp deep links (`wa.me/{canon}`) accept exactly this
// form, and Supabase exact-match (`eq.${canon}`) becomes trivial.
//
// Accepted inputs (all map to the same canon):
//   0300 1234567        → 923001234567
//   03001234567         → 923001234567
//   +92 300 1234567     → 923001234567
//   0092 300 1234567    → 923001234567
//   923001234567        → 923001234567
//   3001234567 (rare)   → 923001234567

export function canonPhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  // Strip leading 00 (e.g. 0092 → 92)
  if (d.startsWith("00")) d = d.slice(2);
  // 03xx… → 923xx…
  if (d.startsWith("0")) d = "92" + d.slice(1);
  // Bare 3xxxxxxxxx (10 digits, customer dropped both the country and the 0)
  if (d.length === 10 && d.startsWith("3")) d = "92" + d;
  return d;
}

// Strict Pakistani-mobile validator. PK mobiles always start with `3` after
// the country code and are 10 digits long after the country code.
//   923xxxxxxxxx = 12 digits total, starts with `923`.
export function isValidPkMobile(canon) {
  return /^923\d{9}$/.test(canon);
}

// Convenience: canonicalize then validate. Returns the canon string if valid,
// otherwise null.
export function validateAndCanon(raw) {
  const c = canonPhone(raw);
  return isValidPkMobile(c) ? c : null;
}

// Display form for receipts and UI: "+92 300 1234567"
export function formatPkDisplay(canon) {
  if (!isValidPkMobile(canon)) return canon || "";
  // canon = 923XXXXXXXXX  → +92 3XX XXXXXXX
  return `+92 ${canon.slice(2, 5)} ${canon.slice(5)}`;
}

// Mask phone for public-facing displays (verification pages, etc.)
//   923001234567 → +92 3** *****67
export function maskPkPhone(canon) {
  if (!isValidPkMobile(canon)) return canon || "";
  return `+92 ${canon.slice(2, 3)}** *****${canon.slice(-2)}`;
}
