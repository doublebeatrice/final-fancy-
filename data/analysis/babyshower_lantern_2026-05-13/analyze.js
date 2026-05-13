#!/usr/bin/env node
// Quick distribution stats over competitor sample.

const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'products.json'), 'utf8'));
const products = data.products;

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const stdev = (a) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
};
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};

const prices = products.map((p) => p.price_usd);
const ratings = products.map((p) => p.rating);
const reviews = products.map((p) => p.review_count);
const pieces = products.map((p) => p.pieces);

console.log('=== Price distribution (USD) ===');
console.log({
  n: prices.length,
  min: Math.min(...prices),
  max: Math.max(...prices),
  mean: mean(prices).toFixed(2),
  median: median(prices).toFixed(2),
  stdev: stdev(prices).toFixed(2),
  p25: pct(prices, 0.25).toFixed(2),
  p75: pct(prices, 0.75).toFixed(2)
});

const priceBuckets = { '<=13': 0, '13-17': 0, '17-20': 0, '20-25': 0, '>25': 0 };
prices.forEach((p) => {
  if (p <= 13) priceBuckets['<=13']++;
  else if (p < 17) priceBuckets['13-17']++;
  else if (p < 20) priceBuckets['17-20']++;
  else if (p < 25) priceBuckets['20-25']++;
  else priceBuckets['>25']++;
});
console.log('Price buckets:', priceBuckets);

console.log('\n=== Rating distribution ===');
console.log({
  mean: mean(ratings).toFixed(2),
  median: median(ratings).toFixed(2),
  stdev: stdev(ratings).toFixed(2)
});

console.log('\n=== Review count (social proof) ===');
console.log({
  min: Math.min(...reviews),
  max: Math.max(...reviews),
  mean: Math.round(mean(reviews)),
  median: median(reviews),
  p25: pct(reviews, 0.25),
  p75: pct(reviews, 0.75)
});

console.log('\n=== Pieces per pack ===');
console.log({
  min: Math.min(...pieces),
  max: Math.max(...pieces),
  mean: mean(pieces).toFixed(1),
  median: median(pieces)
});

// Color frequency
const colorCount = {};
products.forEach((p) =>
  (p.color_family || []).forEach((c) => {
    colorCount[c] = (colorCount[c] || 0) + 1;
  })
);
console.log('\n=== Color frequency ===');
console.log(
  Object.entries(colorCount)
    .sort((a, b) => b[1] - a[1])
);

// Material
const matCount = {};
products.forEach((p) => {
  const m = p.material || '';
  const key = m.includes('rice-paper')
    ? 'rice-paper+metal'
    : m.includes('tissue')
    ? 'tissue-paper'
    : m.includes('basket') || m.includes('wood')
    ? 'paper+basket(3D)'
    : m.includes('plastic') || m.includes('foil')
    ? 'mixed-kit'
    : m.includes('metal') || m.includes('wire')
    ? 'paper+metal/wire'
    : 'paper-only';
  matCount[key] = (matCount[key] || 0) + 1;
});
console.log('\n=== Material category ===');
console.log(matCount);

// Form factor
const formCount = {};
products.forEach((p) => {
  formCount[p.form_factor] = (formCount[p.form_factor] || 0) + 1;
});
console.log('\n=== Form factor ===');
console.log(formCount);

// Style tag
const styleCount = {};
products.forEach((p) => {
  styleCount[p.style_tag] = (styleCount[p.style_tag] || 0) + 1;
});
console.log('\n=== Style tag ===');
console.log(styleCount);

// Gender/theme lean (inferred)
const themeBucket = { 'neutral/boho': 0, girl: 0, boy: 0, multicolor: 0, 'other-occasion': 0 };
products.forEach((p) => {
  const kw = (p.theme_keywords || []).join(' ');
  const style = p.style_tag || '';
  if (/picnic|BBQ|pizza|graduation|school-color/.test(kw)) themeBucket['other-occasion']++;
  else if (/girl|pink(?! blue)/.test(kw) && !/boy|blue/.test(kw)) themeBucket.girl++;
  else if (/boy|ocean|dusty-blue/.test(kw) && !/girl|pink/.test(kw)) themeBucket.boy++;
  else if (/neutral|boho|sage|rustic|woodland/.test(kw)) themeBucket['neutral/boho']++;
  else if (/multicolor|pastel|pink-blue|gender-reveal/.test(kw)) themeBucket.multicolor++;
});
console.log('\n=== Theme lean ===');
console.log(themeBucket);
