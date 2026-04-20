import re
import os

def update_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Update the detail-add-btn CSS hover
    content = content.replace(
        '.detail-add-btn:hover{background:var(--gold);color:var(--ink);box-shadow:var(--shadow-lg);transform:translateY(-2px)}',
        '.detail-add-btn:hover{background:var(--gold) !important;color:var(--ink) !important;box-shadow:var(--shadow-lg);transform:translateY(-2px)}'
    )
    
    # Also update btn.style.color='#fff' to var(--gold-light) in JS
    content = content.replace("btn.style.color='#fff';", "btn.style.color='';")
    content = content.replace("btn.style.background=isPreorder?'var(--pink-deep)':'var(--ink)';", "btn.style.background='';")
    # Actually, if we just remove the inline styles, it falls back to CSS.
    # But for preorder it might need a different class. Let's just rely on !important for hover, and empty the inline color.
    
    with open(filepath, 'w') as f:
        f.write(content)

for f in ['index.html', 'products.html']:
    if os.path.exists(f):
        update_file(f)
        print(f"Fixed {f}")
