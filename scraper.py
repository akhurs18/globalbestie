#!/usr/bin/env python3
"""
Global Bestie — Product Scraper
================================
Scrapes Sephora and Ulta for top brand products.
Outputs import_products.json — upload it in your admin portal.

INSTALL:
  pip install requests beautifulsoup4

RUN:
  python3 scraper.py

OUTPUT:
  import_products.json  ← paste/upload this in admin → Products → Import
"""

import os, requests
from bs4 import BeautifulSoup
import json, re, sys, time, random, argparse
from datetime import datetime

# ── CLI Args ──
parser = argparse.ArgumentParser(description="Global Bestie Product Scraper")
parser.add_argument("--push", action="store_true", help="Push directly to Supabase instead of JSON file")
parser.add_argument("--limit", type=int, default=0, help="Limit total products (0 = no limit)")
parser.add_argument("--skip-scrape", action="store_true", help="Skip live scraping, use curated only")
CLI_ARGS = parser.parse_args()

# ── Supabase Config (for --push mode) ──
# Set these in a .env file or export them before running:
#   export SUPA_URL=https://xxxx.supabase.co
#   export SUPA_SERVICE_KEY=eyJ...
SUPA_URL = os.environ.get("SUPA_URL", "")
SUPA_KEY = os.environ.get("SUPA_SERVICE_KEY", "")
if CLI_ARGS.push and (not SUPA_URL or not SUPA_KEY):
    print("❌  Set SUPA_URL and SUPA_SERVICE_KEY env vars before using --push.")
    print("    cp .env.example .env  # then fill in your values")
    sys.exit(1)

# ── Config ──────────────────────────────────────────────────────────────────

USD_TO_PKR   = 278     # current rate — update before running
MARKUP_PCT   = 30      # % markup over USD converted to PKR (covers shipping + profit)
OUTPUT_FILE  = "import_products.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    "Connection": "keep-alive",
}

# ── Top 20 brands + category mapping ─────────────────────────────────────────

TOP_BRANDS = {
    # Beauty / Sephora + Ulta
    "Charlotte Tilbury":  {"cat": "makeup",   "gender": "women"},
    "NARS":               {"cat": "makeup",   "gender": "women"},
    "Too Faced":          {"cat": "makeup",   "gender": "women"},
    "Fenty Beauty":       {"cat": "makeup",   "gender": "women"},
    "Rare Beauty":        {"cat": "makeup",   "gender": "women"},
    "Benefit Cosmetics":  {"cat": "makeup",   "gender": "women"},
    "Urban Decay":        {"cat": "makeup",   "gender": "women"},
    "MAC Cosmetics":      {"cat": "makeup",   "gender": "women"},
    "Huda Beauty":        {"cat": "makeup",   "gender": "women"},
    "Pat McGrath Labs":   {"cat": "makeup",   "gender": "women"},
    # Skincare
    "Drunk Elephant":     {"cat": "skincare", "gender": "women"},
    "Tatcha":             {"cat": "skincare", "gender": "women"},
    "The Ordinary":       {"cat": "skincare", "gender": "women"},
    "CeraVe":             {"cat": "skincare", "gender": "women"},
    "La Roche-Posay":     {"cat": "skincare", "gender": "women"},
    "Kiehl's":            {"cat": "skincare", "gender": "women"},
    # Hair
    "Olaplex":            {"cat": "hair",     "gender": "women"},
    "Dyson":              {"cat": "hair",     "gender": "women"},
    "Moroccanoil":        {"cat": "hair",     "gender": "women"},
    # Luxury beauty
    "Tom Ford Beauty":    {"cat": "makeup",   "gender": "women"},
    # Fashion & Accessories
    "Tory Burch":         {"cat": "bags",     "gender": "women"},
    "Coach":              {"cat": "bags",     "gender": "women"},
    "Kate Spade":         {"cat": "bags",     "gender": "women"},
    "Michael Kors":       {"cat": "bags",     "gender": "women"},
    "Marc Jacobs":        {"cat": "bags",     "gender": "women"},
    "Nike":               {"cat": "shoes",    "gender": "women"},
    "Bath & Body Works":  {"cat": "home",     "gender": "women"},
    "Victoria's Secret":  {"cat": "fashion",  "gender": "women"},
    "Calvin Klein":       {"cat": "fragrance","gender": "women"},
    "Versace":            {"cat": "fragrance","gender": "women"},
    "Ralph Lauren":       {"cat": "fashion",  "gender": "women"},
    "Estee Lauder":       {"cat": "skincare", "gender": "women"},
    "Clinique":           {"cat": "skincare", "gender": "women"},
    "Laneige":            {"cat": "skincare", "gender": "women"},
    "Sol de Janeiro":     {"cat": "skincare", "gender": "women"},
    "Glossier":           {"cat": "makeup",   "gender": "women"},
    "e.l.f. Cosmetics":   {"cat": "makeup",   "gender": "women"},
    "NYX Professional":   {"cat": "makeup",   "gender": "women"},
    "Maybelline":         {"cat": "makeup",   "gender": "women"},
}

# ── Price helpers ─────────────────────────────────────────────────────────────

def usd_to_pkr(usd):
    raw = usd * USD_TO_PKR * (1 + MARKUP_PCT / 100)
    return int(round(raw / 100) * 100)

def parse_usd(text):
    if not text:
        return 0
    m = re.search(r"\$?([\d,]+\.?\d*)", str(text).replace(",", ""))
    return float(m.group(1)) if m else 0

# ── Product store ─────────────────────────────────────────────────────────────

seen = set()
products = []

def add(name, brand, usd, cat="makeup", gender="women",
        description="", image="", images=None, colors=None, in_stock=False, source=""):
    key = f"{brand.lower().strip()}|{name.lower().strip()}"
    if key in seen or not name or not brand or usd <= 0:
        return False
    seen.add(key)
    products.append({
        "name":        name.strip(),
        "brand":       brand.strip(),
        "usd":         round(usd, 2),
        "pkr":         usd_to_pkr(usd),
        "gender":      gender,
        "cat":         cat,
        "description": description.strip(),
        "image":       image.strip(),
        "images":      images or [],
        "colors":      colors or [],
        "inStock":     in_stock,
        "source":      source,
    })
    return True

# ── 1. Sephora scraper ────────────────────────────────────────────────────────

SEPHORA_PAGES = [
    ("https://www.sephora.com/shop/bestsellers",           "makeup",    "women"),
    ("https://www.sephora.com/shop/skincare-bestsellers",  "skincare",  "women"),
    ("https://www.sephora.com/shop/hair-bestsellers",      "hair",      "women"),
    ("https://www.sephora.com/shop/fragrance-bestsellers", "fragrance", "women"),
    ("https://www.sephora.com/shop/lip-color",             "makeup",    "women"),
    ("https://www.sephora.com/shop/face-serum",            "skincare",  "women"),
    ("https://www.sephora.com/shop/moisturizing-cream",    "skincare",  "women"),
    ("https://www.sephora.com/shop/mascara",               "makeup",    "women"),
    ("https://www.sephora.com/shop/foundation",            "makeup",    "women"),
    ("https://www.sephora.com/shop/eyeshadow-palettes",    "makeup",    "women"),
    ("https://www.sephora.com/shop/hair-mask-hair-treatment", "hair",   "women"),
]

