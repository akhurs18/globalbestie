#!/usr/bin/env python3
"""
Global Bestie — Fast Product Push
==================================
Loads curated products, fetches images in parallel, validates them,
deduplicates against Supabase, and bulk-inserts.

Usage:
  python3 fast_push.py                  # Push new products with images
  python3 fast_push.py --update-prices  # Update PKR prices for existing products
  python3 fast_push.py --dry-run        # Preview without pushing
"""
import os, requests, json, re, time, random, sys, argparse
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── CLI ──
parser = argparse.ArgumentParser(description="Global Bestie Fast Push")
parser.add_argument("--update-prices", action="store_true", help="Update prices only")
parser.add_argument("--dry-run", action="store_true", help="Preview without pushing")
parser.add_argument("--rate", type=int, default=278, help="USD to PKR rate (default: 278)")
parser.add_argument("--margin", type=int, default=30, help="Markup percentage (default: 30)")
args = parser.parse_args()

# ── Config ──
SUPA_URL = "https://jfnmworzcpgwgqslvwhl.supabase.co"
SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impmbm13b3J6Y3Bnd2dxc2x2d2hsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI3NTQzOCwiZXhwIjoyMDkxODUxNDM4fQ.Zw__2cUnRDd-rizdNnkTdJPtfFJj5fL9FPZM0QUWJEA"
USD_TO_PKR = args.rate
MARKUP_PCT = args.margin
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
}
SUPA_HEADERS = {
    "Content-Type": "application/json",
    "apikey": SUPA_KEY,
    "Authorization": f"Bearer {SUPA_KEY}",
}

# ── S3: Auto-categorize by keywords ──
CAT_KEYWORDS = {
    "skincare": ["serum", "moisturizer", "cream", "cleanser", "sunscreen", "spf", "mask",
                 "toner", "exfoliat", "retinol", "hyaluronic", "niacinamide", "vitamin c",
                 "eye cream", "face wash", "micellar", "balm", "lotion", "peeling"],
    "makeup":   ["lipstick", "foundation", "mascara", "eyeliner", "eyeshadow", "blush",
                 "concealer", "primer", "bronzer", "highlighter", "lip gloss", "brow",
                 "setting spray", "powder", "palette", "lip oil", "lip liner", "contour"],
    "fragrance":["eau de", "parfum", "toilette", "cologne", "body mist", "perfume"],
    "hair":     ["shampoo", "conditioner", "hair mask", "hair oil", "hair dryer",
                 "straightener", "styler", "airwrap", "hair treatment"],
    "bags":     ["bag", "tote", "satchel", "crossbody", "backpack", "wallet", "clutch",
                 "purse", "handbag"],
    "shoes":    ["sneaker", "shoe", "sandal", "trainer", "boot", "runner", "air force",
                 "air max", "dunk", "jordan", "blazer"],
    "home":     ["candle", "body cream", "shower gel", "bath", "body lotion", "hand soap"],
    "accessories": ["wallet", "card case", "belt", "scarf", "sunglasses", "watch", "jewelry"],
}

def auto_categorize(name, brand):
    """S3: Smart category guess from product name."""
    name_lower = name.lower()
    brand_lower = brand.lower()
    # Brand-based overrides
    brand_cats = {
        "tory burch": "bags", "coach": "bags", "kate spade": "bags",
        "michael kors": "bags", "marc jacobs": "bags", "nike": "shoes",
        "bath & body works": "home",
    }
    if brand_lower in brand_cats:
        # But check name for specifics
        for cat, keywords in CAT_KEYWORDS.items():
            for kw in keywords:
                if kw in name_lower:
                    return cat
        return brand_cats[brand_lower]
    # Keyword match
    for cat, keywords in CAT_KEYWORDS.items():
        for kw in keywords:
            if kw in name_lower:
                return cat
    return "makeup"  # default

def usd_to_pkr(usd):
    return int(round(usd * USD_TO_PKR * (1 + MARKUP_PCT / 100) / 100) * 100)

