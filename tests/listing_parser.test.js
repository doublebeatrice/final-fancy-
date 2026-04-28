const assert = require('assert');
const { parseListing } = require('../extension/listing_parser');

const sampleHtml = `
<!doctype html>
<html>
  <head>
    <meta property="og:title" content="Fallback Listing Title" />
    <meta property="og:image" content="https://images.example.com/meta-main.jpg" />
    <meta name="description" content="Fallback description text" />
  </head>
  <body>
    <span id="productTitle">Nurse Week Gift Basket for Women</span>
    <a id="bylineInfo">Brand: YSWG</a>
    <span id="acrCustomerReviewText">1,234 ratings</span>
    <span id="acrPopover" title="4.7 out of 5 stars"></span>
    <div class="a-price"><span class="a-offscreen">$19.99</span></div>
    <i id="isPrimeBadge"></i>
    <input id="buy-now-button" />
    <div id="feature-bullets">
      <ul>
        <li><span class="a-list-item">Nurse appreciation gift for RN women.</span></li>
        <li><span class="a-list-item">Mother's day and hospital shift ready.</span></li>
      </ul>
    </div>
    <div id="productDescription">Gift basket with tumbler, socks and card.</div>
    <div id="aplus_feature_div">
      <h2>Perfect for nurse week</h2>
      <p>Seasonal care package with themed accessories.</p>
      <img alt="nurse week gift image" />
    </div>
    <div id="wayfinding-breadcrumbs_feature_div">
      <ul>
        <li><a>Home & Kitchen</a></li>
        <li><a>Gift Baskets</a></li>
      </ul>
    </div>
    <div id="twister_feature_div"><span class="selection">Color: Pink</span></div>
    <img id="landingImage" data-a-dynamic-image='{"https://images.example.com/main.jpg":[1000,1000],"https://images.example.com/alt1.jpg":[800,800]}' />
    <div id="detailBulletsWrapper_feature_div">
      <span>#12 in Gift Baskets (See Top 100)</span>
      <span>#35 in Handmade Products (See Top 100)</span>
    </div>
  </body>
</html>
`;

const parsed = parseListing(sampleHtml, 'B0TEST1234');

assert.strictEqual(parsed.asin, 'B0TEST1234');
assert.strictEqual(parsed.title, 'Nurse Week Gift Basket for Women');
assert.strictEqual(parsed.brand, 'Brand: YSWG');
assert.strictEqual(parsed.isAvailable, true);
assert.strictEqual(parsed.reviewCount, 1234);
assert.strictEqual(parsed.reviewRating, 4.7);
assert.strictEqual(parsed.price, 19.99);
assert.strictEqual(parsed.hasPrime, true);
assert.deepStrictEqual(parsed.bullets, [
  'Nurse appreciation gift for RN women.',
  "Mother's day and hospital shift ready.",
]);
assert.strictEqual(parsed.description, 'Gift basket with tumbler, socks and card.');
assert.ok(parsed.aPlusText.includes('Perfect for nurse week'));
assert.ok(parsed.aPlusText.includes('nurse week gift image'));
assert.deepStrictEqual(parsed.breadcrumbs, ['Home & Kitchen', 'Gift Baskets']);
assert.strictEqual(parsed.mainImageUrl, 'https://images.example.com/main.jpg');
assert.deepStrictEqual(parsed.imageUrls, [
  'https://images.example.com/main.jpg',
  'https://images.example.com/alt1.jpg',
  'https://images.example.com/meta-main.jpg',
]);
assert.strictEqual(parsed.variationText, 'Color: Pink');
assert.deepStrictEqual(parsed.bsr, [
  { rank: 12, category: 'Gift Baskets' },
  { rank: 35, category: 'Handmade Products' },
]);

console.log('listing_parser tests passed');
