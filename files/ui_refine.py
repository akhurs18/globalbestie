import re
import os

def update_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Update prod-card CSS
    content = re.sub(
        r'\.prod-card\{[^}]*\}',
        '.prod-card{background:var(--card);overflow:hidden;cursor:pointer;transition:all 0.4s cubic-bezier(0.16,1,0.3,1);box-shadow:var(--shadow);border:1px solid transparent}',
        content
    )
    content = re.sub(
        r'\.prod-card:hover\{[^}]*\}',
        '.prod-card:hover{box-shadow:var(--shadow-lg);border-color:var(--gold);z-index:2;position:relative;transform:translateY(-4px)}',
        content
    )

    # 2. Update btn-primary CSS
    content = re.sub(
        r'\.btn-primary\{[^}]*\}',
        ".btn-primary{background:var(--ink);color:var(--gold-light);padding:0.85rem 2.5rem;font-family:'Inter',sans-serif;font-size:0.7rem;font-weight:500;border:1px solid var(--gold);cursor:pointer;letter-spacing:3px;text-transform:uppercase;transition:all 0.3s cubic-bezier(0.16,1,0.3,1);box-shadow:var(--shadow-md)}",
        content
    )
    content = re.sub(
        r'\.btn-primary:hover\{[^}]*\}',
        ".btn-primary:hover{background:var(--gold);color:var(--ink);box-shadow:var(--shadow-lg);transform:translateY(-2px)}",
        content
    )
    
    # 3. Update hero background color to --ink
    content = re.sub(r'\.hero\{background:var\(--ink2\);', '.hero{background:var(--ink);', content)

    with open(filepath, 'w') as f:
        f.write(content)

for f in ['index.html', 'products.html']:
    if os.path.exists(f):
        update_file(f)
        print(f"Refined {f}")