# ── S2: Image validation ──
def validate_image(url):
    """Check image URL is valid and not a tiny placeholder."""
    if not url:
        return False
    try:
        r = requests.head(url, headers=HEADERS, timeout=4, allow_redirects=True)
        if r.status_code != 200:
            return False
        content_len = int(r.headers.get("Content-Length", 0))
        content_type = r.headers.get("Content-Type", "")
        if content_len < 5000:  # < 5KB is likely a placeholder/icon
            return False
        if "image" not in content_type and "octet" not in content_type:
            return False
        return True
    except:
        return False

def find_image(brand, name):
    """Fast image search via Bing."""
    try:
        q = requests.utils.quote(f"{brand} {name} product")
        url = f"https://www.bing.com/images/search?q={q}&first=1&count=8"
        r = requests.get(url, headers=HEADERS, timeout=6)
        matches = re.findall(r'murl&quot;:&quot;(https?://[^&]+?)&quot;', r.text)
        if not matches:
            matches = re.findall(r'"murl":"(https?://[^"]+)"', r.text)
        # Return first valid image
        for img in matches[:8]:
            if validate_image(img):
                return img
        # Fallback: return first match without validation
        return matches[0] if matches else ""
    except:
        return ""

# ── S1: Deduplication ──
def get_existing_products():
    """Fetch existing product names+brands from Supabase for dedup."""
    existing = set()
    try:
        offset = 0
        while True:
            resp = requests.get(
                f"{SUPA_URL}/rest/v1/products?select=name,brand&offset={offset}&limit=1000",
                headers=SUPA_HEADERS, timeout=15,
            )
            if resp.status_code != 200:
                break
            data = resp.json()
            if not data:
                break
            for p in data:
                key = f"{(p.get('brand','') or '').lower().strip()}|{(p.get('name','') or '').lower().strip()}"
                existing.add(key)
            offset += 1000
            if len(data) < 1000:
                break
        print(f"   Found {len(existing)} existing products in database")
    except Exception as e:
        print(f"   ⚠ Could not fetch existing products: {e}")
    return existing

# ── S4: Price update mode ──
def update_prices():
    """Update PKR prices for all existing products based on new rate."""
    print(f"\n💰 Updating prices — Rate: {USD_TO_PKR} PKR | Margin: {MARKUP_PCT}%")
    offset = 0
    updated = 0
    while True:
        resp = requests.get(
            f"{SUPA_URL}/rest/v1/products?select=id,cost&offset={offset}&limit=100",
            headers=SUPA_HEADERS, timeout=15,
        )
        if resp.status_code != 200 or not resp.json():
            break
        data = resp.json()
        for p in data:
            cost = p.get("cost", 0)
            if not cost or cost <= 0:
                continue
            usd_approx = cost / USD_TO_PKR
            new_pkr = usd_to_pkr(usd_approx)
            if args.dry_run:
                print(f"   [dry] ID {p['id']}: cost={cost} → PKR {new_pkr}")
            else:
                requests.patch(
                    f"{SUPA_URL}/rest/v1/products?id=eq.{p['id']}",
                    headers=SUPA_HEADERS,
                    json={"pkr": new_pkr},
                    timeout=10,
                )
            updated += 1
        offset += 100
        if len(data) < 100:
            break
    print(f"   → Updated {updated} products")
    return

# ── Load curated products ──
products = []
seen = set()

def add(name, brand, usd, cat="makeup", gender="women",
        description="", image="", images=None, colors=None, in_stock=False, source=""):
    key = f"{brand.lower().strip()}|{name.lower().strip()}"
    if key in seen or not name or not brand or usd <= 0:
        return False
    seen.add(key)
    # S3: Auto-categorize if cat is default
    if cat == "makeup":
        cat = auto_categorize(name, brand)
    products.append({
        "name": name.strip(), "brand": brand.strip(), "usd": round(usd, 2),
        "pkr": usd_to_pkr(usd), "gender": gender, "cat": cat,
        "description": description.strip(), "image": image.strip(),
        "images": images or [], "colors": colors or [],
        "inStock": in_stock, "source": source,
    })
    return True

def parse_usd(text):
    if not text: return 0
    m = re.search(r"\$?([\d,]+\.?\d*)", str(text).replace(",", ""))
    return float(m.group(1)) if m else 0