SEPHORA_BRAND_PAGES = [
    ("https://www.sephora.com/brand/charlotte-tilbury",    "makeup",    "women"),
    ("https://www.sephora.com/brand/nars",                 "makeup",    "women"),
    ("https://www.sephora.com/brand/too-faced",            "makeup",    "women"),
    ("https://www.sephora.com/brand/fenty-beauty",         "makeup",    "women"),
    ("https://www.sephora.com/brand/rare-beauty",          "makeup",    "women"),
    ("https://www.sephora.com/brand/benefit-cosmetics",    "makeup",    "women"),
    ("https://www.sephora.com/brand/urban-decay",          "makeup",    "women"),
    ("https://www.sephora.com/brand/drunk-elephant",       "skincare",  "women"),
    ("https://www.sephora.com/brand/tatcha",               "skincare",  "women"),
    ("https://www.sephora.com/brand/olaplex",              "hair",      "women"),
    ("https://www.sephora.com/brand/pat-mcgrath-labs",     "makeup",    "women"),
]

def _parse_sephora_page(html, cat, gender):
    """Extract products from a Sephora page HTML string. Returns count added."""
    soup = BeautifulSoup(html, "html.parser")
    added = 0

    # Method 1: JSON-LD structured data
    for sc in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(sc.string or "")
            items = data if isinstance(data, list) else [data]
            for item in items:
                if item.get("@type") == "ItemList":
                    for el in item.get("itemListElement", []):
                        prod = el.get("item", el)
                        name  = prod.get("name", "")
                        brand = (prod.get("brand") or {}).get("name", "") if isinstance(prod.get("brand"), dict) else ""
                        offers = prod.get("offers", {})
                        usd   = parse_usd(offers.get("price") if isinstance(offers, dict) else "")
                        image = prod.get("image", "")
                        desc  = prod.get("description", "")
                        if add(name, brand, usd, cat, gender, description=desc, image=image, source="sephora-json"):
                            added += 1
                elif item.get("@type") == "Product":
                    name  = item.get("name", "")
                    brand = (item.get("brand") or {}).get("name", "") if isinstance(item.get("brand"), dict) else ""
                    offers = item.get("offers", {})
                    usd   = parse_usd(offers.get("price") if isinstance(offers, dict) else "")
                    image = item.get("image", "")
                    desc  = item.get("description", "")
                    if add(name, brand, usd, cat, gender, description=desc, image=image, source="sephora-json"):
                        added += 1
        except Exception:
            pass

    # Method 2: Next.js __NEXT_DATA__ or window.__PRELOADED_STATE__
    if added == 0:
        for sc in soup.find_all("script"):
            text = sc.string or ""
            if '"displayName"' in text and '"brandName"' in text and '"listPrice"' in text:
                # Find all product-like JSON blobs
                for m in re.finditer(r'\{"displayName":"([^"]+)","brandName":"([^"]+)"[^}]*"listPrice":"([^"]+)"', text):
                    name, brand, price_str = m.group(1), m.group(2), m.group(3)
                    usd = parse_usd(price_str)
                    if add(name, brand, usd, cat, gender, source="sephora-next"):
                        added += 1
                break

    # Method 3: HTML product cards (last resort)
    if added == 0:
        cards = soup.select('[data-comp*="ProductCard"], [class*="ProductCard"], [class*="product-card"]')
        for card in cards[:40]:
            name_el  = card.select_one('[class*="ProductDisplayName"], [class*="display-name"], [class*="product-name"]')
            brand_el = card.select_one('[class*="BrandName"], [class*="brand-name"], [class*="brand"]')
            price_el = card.select_one('[class*="Price"], [class*="price"]')
            img_el   = card.select_one("img[src*='sephora']") or card.select_one("img")
            if not (name_el and brand_el):
                continue
            name  = name_el.get_text(strip=True)
            brand = brand_el.get_text(strip=True)
            usd   = parse_usd(price_el.get_text() if price_el else "")
            image = img_el.get("src", "") if img_el else ""
            if add(name, brand, usd, cat, gender, image=image, source="sephora-html"):
                added += 1

    return added

