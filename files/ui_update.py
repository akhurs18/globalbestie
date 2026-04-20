import re
import os

def update_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Update font imports
    content = content.replace("family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500", "family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400")
    
    # 2. Update font-family
    content = content.replace("Cormorant Garamond", "Playfair Display")

    # 3. Update CSS variables
    old_vars = """  --pink:#FFD1D3;--pink-light:#FFF0F1;--pink-mid:#F4A0A5;--pink-deep:#C4525A;--pink-dark:#8B2E34;
  --ink:#1A1015;--ink2:#2A1E20;--ink3:#3A2830;
  --bg:#FFF8F9;--bg2:#FFF0F1;--card:#FFFFFF;
  --muted:#8B6E72;--muted2:#BDA8AA;
  --border:#FFE4E6;--border2:#F4CDD0;
  --sage:#2E5E47;--sage-light:#E8F3ED;
  --sienna:#8B4513;--sienna-light:#FAF0E6;
  --wa:#25D366;"""
  
    new_vars = """  --pink:#F4E1E1;--pink-light:#FCF6F6;--pink-mid:#DDA7A5;--pink-deep:#B37D7D;--pink-dark:#805A5A;
  --ink:#130C10;--ink2:#22181C;--ink3:#2C2024;
  --bg:#FDFBF7;--bg2:#F8F4EE;--card:#FFFFFF;
  --muted:#9A8A8C;--muted2:#C9BCBD;
  --border:#EBE5E5;--border2:#E5D6D6;
  --gold:#D4AF37;--gold-light:#F3E5AB;
  --sage:#3E4E45;--sage-light:#F0F4F1;
  --sienna:#8B5A45;--sienna-light:#F9F4F0;
  --wa:#25D366;"""
    content = content.replace(old_vars, new_vars)

    # 4. Glassmorphism nav
    content = re.sub(r'nav\{background:var\(--ink\);', 'nav{background:rgba(19, 12, 16, 0.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);', content)
    
    # Glassmorphism filter bar (if any)
    content = re.sub(r'\.filters-sticky\{background:var\(--bg\);', '.filters-sticky{background:rgba(253, 251, 247, 0.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);', content)

    # 5. Typography spacing
    content = re.sub(r'(\.nav-links a\{[^}]*)letter-spacing:0\.4px', r'\1letter-spacing:1px', content)
    content = re.sub(r'(\.btn-primary\{[^}]*)letter-spacing:2px', r'\1letter-spacing:3px', content)
    
    # 6. Section spacing
    content = re.sub(r'padding:6rem 2rem;', 'padding:8rem 2rem;', content)

    # 7. Add fade-up animations to CSS
    fade_css = """
/* ── ANIMATIONS ── */
.fade-up { opacity: 0; transform: translateY(30px); transition: opacity 0.8s ease-out, transform 0.8s ease-out; }
.fade-up.visible { opacity: 1; transform: translateY(0); }
"""
    if "/* ── ANIMATIONS ── */" not in content:
        content = content.replace("/* ── ANNOUNCEMENT BAR ── */", fade_css + "/* ── ANNOUNCEMENT BAR ── */")

    # 8. Inject observer JS
    observer_js = """
// ── SCROLL ANIMATIONS ──
document.addEventListener('DOMContentLoaded', () => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  
  // Try to observe some elements if they exist
  document.querySelectorAll('.section-heading, .prod-card, .cat-card, .hiw-card').forEach(el => {
    el.classList.add('fade-up');
    observer.observe(el);
  });
});
"""
    if "// ── SCROLL ANIMATIONS ──" not in content:
        # insert before </script> at the end
        content = content.replace("</script>\n</body>", observer_js + "</script>\n</body>")

    with open(filepath, 'w') as f:
        f.write(content)

for f in ['index.html', 'products.html']:
    if os.path.exists(f):
        update_file(f)
        print(f"Updated {f}")
