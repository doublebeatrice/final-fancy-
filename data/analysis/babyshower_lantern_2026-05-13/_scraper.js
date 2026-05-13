// Reusable scraper body for Amazon product page - run via evaluate_script
(() => {
  const text = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim().replace(/\s+/g, ' ') : ''; };
  const asin = (location.pathname.match(/\/dp\/([A-Z0-9]{10})/) || [])[1] || '';
  const title = text('#productTitle');
  const brand = text('#bylineInfo').replace(/^(Visit the|Brand:)\s+/, '').replace(/\s+Store$/, '');
  const price = text('.a-price .a-offscreen');
  const rating = text('[data-hook="rating-out-of-text"]') || text('.a-icon-star span.a-icon-alt');
  const reviewCount = text('#acrCustomerReviewText');
  const bullets = Array.from(document.querySelectorAll('#feature-bullets li span.a-list-item'))
    .map(e => e.textContent.trim().replace(/\s+/g, ' '))
    .filter(t => t.length > 15).slice(0, 8);
  const specs = {};
  document.querySelectorAll('table tr').forEach(tr => {
    const kEl = tr.querySelector('th, td:first-child');
    const tds = tr.querySelectorAll('td');
    const vEl = tds[tds.length - 1];
    if (kEl && vEl && kEl !== vEl) {
      const key = kEl.textContent.trim().replace(/\s+/g, ' ');
      const val = vEl.textContent.trim().replace(/\s+/g, ' ');
      if (key && val && key.length < 80 && val.length < 500 && !specs[key]) specs[key] = val;
    }
  });
  return { asin, title, brand, price, rating, reviewCount, bullets, specs };
})()
