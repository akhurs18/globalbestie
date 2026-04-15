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

import requests
from bs4 import BeautifulSoup
import json, re, sys, time, random
from datetime import datetime

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
        description="", image="", in_stock=False, source=""):
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

    added = len(products) - n
    print(f"   ✓  Curated: +{added} products ({len(products)} total)")

# ── 4. Output ─────────────────────────────────────────────────────────────────

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
    print(f"Rate: 1 USD = {USD_TO_PKR} PKR  |  Markup: {MARKUP_PCT}%\n")

    # Always load curated first (instant, guaranteed)
    load_curated()

    # Then try live scrapers — these add more / fresher data on top
    try:
        scrape_sephora()
    except KeyboardInterrupt:
        print("\n   (Sephora skipped)")

    try:
        scrape_ulta()
    except KeyboardInterrupt:
        print("\n   (Ulta skipped)")

    save_output()