def scrape_sephora():
    print("\n🛍️  Sephora — category bestsellers")
    total = 0
    all_pages = SEPHORA_PAGES + SEPHORA_BRAND_PAGES
    for url, cat, gender in all_pages:
        try:
            r = requests.get(url, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                n = _parse_sephora_page(r.text, cat, gender)
                label = url.split("/")[-1]
                print(f"   {'✓' if n else '○'}  {label:<40} +{n}")
                total += n
            else:
                print(f"   ✗  {url.split('/')[-1]:<40} HTTP {r.status_code}")
            time.sleep(random.uniform(1.5, 3.0))
        except Exception as e:
            print(f"   ✗  {url.split('/')[-1]:<40} {type(e).__name__}")
    print(f"   → Sephora total: +{total}")

# ── 2. Ulta scraper ───────────────────────────────────────────────────────────

ULTA_PAGES = [
    ("https://www.ulta.com/shop/makeup/face/foundation",        "makeup",    "women"),
    ("https://www.ulta.com/shop/makeup/lips",                   "makeup",    "women"),
    ("https://www.ulta.com/shop/makeup/eyes",                   "makeup",    "women"),
    ("https://www.ulta.com/shop/makeup/cheeks",                 "makeup",    "women"),
    ("https://www.ulta.com/shop/skincare/moisturizers",         "skincare",  "women"),
    ("https://www.ulta.com/shop/skincare/serums-treatments",    "skincare",  "women"),
    ("https://www.ulta.com/shop/skincare/eye-cream",            "skincare",  "women"),
    ("https://www.ulta.com/shop/skincare/cleansers",            "skincare",  "women"),
    ("https://www.ulta.com/shop/hair/shampoo",                  "hair",      "women"),
    ("https://www.ulta.com/shop/hair/conditioner",              "hair",      "women"),
    ("https://www.ulta.com/shop/hair/treatments",               "hair",      "women"),
    ("https://www.ulta.com/shop/hair/styling",                  "hair",      "women"),
    ("https://www.ulta.com/shop/fragrance",                     "fragrance", "women"),
    ("https://www.ulta.com/shop/bath-body",                     "home",      "women"),
    # Ulta brand pages
    ("https://www.ulta.com/brand/charlotte-tilbury",            "makeup",    "women"),
    ("https://www.ulta.com/brand/nars",                         "makeup",    "women"),
    ("https://www.ulta.com/brand/too-faced",                    "makeup",    "women"),
    ("https://www.ulta.com/brand/urban-decay",                  "makeup",    "women"),
    ("https://www.ulta.com/brand/benefit-cosmetics",            "makeup",    "women"),
    ("https://www.ulta.com/brand/olaplex",                      "hair",      "women"),
    ("https://www.ulta.com/brand/moroccanoil",                  "hair",      "women"),
    ("https://www.ulta.com/brand/kiehl-s",                      "skincare",  "women"),
    ("https://www.ulta.com/brand/la-roche-posay",               "skincare",  "women"),
    ("https://www.ulta.com/brand/cerave",                       "skincare",  "women"),
]

def _parse_ulta_page(html, cat, gender):
    soup = BeautifulSoup(html, "html.parser")
    added = 0

    # Method 1: JSON-LD
    for sc in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(sc.string or "")
            items = data if isinstance(data, list) else [data]
            for item in items:
                if item.get("@type") in ("Product", "ItemList"):
                    prods = item.get("itemListElement", [item])
                    for el in prods:
                        p = el.get("item", el)
                        name  = p.get("name", "")
                        brand = (p.get("brand") or {}).get("name", "") if isinstance(p.get("brand"), dict) else ""
                        offers = p.get("offers", {})
                        usd   = parse_usd(offers.get("price") if isinstance(offers, dict) else "")
                        image = p.get("image", "")
                        desc  = p.get("description", "")
                        if add(name, brand, usd, cat, gender, description=desc, image=image, source="ulta-json"):
                            added += 1
        except Exception:
            pass

    # Method 2: Ulta's __NEXT_DATA__ / embedded JSON
    if added == 0:
        for sc in soup.find_all("script"):
            text = sc.string or ""
            if '"brandName"' in text and '"displayName"' in text:
                for m in re.finditer(r'"displayName"\s*:\s*"([^"]+)"[^}]{0,200}"brandName"\s*:\s*"([^"]+)"[^}]{0,200}"regularPrice"\s*:\s*"([^"]+)"', text):
                    name, brand, price_str = m.group(1), m.group(2), m.group(3)
                    usd = parse_usd(price_str)
                    if add(name, brand, usd, cat, gender, source="ulta-next"):
                        added += 1
                if added > 0:
                    break

    # Method 3: HTML cards
    if added == 0:
        cards = soup.select('[class*="ProductCard"], [class*="product-card"], [data-testid*="product"]')
        for card in cards[:40]:
            name_el  = card.select_one('[class*="product-title"], [class*="ProductName"], h3, h4')
            brand_el = card.select_one('[class*="brand"], [class*="Brand"]')
            price_el = card.select_one('[class*="price"], [class*="Price"]')
            img_el   = card.select_one("img")
            if not name_el:
                continue
            name  = name_el.get_text(strip=True)
            brand = brand_el.get_text(strip=True) if brand_el else guess_brand(name)
            usd   = parse_usd(price_el.get_text() if price_el else "")
            image = img_el.get("src", "") if img_el else ""
            if add(name, brand, usd, cat, gender, image=image, source="ulta-html"):
                added += 1

    return added

def guess_brand(name):
    """Best-effort brand guess from product name for Ulta HTML fallback."""
    for brand in TOP_BRANDS:
        if brand.lower() in name.lower():
            return brand
    return ""

def scrape_ulta():
    print("\n🌸  Ulta — category + brand pages")
    total = 0
    for url, cat, gender in ULTA_PAGES:
        try:
            r = requests.get(url, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                n = _parse_ulta_page(r.text, cat, gender)
                label = url.replace("https://www.ulta.com/", "")
                print(f"   {'✓' if n else '○'}  {label:<45} +{n}")
                total += n
            else:
                label = url.replace("https://www.ulta.com/", "")
                print(f"   ✗  {label:<45} HTTP {r.status_code}")
            time.sleep(random.uniform(1.5, 2.8))
        except Exception as e:
            label = url.replace("https://www.ulta.com/", "")
            print(f"   ✗  {label:<45} {type(e).__name__}")
    print(f"   → Ulta total: +{total}")

# ── 3. Curated fallback (always-fresh, never blocked) ────────────────────────
# These load instantly with no scraping, guaranteed to have correct data.
# They supplement whatever the live scrapers find.

def load_curated():
    print("\n📋  Loading curated top-brand list…")
    n = len(products)

    # ── CHARLOTTE TILBURY ──
    add("Flawless Filter",                     "Charlotte Tilbury",  46,  "makeup",   "women", in_stock=False)
    add("Pillow Talk Matte Revolution Lipstick","Charlotte Tilbury", 34,  "makeup",   "women", in_stock=False)
    add("Airbrush Flawless Setting Spray",     "Charlotte Tilbury",  38,  "makeup",   "women")
    add("Beautiful Skin Foundation",           "Charlotte Tilbury",  50,  "makeup",   "women")
    add("Hollywood Flawless Filter",           "Charlotte Tilbury",  46,  "makeup",   "women")
    add("Satin Lip Colour",                    "Charlotte Tilbury",  34,  "makeup",   "women")
    add("Pillow Talk Lip Liner",               "Charlotte Tilbury",  26,  "makeup",   "women")
    add("Airbrush Brightening Flawless Finish","Charlotte Tilbury",  47,  "makeup",   "women")
    add("Legendary Lashes Mascara",            "Charlotte Tilbury",  31,  "makeup",   "women")
    add("Magic Cream Moisturiser",             "Charlotte Tilbury",  105, "skincare",  "women")
    add("Charlotte's Magic Serum",             "Charlotte Tilbury",  95,  "skincare",  "women")
    add("Brightening Youth Glow Eye Cream",    "Charlotte Tilbury",  65,  "skincare",  "women")

    # ── NARS ──
    add("Soft Matte Complete Foundation",      "NARS",               44,  "makeup",   "women")
    add("Radiant Creamy Concealer",            "NARS",               32,  "makeup",   "women")
    add("Afterglow Lip Balm",                  "NARS",               26,  "makeup",   "women")
    add("Blush — Orgasm",                      "NARS",               38,  "makeup",   "women")
    add("Light Reflecting Foundation",         "NARS",               52,  "makeup",   "women")
    add("Powermatte Lip Pigment",              "NARS",               28,  "makeup",   "women")
    add("Soft Matte Complete Concealer",       "NARS",               30,  "makeup",   "women")
    add("Audacious Lipstick",                  "NARS",               38,  "makeup",   "women")
    add("Afterglow Blush",                     "NARS",               38,  "makeup",   "women")

    # ── TOO FACED ──
    add("Better Than Sex Mascara",             "Too Faced",          27,  "makeup",   "women")
    add("Born This Way Foundation",            "Too Faced",          44,  "makeup",   "women")
    add("Born This Way Super Coverage Concealer","Too Faced",        30,  "makeup",   "women")
    add("Lip Injection Extreme",               "Too Faced",          26,  "makeup",   "women")
    add("Tutti Frutti Eye Shadow Palette",     "Too Faced",          49,  "makeup",   "women")
    add("Better Than Sex Eyeliner",            "Too Faced",          24,  "makeup",   "women")

    # ── FENTY BEAUTY ──
    add("Pro Filt'r Soft Matte Foundation",    "Fenty Beauty",       40,  "makeup",   "women")
    add("Soft Pinch Tinted Lip Oil",           "Fenty Beauty",       22,  "makeup",   "women")
    add("Cheeks Out Freestyle Cream Blush",    "Fenty Beauty",       22,  "makeup",   "women")
    add("Pro Filt'r Instant Retouch Primer",   "Fenty Beauty",       34,  "makeup",   "women")
    add("Hydrating Long-Wear Foundation",      "Fenty Beauty",       40,  "makeup",   "women")
    add("Gloss Bomb Universal Lip Luminizer",  "Fenty Beauty",       20,  "makeup",   "women")

    # ── RARE BEAUTY ──
    add("Soft Pinch Liquid Blush",             "Rare Beauty",        23,  "makeup",   "women")
    add("Positive Light Tinted Moisturizer",   "Rare Beauty",        29,  "makeup",   "women")
    add("Perfect Strokes Matte Liquid Liner",  "Rare Beauty",        19,  "makeup",   "women")
    add("Tinted Lip Oil",                      "Rare Beauty",        20,  "makeup",   "women")
    add("Stay Vulnerable Melting Blush",       "Rare Beauty",        20,  "makeup",   "women")
    add("With Gratitude Dewy Lip Balm",        "Rare Beauty",        18,  "makeup",   "women")

    # ── BENEFIT COSMETICS ──
    add("Gimme Brow+ Volumizing Fiber Gel",    "Benefit Cosmetics",  25,  "makeup",   "women")
    add("24-HR Brow Setter Clear Brow Gel",    "Benefit Cosmetics",  25,  "makeup",   "women")
    add("Precisely My Brow Pencil",            "Benefit Cosmetics",  25,  "makeup",   "women")
    add("Hoola Matte Bronzer",                 "Benefit Cosmetics",  33,  "makeup",   "women")
    add("Roller Lash Curling Mascara",         "Benefit Cosmetics",  27,  "makeup",   "women")
    add("Dandelion Blush",                     "Benefit Cosmetics",  33,  "makeup",   "women")
    add("Brow Lamination Kit",                 "Benefit Cosmetics",  36,  "makeup",   "women")

    # ── URBAN DECAY ──
    add("All Nighter Long-Lasting Setting Spray","Urban Decay",      35,  "makeup",   "women")
    add("Eyeshadow Primer Potion",             "Urban Decay",        24,  "makeup",   "women")
    add("24/7 Glide-On Eye Pencil",            "Urban Decay",        23,  "makeup",   "women")
    add("Naked3 Eyeshadow Palette",            "Urban Decay",        54,  "makeup",   "women")
    add("Vice Lipstick",                       "Urban Decay",        19,  "makeup",   "women")
    add("Perversion Mascara",                  "Urban Decay",        26,  "makeup",   "women")

    # ── MAC COSMETICS ──
    add("Studio Fix Fluid SPF 15 Foundation",  "MAC Cosmetics",      38,  "makeup",   "women")
    add("Matte Lipstick — Ruby Woo",           "MAC Cosmetics",      21,  "makeup",   "women")
    add("Prep + Prime Fix+",                   "MAC Cosmetics",      30,  "makeup",   "women")
    add("Strobe Cream",                        "MAC Cosmetics",      34,  "makeup",   "women")
    add("Extended Play Gigablack Mascara",     "MAC Cosmetics",      22,  "makeup",   "women")
    add("Studio Sculpt Defining Foundation",   "MAC Cosmetics",      38,  "makeup",   "women")

    # ── HUDA BEAUTY ──
    add("Easy Bake and Snatch Pressed Powder", "Huda Beauty",        38,  "makeup",   "women")
    add("#FauxFilter Luminous Matte Foundation","Huda Beauty",       44,  "makeup",   "women")
    add("Tantour Contour & Blush Cream",       "Huda Beauty",        26,  "makeup",   "women")
    add("GloWish Multidew Skin Tint",          "Huda Beauty",        29,  "makeup",   "women")
    add("Legit Lashes Waterproof Mascara",     "Huda Beauty",        26,  "makeup",   "women")
    add("Empowered Eyeshadow Palette",         "Huda Beauty",        65,  "makeup",   "women")

    # ── PAT McGRATH LABS ──
    add("Sublime Perfection Foundation",       "Pat McGrath Labs",   68,  "makeup",   "women")
    add("MatteTrance Lipstick",                "Pat McGrath Labs",   38,  "makeup",   "women")
    add("Mothership Eyeshadow Palette",        "Pat McGrath Labs",   125, "makeup",   "women")
    add("SKINFETISH 003 Highlighter",          "Pat McGrath Labs",   38,  "makeup",   "women")

    # ── DRUNK ELEPHANT ──
    add("Lala Retro Whipped Moisturizer",      "Drunk Elephant",     62,  "skincare", "women")
    add("T.L.C. Framboos Glycolic Night Serum","Drunk Elephant",     90,  "skincare", "women")
    add("C-Firma Fresh Day Serum",             "Drunk Elephant",     88,  "skincare", "women")
    add("Protini Polypeptide Moisturizer",     "Drunk Elephant",     68,  "skincare", "women")
    add("A-Passioni Retinol Cream",            "Drunk Elephant",     74,  "skincare", "women")
    add("B-Hydra Intensive Hydration Serum",   "Drunk Elephant",     52,  "skincare", "women")
    add("Beste No.9 Jelly Cleanser",           "Drunk Elephant",     34,  "skincare", "women")
    add("F-Balm Electrolyte Waterfacial Mask", "Drunk Elephant",     52,  "skincare", "women")

    # ── TATCHA ──
    add("The Water Cream",                     "Tatcha",             72,  "skincare", "women")
    add("The Dewy Skin Cream",                 "Tatcha",             72,  "skincare", "women")
    add("The Rice Wash",                       "Tatcha",             38,  "skincare", "women")
    add("The Essence",                         "Tatcha",             95,  "skincare", "women")
    add("The Silk Canvas Protective Primer",   "Tatcha",             54,  "skincare", "women")
    add("The Serum Stick",                     "Tatcha",             62,  "skincare", "women")

    # ── THE ORDINARY ──
    add("Niacinamide 10% + Zinc 1%",           "The Ordinary",        7,  "skincare", "women", in_stock=True)
    add("AHA 30% + BHA 2% Peeling Solution",   "The Ordinary",       14,  "skincare", "women", in_stock=True)
    add("Hyaluronic Acid 2% + B5",             "The Ordinary",        8,  "skincare", "women", in_stock=True)
    add("Retinol 0.5% in Squalane",            "The Ordinary",       10,  "skincare", "women", in_stock=True)
    add("Vitamin C Suspension 23% + HA 2%",    "The Ordinary",       12,  "skincare", "women", in_stock=True)
    add("Multi-Peptide + HA Serum",            "The Ordinary",       12,  "skincare", "women", in_stock=True)
    add("Buffet Multi-Technology Peptide Serum","The Ordinary",      15,  "skincare", "women", in_stock=True)
    add("Salicylic Acid 2% Solution",          "The Ordinary",        6,  "skincare", "women", in_stock=True)

    # ── CERAVE ──
    add("Moisturizing Cream",                  "CeraVe",             19,  "skincare", "women", in_stock=True)
    add("Hydrating Facial Cleanser",           "CeraVe",             15,  "skincare", "women", in_stock=True)
    add("AM Facial Moisturizing Lotion SPF 30","CeraVe",             19,  "skincare", "women", in_stock=True)
    add("Renewing SA Cleanser",                "CeraVe",             15,  "skincare", "women", in_stock=True)
    add("Hydrating Micellar Water",            "CeraVe",             15,  "skincare", "women", in_stock=True)
    add("Eye Repair Cream",                    "CeraVe",             17,  "skincare", "women", in_stock=True)

    # ── LA ROCHE-POSAY ──
    add("Anthelios Melt-In Milk SPF 60",       "La Roche-Posay",     38,  "skincare", "women", in_stock=True)
    add("Effaclar Duo Acne Treatment",         "La Roche-Posay",     38,  "skincare", "women", in_stock=True)
    add("Toleriane Double Repair Moisturizer", "La Roche-Posay",     26,  "skincare", "women", in_stock=True)
    add("Toleriane Hydrating Gentle Cleanser", "La Roche-Posay",     15,  "skincare", "women", in_stock=True)
    add("Cicaplast Baume B5",                  "La Roche-Posay",     20,  "skincare", "women", in_stock=True)

    # ── KIEHL'S ──
    add("Ultra Facial Cream SPF 30",           "Kiehl's",            40,  "skincare", "women")
    add("Creamy Eye Treatment with Avocado",   "Kiehl's",            55,  "skincare", "women")
    add("Midnight Recovery Concentrate",       "Kiehl's",            52,  "skincare", "women")
    add("Powerful-Strength Line-Reducing Serum","Kiehl's",           88,  "skincare", "women")
    add("Rare Earth Deep Pore Cleansing Masque","Kiehl's",           34,  "skincare", "women")
    add("Facial Fuel Energizing Face Wash",    "Kiehl's",            30,  "grooming", "men",   in_stock=True)
    add("Facial Fuel Moisturizer SPF 20",      "Kiehl's",            30,  "grooming", "men",   in_stock=True)

    # ── OLAPLEX ──
    add("No.3 Hair Perfector",                 "Olaplex",            30,  "hair",     "women", in_stock=True)
    add("No.4 Bond Maintenance Shampoo",       "Olaplex",            30,  "hair",     "women", in_stock=True)
    add("No.5 Bond Maintenance Conditioner",   "Olaplex",            30,  "hair",     "women", in_stock=True)
    add("No.6 Bond Smoother",                  "Olaplex",            30,  "hair",     "women")
    add("No.7 Bonding Oil",                    "Olaplex",            30,  "hair",     "women")
    add("No.0 Intensive Bond Building Treatment","Olaplex",          30,  "hair",     "women")
    add("No.8 Bond Intense Moisture Mask",     "Olaplex",            30,  "hair",     "women")
    add("No.4P Blonde Enhancer Toning Shampoo","Olaplex",            30,  "hair",     "women")

    # ── DYSON ──
    add("Supersonic Hair Dryer",               "Dyson",              430, "hair",     "women")
    add("Airwrap Multi-Styler Complete",       "Dyson",              599, "hair",     "women")
    add("Corrale Straightener",                "Dyson",              499, "hair",     "women")
    add("Airstrait Straightener",              "Dyson",              499, "hair",     "women")

    # ── MOROCCANOIL ──
    add("Treatment Original",                  "Moroccanoil",        46,  "hair",     "women", in_stock=True)
    add("Moisture Repair Shampoo",             "Moroccanoil",        26,  "hair",     "women")
    add("Hydrating Argan Oil Hair Mask",       "Moroccanoil",        32,  "hair",     "women")
    add("Curl Defining Cream",                 "Moroccanoil",        34,  "hair",     "women")
    add("All In One Leave-In Conditioner",     "Moroccanoil",        30,  "hair",     "women")

    # ── TOM FORD BEAUTY ──
    add("Black Orchid Eau de Parfum",          "Tom Ford Beauty",    220, "fragrance","women")
    add("Rose Prick Eau de Parfum",            "Tom Ford Beauty",    290, "fragrance","women")
    add("Lost Cherry Eau de Parfum",           "Tom Ford Beauty",    310, "fragrance","women")
    add("Lip Color Satin — Scarlet Rouge",     "Tom Ford Beauty",    58,  "makeup",   "women")
    add("Soleil Brûlant Eye + Cheek Palette",  "Tom Ford Beauty",    88,  "makeup",   "women")


    # ── TORY BURCH ──
    add("Kira Chevron Small Convertible Bag",   "Tory Burch",       498, "bags",     "women")
    add("Lee Radziwill Small Bag",              "Tory Burch",       598, "bags",     "women")
    add("Perry Tote Bag",                       "Tory Burch",       348, "bags",     "women")
    add("Ella Canvas Tote",                     "Tory Burch",       228, "bags",     "women")
    add("Miller Cloud Sandal",                  "Tory Burch",       228, "shoes",    "women")
    add("Eleanor Small Convertible Bag",        "Tory Burch",       598, "bags",     "women")
    add("Good Luck Trainer Sneaker",            "Tory Burch",       298, "shoes",    "women")
    add("Robinson Small Top-Handle Bag",        "Tory Burch",       398, "bags",     "women")
    add("Kira Chevron Wallet",                  "Tory Burch",       228, "accessories","women")
    add("Fleming Soft Chain Wallet",            "Tory Burch",       328, "bags",     "women")

    # ── COACH ──
    add("Tabby Shoulder Bag 26",                "Coach",            395, "bags",     "women")
    add("Willow Tote In Signature Canvas",      "Coach",            395, "bags",     "women")
    add("Pillow Tabby Shoulder Bag 18",         "Coach",            295, "bags",     "women")
    add("Court Backpack In Signature Canvas",   "Coach",            350, "bags",     "women")
    add("Mini Skinny ID Case",                  "Coach",             58, "accessories","women")
    add("Nolita 19 In Signature Canvas",        "Coach",            128, "bags",     "women")
    add("Outlet City Tote",                     "Coach",            298, "bags",     "women")
    add("Swagger Shoulder Bag",                 "Coach",            395, "bags",     "women")
    add("Georgie Shoulder Bag",                 "Coach",            350, "bags",     "women")
    add("Long Zip Around Wallet",               "Coach",            228, "accessories","women")

    # ── KATE SPADE ──
    add("Knott Medium Satchel",                 "Kate Spade",       398, "bags",     "women")
    add("All Day Large Tote",                   "Kate Spade",       248, "bags",     "women")
    add("Spencer Slim Bifold Wallet",           "Kate Spade",       138, "accessories","women")
    add("Leila Medium Triple Compartment",      "Kate Spade",       399, "bags",     "women")
    add("Dakota Medium Convertible Bag",        "Kate Spade",       478, "bags",     "women")
    add("Purl Studded Tote",                    "Kate Spade",       498, "bags",     "women")

    # ── MICHAEL KORS ──
    add("Jet Set Medium Crossbody",             "Michael Kors",     198, "bags",     "women")
    add("Marilyn Medium Satchel",               "Michael Kors",     398, "bags",     "women")
    add("Cora Large Tote",                      "Michael Kors",     358, "bags",     "women")
    add("Parker Medium Messenger Bag",          "Michael Kors",     298, "bags",     "women")
    add("Bradshaw Large Tote",                  "Michael Kors",     398, "bags",     "women")
    add("Rhea Medium Backpack",                 "Michael Kors",     358, "bags",     "women")

    # ── MARC JACOBS ──
    add("The Tote Bag — Small",                 "Marc Jacobs",      295, "bags",     "women")
    add("The Tote Bag — Mini",                  "Marc Jacobs",      250, "bags",     "women")
    add("The Snapshot",                         "Marc Jacobs",      295, "bags",     "women")
    add("The Leather Medium Tote",              "Marc Jacobs",      395, "bags",     "women")
    add("The J Marc Shoulder Bag",              "Marc Jacobs",      375, "bags",     "women")

    # ── NIKE ──
    add("Air Force 1 '07",                      "Nike",              115, "shoes",    "women")
    add("Dunk Low Retro",                       "Nike",              115, "shoes",    "women")
    add("Air Max 90",                           "Nike",              130, "shoes",    "women")
    add("Air Jordan 1 Mid",                     "Nike",              125, "shoes",    "women")
    add("Blazer Mid '77 Vintage",               "Nike",              105, "shoes",    "women")
    add("Air Max 97",                           "Nike",              175, "shoes",    "women")
    add("V2K Run",                              "Nike",              110, "shoes",    "women")

    # ── BATH & BODY WORKS ──
    add("Japanese Cherry Blossom Body Cream",   "Bath & Body Works",  16, "home",    "women", in_stock=True)
    add("A Thousand Wishes Fine Fragrance Mist","Bath & Body Works",  17, "home",    "women", in_stock=True)
    add("Champagne Toast 3-Wick Candle",        "Bath & Body Works",  27, "home",    "women", in_stock=True)
    add("Eucalyptus Spearmint Body Lotion",     "Bath & Body Works",  16, "home",    "women", in_stock=True)
    add("Into the Night Shower Gel",            "Bath & Body Works",  14, "home",    "women", in_stock=True)
    add("Gingham Gorgeous Fine Fragrance Mist", "Bath & Body Works",  17, "home",    "women", in_stock=True)
    add("Warm Vanilla Sugar Body Cream",        "Bath & Body Works",  16, "home",    "women", in_stock=True)
    add("Mahogany Teakwood 3-Wick Candle",      "Bath & Body Works",  27, "home",    "women", in_stock=True)

    # ── VICTORIA'S SECRET ──
    add("Bombshell Eau de Parfum",              "Victoria's Secret",  75, "fragrance","women")
    add("Velvet Petals Body Mist",              "Victoria's Secret",  20, "fragrance","women")
    add("Tease Eau de Parfum",                  "Victoria's Secret",  75, "fragrance","women")
    add("Pure Seduction Body Lotion",           "Victoria's Secret",  18, "home",    "women")
    add("Love Spell Body Mist",                 "Victoria's Secret",  20, "fragrance","women")

    # ── CALVIN KLEIN ──
    add("Eternity Eau de Parfum",               "Calvin Klein",       92, "fragrance","women")
    add("CK One Eau de Toilette",               "Calvin Klein",       50, "fragrance","women")
    add("Euphoria Eau de Parfum",               "Calvin Klein",       94, "fragrance","women")
    add("Obsessed Eau de Parfum",               "Calvin Klein",       82, "fragrance","women")

    # ── VERSACE ──
    add("Bright Crystal Eau de Toilette",       "Versace",            95, "fragrance","women")
    add("Yellow Diamond Eau de Toilette",       "Versace",            80, "fragrance","women")
    add("Crystal Noir Eau de Parfum",           "Versace",           105, "fragrance","women")
    add("Dylan Blue Pour Femme",                "Versace",            98, "fragrance","women")
    add("Eros Pour Femme Eau de Parfum",        "Versace",           108, "fragrance","women")
    add("Pour Homme Eau de Toilette",           "Versace",            75, "fragrance","men")

    # ── RALPH LAUREN ──
    add("Romance Eau de Parfum",                "Ralph Lauren",       98, "fragrance","women")
    add("Polo Blue Eau de Toilette",            "Ralph Lauren",       85, "fragrance","men")
    add("Ralph's Club Eau de Parfum",           "Ralph Lauren",      100, "fragrance","men")

    # ── ESTEE LAUDER ──
    add("Advanced Night Repair Serum",          "Estee Lauder",       75, "skincare", "women")
    add("Double Wear Foundation",               "Estee Lauder",       46, "makeup",   "women")
    add("Revitalizing Supreme+ Moisturizer",    "Estee Lauder",       72, "skincare", "women")
    add("Resilience Multi-Effect Night Cream",  "Estee Lauder",       65, "skincare", "women")
    add("Pure Color Envy Lipstick",             "Estee Lauder",       38, "makeup",   "women")

    # ── CLINIQUE ──
    add("Moisture Surge 100H Auto-Replenishing","Clinique",           42, "skincare", "women", in_stock=True)
    add("Dramatically Different Moisturizing Gel","Clinique",         32, "skincare", "women", in_stock=True)
    add("Even Better Clinical Serum Foundation","Clinique",           36, "makeup",   "women")
    add("Take The Day Off Cleansing Balm",      "Clinique",           36, "skincare", "women", in_stock=True)
    add("Almost Lipstick — Black Honey",        "Clinique",           24, "makeup",   "women")
    add("High Impact Mascara",                  "Clinique",           24, "makeup",   "women")

    # ── LANEIGE ──
    add("Lip Sleeping Mask — Berry",            "Laneige",            24, "skincare", "women", in_stock=True)
    add("Water Sleeping Mask",                  "Laneige",            32, "skincare", "women", in_stock=True)
    add("Lip Glowy Balm",                       "Laneige",            18, "makeup",   "women", in_stock=True)
    add("Water Bank Blue Hyaluronic Cream",     "Laneige",            42, "skincare", "women")
    add("Bouncy & Firm Sleeping Mask",          "Laneige",            38, "skincare", "women")

    # ── SOL DE JANEIRO ──
    add("Brazilian Bum Bum Cream",              "Sol de Janeiro",     48, "skincare", "women")
    add("Cheirosa 62 Body Mist",               "Sol de Janeiro",     35, "fragrance","women")
    add("Bom Dia Bright Body Cream",            "Sol de Janeiro",     48, "skincare", "women")
    add("Brazilian Kiss Lip Butter",            "Sol de Janeiro",     22, "makeup",   "women")
    add("Cheirosa 68 Body Mist",               "Sol de Janeiro",     35, "fragrance","women")

    # ── GLOSSIER ──
    add("Boy Brow",                             "Glossier",           18, "makeup",   "women")
    add("Cloud Paint",                          "Glossier",           20, "makeup",   "women")
    add("Balm Dotcom",                          "Glossier",           14, "makeup",   "women")
    add("Lash Slick Mascara",                   "Glossier",           18, "makeup",   "women")
    add("Milky Jelly Cleanser",                 "Glossier",           26, "skincare", "women")
    add("Stretch Concealer",                    "Glossier",           22, "makeup",   "women")
    add("Futuredew Oil Serum Hybrid",           "Glossier",           28, "skincare", "women")

    # ── E.L.F. COSMETICS ──
    add("Poreless Putty Primer",                "e.l.f. Cosmetics",   10, "makeup",   "women", in_stock=True)
    add("Power Grip Primer",                    "e.l.f. Cosmetics",   10, "makeup",   "women", in_stock=True)
    add("Halo Glow Liquid Filter",              "e.l.f. Cosmetics",   14, "makeup",   "women", in_stock=True)
    add("Camo Concealer",                       "e.l.f. Cosmetics",    7, "makeup",   "women", in_stock=True)
    add("Lip Lacquer",                          "e.l.f. Cosmetics",    7, "makeup",   "women", in_stock=True)
    add("Monochromatic Multi Stick",            "e.l.f. Cosmetics",    5, "makeup",   "women", in_stock=True)

    # ── NYX PROFESSIONAL ──
    add("Butter Gloss",                         "NYX Professional",    6, "makeup",   "women", in_stock=True)
    add("Epic Ink Liner",                       "NYX Professional",   10, "makeup",   "women", in_stock=True)
    add("Lip Lingerie XXL",                     "NYX Professional",   10, "makeup",   "women", in_stock=True)
    add("HD Finishing Powder",                   "NYX Professional",  12, "makeup",   "women", in_stock=True)
    add("Sweet Cheeks Soft Cheek Tint",         "NYX Professional",   10, "makeup",   "women", in_stock=True)

    # ── MAYBELLINE ──
    add("Lash Sensational Sky High Mascara",    "Maybelline",         13, "makeup",   "women", in_stock=True)
    add("Superstay Matte Ink Liquid Lipstick",  "Maybelline",         11, "makeup",   "women", in_stock=True)
    add("Instant Age Rewind Concealer",         "Maybelline",         12, "makeup",   "women", in_stock=True)
    add("Fit Me Matte Foundation",              "Maybelline",         10, "makeup",   "women", in_stock=True)
    add("Lifter Gloss",                         "Maybelline",         10, "makeup",   "women", in_stock=True)

    # ── MEN'S GROOMING ──
    add("Eros Eau de Toilette",                 "Versace",            75, "fragrance","men")
    add("Sauvage Eau de Parfum",                "Dior",              130, "fragrance","men")
    add("Bleu de Chanel Eau de Parfum",         "Chanel",            130, "fragrance","men")
    add("Acqua di Gio Eau de Parfum",           "Giorgio Armani",    105, "fragrance","men")
    add("Y Eau de Parfum",                      "Yves Saint Laurent",110, "fragrance","men")
    add("Explorer Eau de Parfum",               "Montblanc",          70, "fragrance","men")
    add("CK One Shock For Him",                 "Calvin Klein",       42, "fragrance","men")
    add("1 Million Eau de Toilette",            "Paco Rabanne",       85, "fragrance","men")

    added = len(products) - n
    print(f"   ✓  Curated: +{added} products ({len(products)} total)")

# ── 4. Image enrichment ───────────────────────────────────────────────────────

# Trusted CDN domains — only accept images from these hosts
TRUSTED_IMAGE_HOSTS = [
    "sephora.com", "ulta.com", "nordstrom.com",
    "charlottetilbury.com", "narscosmetics.com", "toofaced.com",
    "fentybeauty.com", "rarebeauty.com", "benefitcosmetics.com",
    "urbandecay.com", "maccosmetics.com", "hudabeauty.com",
    "patmcgrath.com", "drunkelephant.com", "tatcha.com",
    "theordinary.com", "cerave.com", "laroche-posay.com",
    "kiehls.com", "olaplex.com", "dyson.com", "moroccanoil.com",
    "tomford.com", "toryburch.com", "coach.com", "katespade.com",
    "michaelkors.com", "marcjacobs.com", "nike.com",
    "bathandbodyworks.com", "victoriassecret.com",
]

def _fix_url(u):
    if not u or not isinstance(u, str):
        return ""
    u = u.strip()
    return u if u.startswith("http") else "https://www.sephora.com" + u

def _validate_image(url, timeout=5):
    """Return True if url is a reachable image from a trusted host."""
    if not url or not url.startswith("http"):
        return False
    try:
        from urllib.parse import urlparse
        host = urlparse(url).netloc.lower().lstrip("www.")
        if not any(t in host for t in TRUSTED_IMAGE_HOSTS):
            return False
        r = requests.head(url, headers=HEADERS, timeout=timeout, allow_redirects=True)
        ct = r.headers.get("Content-Type", "")
        return r.status_code == 200 and "image/" in ct
    except Exception:
        return False

def _sephora_search_data(name, brand):
    """Call Sephora search API and return the first matching product dict."""
    try:
        q = requests.utils.quote(f"{brand} {name}")
        url = (f"https://www.sephora.com/api/catalog/search"
               f"?q={q}&currentPage=0&pageSize=3&includeContent=false")
        r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code != 200:
            return None
        data = r.json()
        prods = (data.get("products") or
                 data.get("data", {}).get("products") or
                 data.get("result", {}).get("products") or [])
        return prods[0] if prods else None
    except Exception:
        return None

def _sephora_image(name, brand):
    """Extract verified product image from Sephora search result."""
    p = _sephora_search_data(name, brand)
    if not p:
        return ""

    candidates = []

    # Top-level image fields
    for field in ("heroImage", "imageUrl", "image", "gridImage",
                  "squareImage", "heroImageAltText"):
        u = _fix_url(p.get(field, ""))
        if u:
            candidates.append(u)

    # Dig into sku structures for higher-res images
    for sku_key in ("currentSku", "regularChildSkus", "skus"):
        skus = p.get(sku_key) or []
        if isinstance(skus, dict):
            skus = [skus]
        for sku in (skus if isinstance(skus, list) else [])[:3]:
            imgs = sku.get("skuImages") or {}
            if isinstance(imgs, dict):
                for k in ("imageUrl", "image", "imageAltText", "zoom"):
                    u = _fix_url(imgs.get(k, ""))
                    if u:
                        candidates.append(u)
            u = _fix_url(sku.get("imageUrl", "") or sku.get("image", ""))
            if u:
                candidates.append(u)

    # Validate each candidate and return first that passes
    for img in candidates:
        if _validate_image(img):
            return img
    return ""

def _sephora_product_page_image(name, brand):
    """
    Fetch the Sephora product page (URL from search result) and extract
    og:image. More reliable than search API for primary product shot.
    """
    try:
        p = _sephora_search_data(name, brand)
        if not p:
            return ""
        target = p.get("targetUrl") or p.get("productUrl") or p.get("url") or ""
        if not target:
            return ""
        if not target.startswith("http"):
            target = "https://www.sephora.com" + target

        r = requests.get(target, headers=HEADERS, timeout=12)
        if r.status_code != 200:
            return ""

        soup = BeautifulSoup(r.text, "html.parser")

        # og:image is the canonical product photo
        og = soup.find("meta", property="og:image")
        if og:
            img = _fix_url(og.get("content", ""))
            if img and _validate_image(img):
                return img

        # __NEXT_DATA__ fallback — search for first imageUrl in page JSON
        for sc in soup.find_all("script", id="__NEXT_DATA__"):
            try:
                nd = json.loads(sc.string or "")
                nd_str = json.dumps(nd)
                for m in re.finditer(r'"(?:imageUrl|heroImage)"\s*:\s*"([^"]+)"', nd_str):
                    img = _fix_url(m.group(1))
                    if img and _validate_image(img):
                        return img
            except Exception:
                pass
    except Exception:
        pass
    return ""

def _sephora_variants(name, brand):
    """
    Fetch additional images and color variants for a product from Sephora's search API.
    Returns (extra_images: list[str], colors: list[dict])
    Each color dict: {"name": str, "hex": str, "image": str}
    """
    p = _sephora_search_data(name, brand)
    if not p:
        return [], []
    try:
        # Extra images (alt angles / swatch)
        extra_imgs = []
        for field in ["squareImage", "altImages", "swatch", "imageUrl"]:
            v = p.get(field, "")
            if isinstance(v, str):
                u = _fix_url(v)
                if u and u not in extra_imgs:
                    extra_imgs.append(u)
            elif isinstance(v, list):
                for item in v[:4]:
                    u = _fix_url(item) if isinstance(item, str) else _fix_url(item.get("imageUrl", ""))
                    if u and u not in extra_imgs:
                        extra_imgs.append(u)

        # Color variants from skus array
        colors = []
        skus = p.get("skus") or p.get("regularChildSkus") or p.get("currentSku") or []
        if isinstance(skus, dict):
            skus = [skus]
        for sku in (skus or [])[:15]:
            cname = (sku.get("skuExtension") or sku.get("variationType") or
                     sku.get("skuShade") or sku.get("displayName") or "").strip()
            hex_c = sku.get("hexCode") or sku.get("skuSwatchColorCode") or ""
            sku_imgs = sku.get("skuImages") or sku.get("images") or {}
            sku_img = ""
            if isinstance(sku_imgs, dict):
                sku_img = _fix_url(sku_imgs.get("imageUrl") or sku_imgs.get("image") or "")
            elif isinstance(sku_imgs, str):
                sku_img = _fix_url(sku_imgs)
            if cname:
                colors.append({"name": cname, "hex": hex_c, "image": sku_img})

        # Only keep validated extra images (skip non-image/broken URLs)
        valid_extras = [u for u in extra_imgs if _validate_image(u)]
        return valid_extras[:4], colors[:12]
    except Exception:
        return [], []

def enrich_images():
    """
    Fill in / validate images and color variants for all products.

    Strategy per product:
      1. If image already set — validate it (HEAD request). Clear if broken.
      2. Try Sephora search API (parses all nested sku/image fields, validates URL).
      3. Try Sephora product page og:image (fetches product page, extracts meta).
      4. No DDG fallback — blank image is better than a wrong product photo.
    """
    # First pass: invalidate existing broken/untrusted images
    invalidated = 0
    for p in products:
        if p.get("image") and not _validate_image(p["image"]):
            p["image"] = ""
            invalidated += 1

    to_enrich = [p for p in products if not p.get("image") or not p.get("colors")]
    if not to_enrich and not invalidated:
        return
    if invalidated:
        print(f"\n   ⚠  Cleared {invalidated} broken/untrusted image URLs")
    print(f"\n   Enriching {len(to_enrich)} products (images + variants)…")

    imgs_ok = 0
    variants_ok = 0
    for p in to_enrich:
        # Variants + extra images (reuses cached search result)
        extra_imgs, colors = _sephora_variants(p["name"], p["brand"])

        # Primary image — two-stage with validation
        if not p.get("image"):
            img = _sephora_image(p["name"], p["brand"])
            src = "sephora-api"
            if not img:
                img = _sephora_product_page_image(p["name"], p["brand"])
                src = "sephora-page"
            if img:
                p["image"] = img
                imgs_ok += 1
                print(f"   +  [{src}] {p['brand']} — {p['name'][:45]}")
            else:
                print(f"   -  (no image)  {p['brand']} — {p['name'][:45]}")
        else:
            imgs_ok += 1

        if extra_imgs and not p.get("images"):
            p["images"] = extra_imgs
        if colors and not p.get("colors"):
            p["colors"] = colors
            variants_ok += 1

        time.sleep(random.uniform(0.8, 1.6))

    color_total = sum(1 for p in products if p.get("colors"))
    print(f"   -> Images: {imgs_ok}/{len(to_enrich)}  |  Products with variants: {color_total}")

# ── Nordstrom scraper ─────────────────────────────────────────────────────────

NORDSTROM_PAGES = [
    ("https://www.nordstrom.com/browse/women/handbags?sort=Boosted", "bags", "women"),
    ("https://www.nordstrom.com/browse/beauty/skin-care?sort=Boosted", "skincare", "women"),
    ("https://www.nordstrom.com/browse/beauty/makeup?sort=Boosted", "makeup", "women"),
    ("https://www.nordstrom.com/browse/beauty/fragrance?sort=Boosted", "fragrance", "women"),
    ("https://www.nordstrom.com/browse/women/shoes?sort=Boosted", "shoes", "women"),
]

def _parse_nordstrom_page(html, cat, gender):
    soup = BeautifulSoup(html, "html.parser")
    added = 0
    for sc in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(sc.string or "")
            items = data if isinstance(data, list) else [data]
            for item in items:
                if item.get("@type") == "ItemList":
                    for el in item.get("itemListElement", []):
                        prod = el.get("item", el)
                        name = prod.get("name", "")
                        brand = (prod.get("brand") or {}).get("name", "") if isinstance(prod.get("brand"), dict) else ""
                        offers = prod.get("offers", {})
                        usd = parse_usd(offers.get("price") if isinstance(offers, dict) else "")
                        image = prod.get("image", "")
                        if isinstance(image, list): image = image[0] if image else ""
                        desc = prod.get("description", "")
                        if add(name, brand, usd, cat, gender, description=desc, image=image, source="nordstrom"):
                            added += 1
                elif item.get("@type") == "Product":
                    name = item.get("name", "")
                    brand = (item.get("brand") or {}).get("name", "") if isinstance(item.get("brand"), dict) else ""
                    offers = item.get("offers", {})
                    usd = parse_usd(offers.get("price") if isinstance(offers, dict) else "")
                    image = item.get("image", "")
                    if isinstance(image, list): image = image[0] if image else ""
                    if add(name, brand, usd, cat, gender, image=image, source="nordstrom"):
                        added += 1
        except Exception:
            pass
    return added

def scrape_nordstrom():
    print("\n🏬  Nordstrom — trending categories")
    total = 0
    for url, cat, gender in NORDSTROM_PAGES:
        try:
            r = requests.get(url, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                n = _parse_nordstrom_page(r.text, cat, gender)
                label = url.split("/")[-1].split("?")[0]
                print(f"   {'✓' if n else '○'}  {label:<40} +{n}")
                total += n
            else:
                print(f"   ✗  {url.split('/')[-1]:<40} HTTP {r.status_code}")
            time.sleep(random.uniform(2.0, 3.5))
        except Exception as e:
            print(f"   ✗  {url.split('/')[-1]:<40} {type(e).__name__}")
    print(f"   → Nordstrom total: +{total}")

# ── Supabase bulk push ────────────────────────────────────────────────────────

def push_to_supabase():
    """Bulk insert all products directly into Supabase."""
    if not SUPA_KEY:
        print("\n❌  No Supabase service_role key set!")
        print("    Set it in scraper.py (SUPA_KEY) or via: export SUPA_SERVICE_KEY=eyJ...")
        return False

    print(f"\n🚀  Pushing {len(products)} products to Supabase…")
    success = 0
    errors = 0
    batch_size = 50

    for i in range(0, len(products), batch_size):
        batch = products[i:i+batch_size]
        rows = []
        for p in batch:
            rows.append({
                # No manual id — let Supabase bigserial assign it (S3)
                "name": p["name"],
                "brand": p["brand"],
                "pkr": p["pkr"],
                "gender": p["gender"],
                "cat": p["cat"],
                "description": p.get("description", "100% Authentic."),
                "image": p.get("image", ""),
                "images": p.get("images", []),
                "colors": p.get("colors", []),
                "in_stock": p.get("inStock", False),
                "qty": 5 if p.get("inStock") else 0,
                "cost": int(p.get("usd", 0) * USD_TO_PKR),
                "is_approved": False,  # S1: goes to review queue in admin
            })

        try:
            resp = requests.post(
                f"{SUPA_URL}/rest/v1/products",
                headers={
                    "Content-Type": "application/json",
                    "apikey": SUPA_KEY,
                    "Authorization": f"Bearer {SUPA_KEY}",
                    # S5: upsert on (brand, name) — updates price/image, preserves qty/is_approved
                    "Prefer": "return=minimal,resolution=merge-duplicates",
                    "on_conflict": "brand,name",
                },
                json=rows,
                timeout=30,
            )
            if resp.status_code in (200, 201):
                success += len(batch)
                print(f"   ✓  Batch {i//batch_size+1}: {len(batch)} products inserted")
            else:
                errors += len(batch)
                print(f"   ✗  Batch {i//batch_size+1}: HTTP {resp.status_code} — {resp.text[:120]}")
        except Exception as e:
            errors += len(batch)
            print(f"   ✗  Batch {i//batch_size+1}: {type(e).__name__}")

    print(f"\n   → Supabase: {success} inserted, {errors} errors")
    return errors == 0


# ── 5. Output ─────────────────────────────────────────────────────────────────

def save_output():
    # Re-assign sequential IDs
    for i, p in enumerate(products, 1):
        p["id"] = i
        p.pop("source", None)     # remove internal field before export

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False, indent=2)

    print(f"\n{'─'*55}")
    print(f"✅  Done — {len(products)} products saved to {OUTPUT_FILE}")
    print(f"    USD→PKR rate: {USD_TO_PKR}  |  Markup: {MARKUP_PCT}%")
    print(f"    → Open admin → Products → Import to bulk-add")
    print(f"{'─'*55}\n")

    # Summary by brand
    from collections import Counter
    brand_counts = Counter(p["brand"] for p in products)
    print("Top brands in output:")
    for brand, count in brand_counts.most_common(20):
        print(f"  {brand:<35} {count} products")

# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"Global Bestie Scraper — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"Rate: 1 USD = {USD_TO_PKR} PKR  |  Markup: {MARKUP_PCT}%")
    print(f"Mode: {'PUSH to Supabase' if CLI_ARGS.push else 'JSON file'}\n")

    # Always load curated first (instant, guaranteed)
    load_curated()

    # Enrich curated products with images
    enrich_images()

    if not CLI_ARGS.skip_scrape:
        # Then try live scrapers — these add more / fresher data on top
        try:
            scrape_sephora()
        except KeyboardInterrupt:
            print("\n   (Sephora skipped)")

        try:
            scrape_ulta()
        except KeyboardInterrupt:
            print("\n   (Ulta skipped)")

        try:
            scrape_nordstrom()
        except KeyboardInterrupt:
            print("\n   (Nordstrom skipped)")

    # Apply limit if set
    if CLI_ARGS.limit > 0 and len(products) > CLI_ARGS.limit:
        products[:] = products[:CLI_ARGS.limit]
        print(f"\n   (Limited to {CLI_ARGS.limit} products)")

    # Output
    if CLI_ARGS.push:
        push_to_supabase()
    save_output()
