// Supabase credentials
const SUPA_URL = 'https://jfnmworzcpgwgqslvwhl.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impmbm13b3J6Y3Bnd2dxc2x2d2hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzU0MzgsImV4cCI6MjA5MTg1MTQzOH0.RFJCzqe6_kadSSHY3eDH0skL-hGSn-3KFvd7E9YjqVA';

// DOM Elements
const titleEl = document.getElementById('title');
const brandEl = document.getElementById('brand');
const catEl = document.getElementById('cat');
const usdPriceEl = document.getElementById('usdPrice');
const exchangeRateEl = document.getElementById('exchangeRate');
const shippingEl = document.getElementById('shipping');
const marginEl = document.getElementById('margin');
const finalPriceEl = document.getElementById('finalPrice');
const serviceKeyEl = document.getElementById('serviceKey');
const previewEl = document.getElementById('preview');
const statusEl = document.getElementById('status');
const importBtn = document.getElementById('importBtn');

// Load saved settings
chrome.storage.local.get(['gb_service_key', 'gb_exchange_rate', 'gb_shipping', 'gb_margin'], (result) => {
  if (result.gb_service_key) serviceKeyEl.value = result.gb_service_key;
  if (result.gb_exchange_rate) exchangeRateEl.value = result.gb_exchange_rate;
  if (result.gb_shipping) shippingEl.value = result.gb_shipping;
  if (result.gb_margin) marginEl.value = result.gb_margin;
});

let scrapedImageUrl = '';

// Calculate Final PKR Price
function updatePrice() {
  const usd = parseFloat(usdPriceEl.value) || 0;
  const rate = parseFloat(exchangeRateEl.value) || 280;
  const ship = parseFloat(shippingEl.value) || 0;
  const margin = parseFloat(marginEl.value) || 0;

  const costPkr = (usd + ship) * rate;
  let finalPkr = costPkr * (1 + (margin / 100));
  
  // Round up to nearest 50
  finalPkr = Math.ceil(finalPkr / 50) * 50;
  
  finalPriceEl.value = finalPkr;
  return finalPkr;
}

// Event Listeners for Math
[usdPriceEl, exchangeRateEl, shippingEl, marginEl].forEach(el => {
  el.addEventListener('input', updatePrice);
});

// Trigger scraping when popup opens
chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
  const activeTab = tabs[0];
  
  chrome.scripting.executeScript({
    target: {tabId: activeTab.id},
    files: ['content.js']
  }, () => {
    // After script injected, send message
    chrome.tabs.sendMessage(activeTab.id, {action: "scrape"}, (response) => {
      if (response) {
        titleEl.value = response.title || '';
        usdPriceEl.value = response.price || 0;
        
        if (response.image) {
          scrapedImageUrl = response.image;
          previewEl.src = response.image;
        }

        // Try to guess brand from title
        if(response.title) {
           const commonBrands = ['sephora', 'ulta', 'fenty', 'rare beauty', 'dior', 'charlotte tilbury', 'mac', 'ordinary'];
           const lower = response.title.toLowerCase();
           for(let b of commonBrands) {
             if(lower.includes(b)) {
                brandEl.value = b.split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
                break;
             }
           }
        }
        
        updatePrice();
      } else {
        statusEl.innerText = "Could not scrape page.";
        statusEl.className = "status error";
      }
    });
  });
});

// Import to Supabase
importBtn.addEventListener('click', async () => {
  if (!titleEl.value) {
    statusEl.innerText = "Please provide a title.";
    statusEl.className = "status error";
    return;
  }

  const finalPkr = parseFloat(finalPriceEl.value) || updatePrice();
  
  const usd = parseFloat(usdPriceEl.value) || 0;
  const rate = parseFloat(exchangeRateEl.value) || 280;
  const ship = parseFloat(shippingEl.value) || 0;
  const costPkr = (usd + ship) * rate;

  const sKey = serviceKeyEl.value.trim() || SUPA_KEY;
  
  // Save settings
  chrome.storage.local.set({
    gb_service_key: serviceKeyEl.value.trim(),
    gb_exchange_rate: exchangeRateEl.value,
    gb_shipping: shippingEl.value,
    gb_margin: marginEl.value
  });

  importBtn.innerText = "Importing...";
  importBtn.disabled = true;

  try {
    const response = await fetch(`${SUPA_URL}/rest/v1/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': sKey,
        'Authorization': `Bearer ${sKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        id: Math.floor(Math.random() * 900000) + 100000,
        name: titleEl.value.trim(),
        brand: brandEl.value.trim() || 'Unknown',
        cat: catEl.value,
        gender: 'women', // Default to women
        pkr: finalPkr,
        image: scrapedImageUrl,
        in_stock: true,
        qty: 1,
        cost: costPkr || 0,
        description: '100% Authentic.'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to import: ${response.status} ${errorText}`);
    }

    statusEl.innerText = "Success! Product imported to Global Bestie.";
    statusEl.className = "status success";
    importBtn.innerText = "Done";
  } catch (err) {
    statusEl.innerText = "Error: " + err.message;
    statusEl.className = "status error";
    importBtn.innerText = "Try Again";
    importBtn.disabled = false;
  }
});
