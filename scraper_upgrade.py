#!/usr/bin/env python3
"""
Patches scraper.py:
  1. Adds --push flag for direct Supabase insert
  2. Adds fashion/retail brands (Tory Burch, Coach, Nike, etc.)
  3. Expands curated catalog to 500+
  4. Adds Nordstrom scraper
"""

import os

SCRAPER = os.path.join(os.path.dirname(__file__), 'scraper.py')

with open(SCRAPER, 'r') as f:
    content = f.read()

# ── 1. Add Supabase push + argparse at top ──
old_imports = 'import requests\nfrom bs4 import BeautifulSoup\nimport json, re, sys, time, random\nfrom datetime import datetime'
new_imports = '''import requests
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
SUPA_URL = "https://jfnmworzcpgwgqslvwhl.supabase.co"
SUPA_KEY = ""  # Set your service_role key here or via env var
if not SUPA_KEY:
    SUPA_KEY = os.environ.get("SUPA_SERVICE_KEY", "")'''
content = content.replace(old_imports, new_imports)

# ── 2. Add fashion brands to TOP_BRANDS ──
old_tom_ford = '''    # Luxury beauty
    "Tom Ford Beauty":    {"cat": "makeup",   "gender": "women"},
}'''
new_brands = '''    # Luxury beauty
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
}'''
content = content.replace(old_tom_ford, new_brands)

# ── 3. Add Supabase push function + Nordstrom scraper before save_output ──
push_and_nordstrom = '''
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
    print("\\n🏬  Nordstrom — trending categories")
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
        print("\\n❌  No Supabase service_role key set!")
        print("    Set it in scraper.py (SUPA_KEY) or via: export SUPA_SERVICE_KEY=eyJ...")
        return False

    print(f"\\n🚀  Pushing {len(products)} products to Supabase…")
    success = 0
    errors = 0
    batch_size = 50

    for i in range(0, len(products), batch_size):
        batch = products[i:i+batch_size]
        rows = []
        for p in batch:
            rows.append({
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
            })

        try:
            resp = requests.post(
                f"{SUPA_URL}/rest/v1/products",
                headers={
                    "Content-Type": "application/json",
                    "apikey": SUPA_KEY,
                    "Authorization": f"Bearer {SUPA_KEY}",
                    "Prefer": "return=minimal,resolution=merge-duplicates",
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

    print(f"\\n   → Supabase: {success} inserted, {errors} errors")
    return errors == 0

'''
content = content.replace('\n# ── 5. Output', push_and_nordstrom + '\n# ── 5. Output')

# ── 4. Add expanded curated products (fashion, fragrance, more skincare) ──
old_curated_end = '''    added = len(products) - n
    print(f"   ✓  Curated: +{added} products ({len(products)} total)")'''
new_curated_end = '''
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
    print(f"   ✓  Curated: +{added} products ({len(products)} total)")'''
content = content.replace(old_curated_end, new_curated_end)

# ── 5. Update main block ──
old_main = '''if __name__ == "__main__":
    print(f"Global Bestie Scraper — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"Rate: 1 USD = {USD_TO_PKR} PKR  |  Markup: {MARKUP_PCT}%\\n")

    # Always load curated first (instant, guaranteed)
    load_curated()

    # Enrich curated products with images
    enrich_images()

    # Then try live scrapers — these add more / fresher data on top
    try:
        scrape_sephora()
    except KeyboardInterrupt:
        print("\\n   (Sephora skipped)")

    try:
        scrape_ulta()
    except KeyboardInterrupt:
        print("\\n   (Ulta skipped)")

    save_output()'''

new_main = '''if __name__ == "__main__":
    print(f"Global Bestie Scraper — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"Rate: 1 USD = {USD_TO_PKR} PKR  |  Markup: {MARKUP_PCT}%")
    print(f"Mode: {'PUSH to Supabase' if CLI_ARGS.push else 'JSON file'}\\n")

    # Always load curated first (instant, guaranteed)
    load_curated()

    # Enrich curated products with images
    enrich_images()

    if not CLI_ARGS.skip_scrape:
        # Then try live scrapers — these add more / fresher data on top
        try:
            scrape_sephora()
        except KeyboardInterrupt:
            print("\\n   (Sephora skipped)")

        try:
            scrape_ulta()
        except KeyboardInterrupt:
            print("\\n   (Ulta skipped)")

        try:
            scrape_nordstrom()
        except KeyboardInterrupt:
            print("\\n   (Nordstrom skipped)")

    # Apply limit if set
    if CLI_ARGS.limit > 0 and len(products) > CLI_ARGS.limit:
        products[:] = products[:CLI_ARGS.limit]
        print(f"\\n   (Limited to {CLI_ARGS.limit} products)")

    # Output
    if CLI_ARGS.push:
        push_to_supabase()
    save_output()'''

content = content.replace(old_main, new_main)

# ── Write back ──
with open(SCRAPER, 'w') as f:
    f.write(content)

print("✅ scraper.py upgraded!")
print("   New features:")
print("   • python3 scraper.py --push          → Push directly to Supabase")
print("   • python3 scraper.py --skip-scrape   → Curated products only (fast)")
print("   • python3 scraper.py --limit 500     → Cap at 500 products")
print("   • Nordstrom scraper added")
print(f"   • ~500+ curated products (fashion, fragrance, bags, shoes)")
