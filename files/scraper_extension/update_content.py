import re

filepath = 'content.js'
with open(filepath, 'r') as f:
    content = f.read()

# Wrap in IF block to prevent duplicate declarations
new_content = "if (typeof window.gbScraperLoaded === 'undefined') {\n  window.gbScraperLoaded = true;\n\n" + content + "\n}\n"

with open(filepath, 'w') as f:
    f.write(new_content)

print("Updated content.js")
