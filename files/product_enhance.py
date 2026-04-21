#!/usr/bin/env python3
"""
Apply product view enhancements P1-P6 to products.html
"""
import re

FILE = '/Users/abdulrehman/claude/globalbestie/files/products.html'
with open(FILE) as f:
    html = f.read()

# ── P1: Brand carousel CSS ──
brand_carousel_css = """
/* ── BRAND CAROUSEL ── */
.brand-carousel-wrap{background:var(--ink2);border-bottom:1px solid rgba(196,82,90,0.12);padding:1rem 0;overflow:hidden}
.brand-carousel-title{text-align:center;font-size:0.55rem;font-weight:500;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:0.8rem}
.brand-carousel{display:flex;gap:0.6rem;overflow-x:auto;padding:0 2rem;scrollbar-width:none;-ms-overflow-style:none;scroll-behavior:smooth}
.brand-carousel::-webkit-scrollbar{display:none}
.brand-chip{flex-shrink:0;padding:0.4rem 1rem;background:rgba(255,255,255,0.03);border:1px solid rgba(196,82,90,0.15);font-family:'Playfair Display',serif;font-size:0.72rem;color:#9A7880;cursor:pointer;transition:all 0.25s;white-space:nowrap;letter-spacing:0.3px}
.brand-chip:hover,.brand-chip.active{background:var(--gold);color:var(--ink);border-color:var(--gold)}
"""

# ── P4: Better image fallback CSS ──
fallback_css = """
/* ── BETTER IMAGE FALLBACK ── */
.prod-img-fallback{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(145deg,var(--ink2),var(--ink3));gap:6px}
.prod-img-fallback .fallback-brand{font-family:'Playfair Display',serif;font-size:0.8rem;color:var(--gold);letter-spacing:1px;opacity:0.7}
.prod-img-fallback .fallback-cat{font-size:0.55rem;font-weight:500;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.2)}
"""

# ── P3: Load More CSS ──
loadmore_css = """
/* ── LOAD MORE ── */
.load-more-wrap{text-align:center;padding:2rem 0 3rem}
.load-more-btn{background:var(--ink);color:var(--gold-light);padding:0.8rem 3rem;font-family:'Inter',sans-serif;font-size:0.68rem;font-weight:500;border:1px solid var(--gold);cursor:pointer;letter-spacing:2.5px;text-transform:uppercase;transition:all 0.3s}
.load-more-btn:hover{background:var(--gold);color:var(--ink)}
.load-more-count{font-size:0.65rem;color:var(--muted2);margin-top:0.6rem;letter-spacing:0.5px}
"""

# ── P5: USD strikethrough CSS ──
usd_css = """
/* ── USD STRIKETHROUGH ── */
.prod-usd{font-size:0.62rem;color:var(--muted2);text-decoration:line-through;margin-right:6px;font-weight:400;letter-spacing:0.2px}
"""

# ── P6: Brand filter chips CSS ──
brandchips_css = """
/* ── BRAND FILTER CHIPS ── */
.brand-chips-row{display:flex;flex-wrap:wrap;gap:0.35rem;margin-bottom:1rem;max-height:0;overflow:hidden;transition:max-height 0.4s ease}
.brand-chips-row.expanded{max-height:300px}
.brand-chip-sm{padding:3px 10px;font-size:0.6rem;font-weight:500;letter-spacing:0.5px;background:var(--bg2);border:1px solid var(--border);color:var(--muted);cursor:pointer;transition:all 0.2s;white-space:nowrap}
.brand-chip-sm:hover{border-color:var(--gold);color:var(--gold)}
.brand-chip-sm.active{background:var(--gold);border-color:var(--gold);color:var(--ink)}
.brand-chips-toggle{font-size:0.6rem;color:var(--gold);cursor:pointer;letter-spacing:1px;font-weight:500;text-transform:uppercase;margin-bottom:0.6rem;display:inline-block}
.brand-chips-toggle:hover{text-decoration:underline}
"""

