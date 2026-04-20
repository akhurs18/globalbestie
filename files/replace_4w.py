import os

files = ['/Users/abdulrehman/claude/globalbestie/files/index.html', '/Users/abdulrehman/claude/globalbestie/files/products.html', '/Users/abdulrehman/claude/globalbestie/files/track.html', '/Users/abdulrehman/claude/globalbestie/files/policy.html']

for filepath in files:
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            content = f.read()
        
        # Replace instances in content
        content = content.replace(" · Arrives in <b>~4 weeks</b>", "")
        content = content.replace("I understand delivery takes ~4 weeks, ", "")
        content = content.replace(" · ~4 weeks delivery from USA", "")
        content = content.replace(" · ~4 weeks delivery", "")
        content = content.replace(" — delivery in ~4 weeks", "")
        content = content.replace(" — delivered in ~4 weeks", "")
        content = content.replace("<b>~4 weeks</b> delivery", "<b>Fast</b> delivery")
        content = content.replace("~4 weeks delivery", "Delivery")
        content = content.replace("~4 weeks estimated delivery", "Estimated delivery")
        
        with open(filepath, 'w') as f:
            f.write(content)

print("Done")
