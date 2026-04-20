import re
import os

filepath = 'popup.js'
with open(filepath, 'r') as f:
    content = f.read()

# Add DOM elements
content = re.sub(
    r"const finalPriceEl = document.getElementById\('finalPrice'\);",
    "const finalPriceEl = document.getElementById('finalPrice');\nconst extraImagesEl = document.getElementById('extraImages');\nconst sizesEl = document.getElementById('sizes');\nconst colorsEl = document.getElementById('colors');",
    content
)

# Populate elements
populate_code = """
        if (response.extraImages && response.extraImages.length > 0) {
          extraImagesEl.value = response.extraImages.join('\\n');
        }
        if (response.sizes && response.sizes.length > 0) {
          sizesEl.value = response.sizes.join(', ');
        }
        if (response.colors && response.colors.length > 0) {
          colorsEl.value = response.colors.map(c => `${c.name} : ${c.hex}`).join('\\n');
        }
"""
content = re.sub(
    r"updatePrice\(\);\n      \} else \{",
    f"{populate_code}\n        updatePrice();\n      }} else {{",
    content
)

# Parse elements
parse_code = """
  const extraImagesArray = extraImagesEl.value.split('\\n').map(s => s.trim()).filter(Boolean);
  const sizesArray = sizesEl.value.split(',').map(s => s.trim()).filter(Boolean);
  const colorsArray = colorsEl.value.split('\\n').map(line => {
    const parts = line.split(':');
    if (parts.length >= 2) {
      return { name: parts[0].trim(), hex: parts[1].trim() };
    }
    return null;
  }).filter(Boolean);
"""
content = re.sub(
    r"const sKey = serviceKeyEl.value.trim\(\) \|\| SUPA_KEY;",
    f"{parse_code}\n  const sKey = serviceKeyEl.value.trim() || SUPA_KEY;",
    content
)

# Update payload
content = re.sub(
    r"in_stock: true,",
    "images: extraImagesArray,\n        sizes: sizesArray,\n        colors: colorsArray,\n        in_stock: true,",
    content
)

with open(filepath, 'w') as f:
    f.write(content)

print("Updated popup.js")