# ── P2: Trending badge CSS ──
trending_css = """
/* ── TRENDING BADGE ── */
.trending-badge{position:absolute;top:8px;left:8px;background:linear-gradient(135deg,#FF6B35,#FF3D00);color:#fff;font-size:0.5rem;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;padding:3px 8px;z-index:3;box-shadow:0 2px 8px rgba(255,61,0,0.3)}
"""

# Insert all CSS before the closing </style> that comes before brand-filter-bar
# Find the right spot — after the existing prod styles
insert_point = '.brand-filter-clear{font-size:0.65rem'
css_block = brand_carousel_css + fallback_css + loadmore_css + usd_css + brandchips_css + trending_css
html = html.replace(insert_point, css_block + insert_point)

# ── P1: Brand carousel HTML — insert after preorder-strip ──
brand_carousel_html = """
<!-- BRAND CAROUSEL -->
<div class="brand-carousel-wrap" id="brandCarousel">
  <div class="brand-carousel-title">Shop by Brand</div>
  <div class="brand-carousel" id="brandCarouselInner"></div>
</div>
"""
# Insert after the preorder-strip div
html = html.replace('<div class="brand-filter-bar"', brand_carousel_html + '\n<div class="brand-filter-bar"')

# ── P6: Brand chips in sidebar — find the sidebar cats section ──
# Add brand chips toggle + container after the categories list
brand_chips_html = """<div class="brand-chips-toggle" onclick="toggleBrandChips()" id="brandChipsToggle">▸ Filter by Brand</div>
<div class="brand-chips-row" id="brandChipsRow"></div>"""

# Insert after catsRow div
html = html.replace('</div>\n      </div>\n      <!-- PRICE FILTER', brand_chips_html + '\n      </div>\n      </div>\n      <!-- PRICE FILTER')

# ── P3: Load More + P6 Brand chips JS ──
# Find the renderProducts function and modify it
# Add loadMore and brand chips JS before the closing </script> before the footer

js_enhancements = """
// ═══════════════════════════════════════════════════════════
// P1: BRAND CAROUSEL
// ═══════════════════════════════════════════════════════════
function renderBrandCarousel() {
  const all = getProducts();
  const brandCounts = {};
  all.forEach(p => { brandCounts[p.brand] = (brandCounts[p.brand]||0) + 1; });
  const sorted = Object.entries(brandCounts).sort((a,b) => b[1]-a[1]);
  const el = document.getElementById('brandCarouselInner');
  if(!el || sorted.length < 3) return;
  el.innerHTML = sorted.map(([brand, cnt]) =>
    `<div class="brand-chip${currentBrand===brand?' active':''}" onclick="filterByBrand('${brand.replace(/'/g,"\\\\'")}')">${brand} <span style="opacity:0.5;font-size:0.6rem">(${cnt})</span></div>`
  ).join('');
}

function filterByBrand(brand) {
  if(currentBrand === brand) { currentBrand = ''; }
  else { currentBrand = brand; }
  applyFilters();
  renderBrandCarousel();
  renderBrandChips();
  const bar = document.getElementById('brandFilterBar');
  if(bar) {
    bar.style.display = currentBrand ? 'block' : 'none';
    const inner = bar.querySelector('.brand-filter-inner span');
    if(inner) inner.innerHTML = 'Showing: <strong>' + currentBrand + '</strong>';
  }
}

// ═══════════════════════════════════════════════════════════
// P6: BRAND FILTER CHIPS
// ═══════════════════════════════════════════════════════════
function renderBrandChips() {
  const all = getProducts().filter(p => p.gender === currentGender);
  const brandCounts = {};
  all.forEach(p => { brandCounts[p.brand] = (brandCounts[p.brand]||0) + 1; });
  const sorted = Object.entries(brandCounts).sort((a,b) => b[1]-a[1]).slice(0, 30);
  const el = document.getElementById('brandChipsRow');
  if(!el) return;
  el.innerHTML = sorted.map(([brand]) =>
    `<div class="brand-chip-sm${currentBrand===brand?' active':''}" onclick="filterByBrand('${brand.replace(/'/g,"\\\\'")}')">${brand}</div>`
  ).join('');
}

function toggleBrandChips() {
  const row = document.getElementById('brandChipsRow');
  const toggle = document.getElementById('brandChipsToggle');
  if(!row) return;
  row.classList.toggle('expanded');
  toggle.textContent = row.classList.contains('expanded') ? '▾ Hide Brands' : '▸ Filter by Brand';
}

// ═══════════════════════════════════════════════════════════
// P3: INFINITE SCROLL / LOAD MORE
// ═══════════════════════════════════════════════════════════
let _visibleCount = 24;
let _allFilteredProducts = [];

const _origRenderProducts = renderProducts;
renderProducts = function(data) {
  _allFilteredProducts = data;
  _visibleCount = 24;
  _renderVisible();
};

function _renderVisible() {
  const visible = _allFilteredProducts.slice(0, _visibleCount);
  _origRenderProducts(visible);
  // Add load more button
  const grid = document.getElementById('productsGrid');
  if(!grid) return;
  const remaining = _allFilteredProducts.length - _visibleCount;
  if(remaining > 0) {
    const loadMoreEl = document.createElement('div');
    loadMoreEl.className = 'load-more-wrap';
    loadMoreEl.style.gridColumn = '1 / -1';
    loadMoreEl.innerHTML = `
      <button class="load-more-btn" onclick="_loadMore()">Load More</button>
      <div class="load-more-count">Showing ${_visibleCount} of ${_allFilteredProducts.length} products</div>
    `;
    grid.appendChild(loadMoreEl);
  }
}

function _loadMore() {
  _visibleCount += 24;
  _renderVisible();
  // Smooth scroll to new products
  const cards = document.querySelectorAll('.prod-card');
  if(cards.length > _visibleCount - 24) {
    cards[_visibleCount - 24]?.scrollIntoView({behavior:'smooth', block:'center'});
  }
}

// Initialize brand carousel + chips after products load
const _origApplyFilters = applyFilters;
applyFilters = function() {
  _origApplyFilters();
  renderBrandCarousel();
  renderBrandChips();
};

// Auto-init brand carousel on first load
setTimeout(() => { renderBrandCarousel(); renderBrandChips(); }, 500);
"""