# ── Main ──
if __name__ == "__main__":
    print(f"Global Bestie Fast Push — Rate: {USD_TO_PKR} PKR | Margin: {MARKUP_PCT}%")

    if args.update_prices:
        update_prices()
        sys.exit(0)

    # Load curated from scraper.py
    exec_globals = {"add": add, "parse_usd": parse_usd, "products": products, "seen": seen,
                    "USD_TO_PKR": USD_TO_PKR, "MARKUP_PCT": MARKUP_PCT, "usd_to_pkr": usd_to_pkr}
    with open(os.path.join(os.path.dirname(__file__), "scraper.py")) as f:
        src = f.read()
    match = re.search(r'(def load_curated\(\):.*?)(?=\n# ──|\ndef [a-z])', src, re.DOTALL)
    if match:
        exec(match.group(1), exec_globals)
        exec_globals["load_curated"]()

    print(f"\n✅ Loaded {len(products)} curated products")

    # S1: Deduplication
    print(f"\n🔍 Checking for duplicates...")
    existing = get_existing_products()
    before = len(products)
    products[:] = [p for p in products
                   if f"{p['brand'].lower().strip()}|{p['name'].lower().strip()}" not in existing]
    dupes = before - len(products)
    print(f"   Skipped {dupes} duplicates, {len(products)} new to push")

    if not products:
        print("\n✅ All products already in database. Nothing to push!")
        sys.exit(0)

    # Image enrichment (parallel)
    print(f"\n🖼️  Fetching images for {len(products)} products (8 threads)...")
    found = 0
    def enrich_one(p):
        if p.get("image"):
            return True
        img = find_image(p["brand"], p["name"])
        if img:
            p["image"] = img
            return True
        return False

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(enrich_one, p): p for p in products}
        for i, fut in enumerate(as_completed(futures), 1):
            p = futures[fut]
            if fut.result() and p.get("image"):
                found += 1
            if i % 25 == 0 or i == len(products):
                print(f"   {i}/{len(products)} — images: {found}")

    # S2: Report image stats
    with_img = sum(1 for p in products if p.get("image"))
    print(f"\n   → {with_img}/{len(products)} have images")

    if args.dry_run:
        print(f"\n[DRY RUN] Would push {len(products)} products. Exiting.")
        for p in products[:5]:
            print(f"   • {p['brand']} — {p['name']} (PKR {p['pkr']}, {p['cat']}) {'📷' if p.get('image') else '❌'}")
        sys.exit(0)

    # Push to Supabase
    print(f"\n🚀 Pushing {len(products)} products to Supabase...")
    success = 0
    errors = 0
    batch_size = 50

    for i in range(0, len(products), batch_size):
        batch = products[i:i + batch_size]
        rows = []
        for p in batch:
            rows.append({
                "id": random.randint(700000, 9999999),
                "name": p["name"], "brand": p["brand"], "pkr": p["pkr"],
                "gender": p["gender"], "cat": p["cat"],
                "description": p.get("description") or "100% Authentic.",
                "image": p.get("image", ""),
                "images": p.get("images", []),
                "colors": p.get("colors", []),
                "in_stock": p.get("inStock", False),
                "qty": 5 if p.get("inStock") else 0,
                "cost": int(p.get("usd", 0) * USD_TO_PKR),
            })
        try:
            resp = requests.post(
                f"{SUPA_URL}/rest/v1/products",
                headers={**SUPA_HEADERS, "Prefer": "return=minimal"},
                json=rows, timeout=30,
            )
            if resp.status_code in (200, 201):
                success += len(batch)
                print(f"   ✓ Batch {i // batch_size + 1}: {len(batch)} inserted")
            else:
                errors += len(batch)
                print(f"   ✗ Batch {i // batch_size + 1}: {resp.status_code} — {resp.text[:100]}")
        except Exception as e:
            errors += len(batch)
            print(f"   ✗ Batch {i // batch_size + 1}: {e}")

    print(f"\n{'─' * 50}")
    print(f"✅ Done! {success} products with images pushed")
    print(f"   {errors} errors" if errors else "   Zero errors!")
    print(f"{'─' * 50}")
