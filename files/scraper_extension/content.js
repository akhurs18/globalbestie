// Scrape data from the active page
function scrapeProduct() {
  let title = document.title || '';
  
  // Try to find the h1 for a cleaner title
  const h1 = document.querySelector('h1');
  if (h1 && h1.innerText) {
    title = h1.innerText.trim();
  }

  // Look for og:image
  let image = '';
  const ogImg = document.querySelector('meta[property="og:image"]');
  if (ogImg && ogImg.content) {
    image = ogImg.content;
  } else {
    // Fallback: largest image on the page
    const imgs = Array.from(document.querySelectorAll('img')).filter(img => img.width > 200 && img.height > 200);
    if (imgs.length > 0) {
      image = imgs[0].src;
    }
  }

  // Look for price
  let price = 0;
  // Try to find an element with a dollar sign
  const priceEl = Array.from(document.querySelectorAll('span, div, p, b, strong')).find(el => {
    return el.innerText && el.innerText.match(/^\$[\d,]+\.?\d*$/) && el.children.length === 0;
  });
  
  if (priceEl) {
    price = parseFloat(priceEl.innerText.replace(/[^0-9.]/g, ''));
  }

  // Look for description
  let description = '';
  const metaDesc = document.querySelector('meta[name="description"]') || document.querySelector('meta[property="og:description"]');
  if (metaDesc && metaDesc.content) {
    description = metaDesc.content.trim();
  }

  return { title, image, price, description };
}

// Send the data back to the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrape") {
    sendResponse(scrapeProduct());
  }
});
