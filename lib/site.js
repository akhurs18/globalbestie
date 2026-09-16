export const site = {
  name: 'Global Bestie',
  instagram: 'globalbestie',
  // Set NEXT_PUBLIC_WHATSAPP_NUMBER (e.g. 923001234567) in Hostinger to send requests to WhatsApp.
  whatsapp: (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '').replace(/\D/g, ''),
};

export const channel = site.whatsapp ? 'WhatsApp' : 'Instagram';

export const instagramUrl = `https://instagram.com/${site.instagram}`;

export function contactLink(message = '') {
  if (site.whatsapp) {
    return `https://wa.me/${site.whatsapp}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
  }
  return `https://ig.me/m/${site.instagram}`;
}

// Opens the chat. Instagram DMs can't be pre-filled, so the message is copied to the clipboard first.
export async function sendMessage(message) {
  let copied = false;
  if (!site.whatsapp && typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(message);
      copied = true;
    } catch {}
  }
  window.open(contactLink(message), '_blank', 'noopener');
  return copied;
}