# Insert before the last </script> tag
last_script_close = html.rfind('</script>')
if last_script_close > 0:
    html = html[:last_script_close] + js_enhancements + '\n' + html[last_script_close:]

# ── P4: Better image fallback in renderProducts ──
old_placeholder = '`<div class="prod-img-placeholder" style="background:linear-gradient(145deg,${bg},${bg}dd)"><span style="font-family:\'Playfair Display\',serif;font-size:1.1rem;color:var(--muted2);letter-spacing:3px;text-transform:uppercase;position:relative;z-index:1">${catLabel(p.cat,p.gender).substring(0,2).toUpperCase()}</span></div>`'
new_placeholder = '`<div class="prod-img-fallback"><span class="fallback-brand">${p.brand}</span><span class="fallback-cat">${catLabel(p.cat,p.gender)}</span></div>`'
html = html.replace(old_placeholder, new_placeholder)

# ── P5: USD strikethrough — modify prod-pkr rendering ──
old_price = ':`<div class="prod-pkr">${fmtPKR(p.pkr)}</div>`}'
new_price = ':`<div class="prod-pkr">${p.usd?`<span class="prod-usd">$${p.usd}</span>`:""} ${fmtPKR(p.pkr)}</div>`}'
html = html.replace(old_price, new_price)

# ── P2: Trending badge — add to product card template ──
# Add trending badge after the new-badge line
old_new_badge = "${p.is_new&&!isSale&&!isOutlet?`<span class=\"new-badge\">New</span>`:''}"
new_badges = "${p.is_new&&!isSale&&!isOutlet?`<span class=\"new-badge\">New</span>`:''}\n        ${p._trending?`<span class=\"trending-badge\">🔥 Trending</span>`:''}"
html = html.replace(old_new_badge, new_badges)

with open(FILE, 'w') as f:
    f.write(html)

print('✅ Product view enhancements applied:')
print('   P1: Brand carousel')
print('   P2: Trending badges')
print('   P3: Load More (24 at a time)')
print('   P4: Sleek image fallback')
print('   P5: USD strikethrough')
print('   P6: Brand filter chips')
