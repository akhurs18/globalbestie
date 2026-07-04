// Single source of truth for customer-facing PKR pricing. Imported by every
// server function that shows or computes a price (catalog, orders reprice,
// sourcing-estimate suggestions, ad copy) so the formula can never drift
// between surfaces — previously this same math was copy-pasted in 4+ places.
//
// Two pricing modes:
//   • In-stock  — priced directly in PKR via customer_price_pkr (already in
//                 Pakistan, no import math). Used verbatim (ceil only) —
//                 the team sets these by hand and we respect exact control.
//   • Preorder  — derived from USD retail:
//                   retailPkr = usd × fx
//                   total     = retailPkr + retailPkr×markup + shipping,
//                 rounded UP to a clean ₨100 "luxury" figure — the same
//                 roundLuxuryPrice() the storefront applies, so the order
//                 total always matches the price the customer browsed.
//
// Product fields win over settings fallbacks (fx_rate, markup_rate); settings
// supply the defaults when a product hasn't pinned its own.

export function roundLuxuryPrice(amount) {
  const n = Number(amount) || 0;
  if (n <= 0) return 0;
  return Math.ceil(n / 100) * 100;
}

export function customerPricePkr(product = {}, settings = {}) {
  const direct = Number(product.customer_price_pkr || 0);
  if (direct > 0) return Math.ceil(direct);
  const fx = Number(product.fx_rate || settings.fx_rate || 282);
  const markup = Number(product.markup_rate ?? settings.markup_rate ?? 0.25);
  const retailPkr = Number(product.usa_price_usd || 0) * fx;
  const shipping = Number(product.shipping_pkr || 0);
  return roundLuxuryPrice(retailPkr + retailPkr * markup + shipping);
}

// Suggested price for a USD retail figure when there's no product row yet
// (the sourcing tray autofill). `shippingPkr` is the category-default band.
export function suggestPricePkr(usd, shippingPkr, settings = {}) {
  return customerPricePkr(
    { usa_price_usd: usd, shipping_pkr: shippingPkr },
    settings
  );
}
