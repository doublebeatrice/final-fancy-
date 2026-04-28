(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ListingParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function normalizeWhitespace(value) {
    return String(value || '')
      .replace(/[\u00a0\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function decodeHtmlEntities(value) {
    return String(value || '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');
  }

  function stripTags(value) {
    return normalizeWhitespace(decodeHtmlEntities(String(value || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')));
  }

  function uniq(list) {
    return [...new Set((list || []).map(item => normalizeWhitespace(item)).filter(Boolean))];
  }

  function readJsonAttribute(value) {
    try {
      return JSON.parse(value || '');
    } catch (_) {
      return null;
    }
  }

  function parseWithDom(html, asin) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const text = node => normalizeWhitespace(node?.textContent || '');
    const query = selector => doc.querySelector(selector);
    const queryAll = selector => [...doc.querySelectorAll(selector)];

    const result = {
      asin,
      isAvailable: !!(query('#add-to-cart-button') || query('#buy-now-button')),
      reviewCount: null,
      reviewRating: null,
      price: null,
      hasPrime: !!query('#isPrimeBadge, .a-icon-prime, [aria-label*="Prime"]'),
      bsr: [],
      title: '',
      brand: '',
      bullets: [],
      description: '',
      aPlusText: '',
      breadcrumbs: [],
      mainImageUrl: '',
      imageUrls: [],
      variationText: '',
      fetchedAt: new Date().toISOString(),
    };

    result.title =
      text(query('#productTitle')) ||
      normalizeWhitespace(query('meta[property="og:title"]')?.getAttribute('content') || '');

    result.brand =
      text(query('#bylineInfo')) ||
      normalizeWhitespace(query('#brand')?.getAttribute('value') || '');

    const reviewCountText = text(query('#acrCustomerReviewText'));
    const reviewCountMatch = reviewCountText.match(/[\d,]+/);
    if (reviewCountMatch) result.reviewCount = parseInt(reviewCountMatch[0].replace(/,/g, ''), 10);

    const ratingText =
      query('#acrPopover')?.getAttribute('title') ||
      text(query('.reviewCountTextLinkedHistogram')) ||
      text(query('[data-hook="rating-out-of-text"]'));
    const ratingMatch = String(ratingText || '').match(/(\d+\.?\d*)/);
    if (ratingMatch) result.reviewRating = parseFloat(ratingMatch[1]);

    const priceText =
      text(query('.a-price .a-offscreen')) ||
      text(query('#priceblock_ourprice')) ||
      text(query('#priceblock_dealprice'));
    const priceMatch = String(priceText || '').match(/[\d,.]+/);
    if (priceMatch) result.price = parseFloat(priceMatch[0].replace(/,/g, ''));

    result.bullets = uniq(
      queryAll('#feature-bullets li span.a-list-item, #feature-bullets li')
        .map(node => text(node))
        .filter(item => item && item !== 'Make sure this fits by entering your model number.')
    );

    result.description =
      text(query('#productDescription')) ||
      normalizeWhitespace(query('meta[name="description"]')?.getAttribute('content') || '');

    result.aPlusText = uniq(
      queryAll('#aplus_feature_div img[alt], #aplus_feature_div p, #aplus_feature_div li, #aplus_feature_div h1, #aplus_feature_div h2, #aplus_feature_div h3, #aplus_feature_div h4, #aplus_feature_div span')
        .map(node => normalizeWhitespace(node.getAttribute?.('alt') || text(node)))
    ).join(' | ');

    result.breadcrumbs = uniq(
      queryAll('#wayfinding-breadcrumbs_feature_div a, #wayfinding-breadcrumbs_container a')
        .map(node => text(node))
    );

    const imageCandidates = [];
    for (const img of queryAll('#landingImage, #imgTagWrapperId img, #main-image-container img')) {
      const dynamic = readJsonAttribute(img.getAttribute('data-a-dynamic-image'));
      if (dynamic && typeof dynamic === 'object') imageCandidates.push(...Object.keys(dynamic));
      imageCandidates.push(
        img.getAttribute('data-old-hires'),
        img.getAttribute('src'),
        img.getAttribute('data-src')
      );
    }
    const metaImage = query('meta[property="og:image"]')?.getAttribute('content');
    if (metaImage) imageCandidates.push(metaImage);
    result.imageUrls = uniq(imageCandidates);
    result.mainImageUrl = result.imageUrls[0] || '';

    result.variationText = uniq(
      queryAll('#variation_color_name .selection, #variation_size_name .selection, #variation_style_name .selection, #twister_feature_div .selection')
        .map(node => text(node))
    ).join(' | ');

    const bsrText = text(query('#detailBulletsWrapper_feature_div')) || text(query('#productDetails_detailBullets_sections1')) || text(query('#SalesRank'));
    const bsrRe = /#([\d,]+)\s+in\s+([^#\n(]+?)(?:\(|$|See Top)/g;
    let match;
    while ((match = bsrRe.exec(bsrText)) !== null) {
      result.bsr.push({ rank: parseInt(match[1].replace(/,/g, ''), 10), category: normalizeWhitespace(match[2]) });
    }

    return result;
  }

  function parseWithRegex(html, asin) {
    const result = {
      asin,
      isAvailable: /add-to-cart-button|buy-now-button/i.test(html),
      reviewCount: null,
      reviewRating: null,
      price: null,
      hasPrime: /isPrimeBadge|a-icon-prime|aria-label="[^"]*Prime/i.test(html),
      bsr: [],
      title: '',
      brand: '',
      bullets: [],
      description: '',
      aPlusText: '',
      breadcrumbs: [],
      mainImageUrl: '',
      imageUrls: [],
      variationText: '',
      fetchedAt: new Date().toISOString(),
    };

    const extract = regex => {
      const match = regex.exec(html);
      return match ? stripTags(match[1]) : '';
    };

    result.title =
      extract(/<span[^>]*id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i) ||
      normalizeWhitespace(decodeHtmlEntities((html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"]+)["']/i) || [])[1] || ''));
    result.brand = extract(/<a[^>]*id=["']bylineInfo["'][^>]*>([\s\S]*?)<\/a>/i);
    result.description =
      extract(/<div[^>]*id=["']productDescription["'][^>]*>([\s\S]*?)<\/div>/i) ||
      normalizeWhitespace(decodeHtmlEntities((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"]+)["']/i) || [])[1] || ''));

    const bulletMatches = [...html.matchAll(/<li[^>]*>\s*<span[^>]*class=["'][^"']*a-list-item[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*<\/li>/gi)];
    result.bullets = uniq(bulletMatches.map(match => stripTags(match[1])));

    const breadcrumbHtml = (html.match(/<div[^>]*id=["']wayfinding-breadcrumbs(?:_feature_div|_container)?["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '';
    const breadcrumbMatches = [...breadcrumbHtml.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)];
    result.breadcrumbs = uniq(breadcrumbMatches.map(match => stripTags(match[1])));

    const reviewCountMatch = html.match(/id=["']acrCustomerReviewText["'][^>]*>\s*([^<]+)/i);
    const reviewDigits = String(reviewCountMatch?.[1] || '').match(/[\d,]+/);
    if (reviewDigits) result.reviewCount = parseInt(reviewDigits[0].replace(/,/g, ''), 10);

    const ratingMatch = html.match(/(?:id=["']acrPopover["'][^>]*title|data-hook=["']rating-out-of-text["'][^>]*>)=["']?([^"<>]+)|(\d+\.?\d*)\s+out of 5/i);
    const ratingValue = ratingMatch?.[1] || ratingMatch?.[2] || '';
    const ratingDigits = String(ratingValue).match(/(\d+\.?\d*)/);
    if (ratingDigits) result.reviewRating = parseFloat(ratingDigits[1]);

    const priceMatch = html.match(/(?:a-offscreen|priceblock_ourprice|priceblock_dealprice)[\s\S]*?\$([\d,.]+)/i);
    if (priceMatch) result.price = parseFloat(priceMatch[1].replace(/,/g, ''));

    const dynamicMatch = html.match(/data-a-dynamic-image=(["'])([\s\S]*?)\1/i);
    const dynamicImages = readJsonAttribute(decodeHtmlEntities(dynamicMatch?.[2] || ''));
    if (dynamicImages && typeof dynamicImages === 'object') result.imageUrls.push(...Object.keys(dynamicImages));
    const oldHiResMatches = [...html.matchAll(/data-old-hires=["']([^"']+)["']/gi)];
    result.imageUrls.push(...oldHiResMatches.map(match => match[1]));
    const ogImage = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"]+)["']/i) || [])[1];
    if (ogImage) result.imageUrls.push(ogImage);
    result.imageUrls = uniq(result.imageUrls);
    result.mainImageUrl = result.imageUrls[0] || '';

    const aPlusHtml = (html.match(/<div[^>]*id=["']aplus_feature_div["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '';
    const aPlusAltTexts = [...aPlusHtml.matchAll(/<img[^>]+alt=["']([^"']+)["'][^>]*>/gi)].map(match => stripTags(match[1]));
    result.aPlusText = uniq([stripTags(aPlusHtml), ...aPlusAltTexts]).join(' | ');

    const variationMatches = [...html.matchAll(/<span[^>]*class=["'][^"']*selection[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)];
    result.variationText = uniq(variationMatches.map(match => stripTags(match[1]))).join(' | ');

    const bsrText = stripTags((html.match(/(?:detailBulletsWrapper_feature_div|productDetails_detailBullets_sections1|SalesRank)[\s\S]*?<\/(?:div|table)>/i) || [])[0] || '');
    const bsrRe = /#([\d,]+)\s+in\s+([^#\n(]+?)(?:\(|$|See Top)/g;
    let match;
    while ((match = bsrRe.exec(bsrText)) !== null) {
      result.bsr.push({ rank: parseInt(match[1].replace(/,/g, ''), 10), category: normalizeWhitespace(match[2]) });
    }

    return result;
  }

  function parseListing(html, asin) {
    if (typeof DOMParser !== 'undefined') return parseWithDom(html, asin);
    return parseWithRegex(String(html || ''), asin);
  }

  return {
    parseListing,
  };
});
