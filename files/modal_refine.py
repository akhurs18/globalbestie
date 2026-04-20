import re
import os

def update_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Dimensions
    content = re.sub(
        r'\.detail-modal\{background:var\(--card\);width:100%;max-width:820px;',
        '.detail-modal{background:var(--card);width:100%;max-width:1000px;border-radius:8px;',
        content
    )
    
    # 2. detail-left & img-wrap background
    content = re.sub(
        r'\.detail-left\{width:360px;flex-shrink:0;display:flex;flex-direction:column;background:#0E0608\}',
        '.detail-left{width:50%;flex-shrink:0;display:flex;flex-direction:column;background:var(--bg2)}',
        content
    )
    content = re.sub(
        r'\.detail-img-wrap\{flex:1;min-height:340px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;background:#0E0608\}',
        '.detail-img-wrap{flex:1;min-height:400px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;background:var(--bg2)}',
        content
    )
    content = re.sub(
        r'\.detail-gallery\{display:flex;gap:4px;padding:8px;background:#0E0608;',
        '.detail-gallery{display:flex;gap:8px;padding:12px;background:var(--bg2);',
        content
    )
    
    # Thumbnails
    content = re.sub(
        r'\.detail-thumb\{width:54px;height:54px;flex-shrink:0;border:2px solid transparent;cursor:pointer;overflow:hidden;opacity:0\.5;transition:all 0\.15s\}',
        '.detail-thumb{width:60px;height:60px;flex-shrink:0;border:1px solid var(--border);border-radius:4px;cursor:pointer;overflow:hidden;opacity:0.6;transition:all 0.2s cubic-bezier(0.16,1,0.3,1)}',
        content
    )
    content = re.sub(
        r'\.detail-thumb\.active\{border-color:var\(--pink-deep\);opacity:1\}',
        '.detail-thumb.active{border-color:var(--gold);opacity:1;box-shadow:0 2px 8px rgba(0,0,0,0.05)}',
        content
    )

    # 3. Typography & Spacing
    content = re.sub(
        r'\.detail-name\{font-family:\'Playfair Display\',serif;font-size:1\.65rem;',
        '.detail-name{font-family:\'Playfair Display\',serif;font-size:2.2rem;',
        content
    )
    content = re.sub(
        r'\.detail-brand\{font-size:0\.7rem;color:var\(--muted2\);margin-bottom:14px;letter-spacing:0\.5px\}',
        '.detail-brand{font-size:0.65rem;color:var(--muted);margin-bottom:20px;letter-spacing:2px;text-transform:uppercase}',
        content
    )
    
    # Detail Top Strip & Body padding
    content = re.sub(
        r'\.detail-top-strip\{display:flex;align-items:center;justify-content:space-between;padding:1\.3rem 1\.5rem 0\}',
        '.detail-top-strip{display:flex;align-items:center;justify-content:space-between;padding:2rem 2.5rem 0}',
        content
    )
    content = re.sub(
        r'\.detail-body\{padding:0\.7rem 1\.5rem 1\.5rem;flex:1;display:flex;flex-direction:column\}',
        '.detail-body{padding:1rem 2.5rem 2.5rem;flex:1;display:flex;flex-direction:column}',
        content
    )

    # Add description CSS if not present, else replace
    if '.detail-desc{' not in content:
        content = re.sub(
            r'\.detail-desc-wrap\{',
            '.detail-desc{line-height:1.7;color:var(--muted);font-size:0.9rem;font-weight:300}\n.detail-desc-wrap{',
            content
        )
        
    # Detail Add Btn
    content = re.sub(
        r'\.detail-add-btn\{background:var\(--ink\);color:#fff;border:none;width:100%;padding:0\.85rem;font-size:0\.7rem;font-weight:500;letter-spacing:1\.5px;text-transform:uppercase;cursor:pointer;margin-bottom:0\.8rem;transition:background 0\.2s\}',
        ".detail-add-btn{background:var(--ink);color:var(--gold-light);border:1px solid var(--gold);width:100%;padding:1rem;font-size:0.75rem;font-weight:500;letter-spacing:3px;text-transform:uppercase;cursor:pointer;margin-bottom:1rem;transition:all 0.3s cubic-bezier(0.16,1,0.3,1);box-shadow:var(--shadow-md)}\n.detail-add-btn:hover{background:var(--gold);color:var(--ink);box-shadow:var(--shadow-lg);transform:translateY(-2px)}",
        content
    )

    # Qty Stepper
    content = re.sub(
        r'\.qty-stepper\{display:flex;align-items:center;border:1px solid var\(--border\)\}',
        '.qty-stepper{display:flex;align-items:center;border-bottom:1px solid var(--border2);padding-bottom:2px}',
        content
    )
    content = re.sub(
        r'\.qty-btn\{background:none;border:none;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:1\.1rem;color:var\(--ink\);transition:background 0\.15s\}',
        '.qty-btn{background:none;border:none;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:1.2rem;color:var(--muted);transition:color 0.2s}',
        content
    )
    content = re.sub(
        r'\.qty-btn:hover\{background:var\(--pink-light\)\}',
        '.qty-btn:hover{color:var(--ink)}',
        content
    )

    # Color Swatch
    content = re.sub(
        r'\.detail-color-swatch\{display:inline-block;width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;margin:0 4px 4px 0;box-shadow:0 0 0 1px rgba\(0,0,0,0\.12\);transition:transform 0\.15s\}',
        '.detail-color-swatch{display:inline-block;width:26px;height:26px;border-radius:50%;border:2px solid var(--card);cursor:pointer;margin:0 6px 6px 0;box-shadow:0 0 0 1px var(--border2);transition:all 0.2s ease}',
        content
    )
    content = re.sub(
        r'\.detail-color-swatch\.active\{border-color:var\(--ink\);transform:scale\(1\.1\)\}',
        '.detail-color-swatch.active{box-shadow:0 0 0 1.5px var(--ink);transform:scale(1.05)}',
        content
    )

    with open(filepath, 'w') as f:
        f.write(content)

for f in ['index.html', 'products.html']:
    if os.path.exists(f):
        update_file(f)
        print(f"Modal refined {f}")
