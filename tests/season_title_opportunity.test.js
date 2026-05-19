const assert = require('assert');
const { normalizeProtectedListingSkus } = require('../src/listing_copy_protection');
const {
  buildSeasonTitleDryRun,
  campaignNameFor,
  eventSpecificTitleTerms,
  rankTopSalesSkus,
  suggestExpiredOnlyTitle,
} = require('../src/season_title_opportunity');

const events = [
  {
    key: 'mothers_day',
    name: "Mother's Day",
    coreTerm: "mother's day gifts",
    titleTerms: ["Mother's Day", 'Mothers Day', 'mom gifts'],
    nodeStart: '2026-05-10',
    nodeEnd: '2026-05-10',
    highFrequencyStart: '2026-04-19',
    highFrequencyEnd: '2026-05-13',
  },
  {
    key: 'fathers_day',
    name: "Father's Day",
    coreTerm: "father's day gifts",
    titleTerms: ["Father's Day", 'Fathers Day', 'dad gifts'],
    nodeStart: '2026-06-21',
    nodeEnd: '2026-06-21',
    secondStart: '2026-05-22',
    secondEnd: '2026-06-01',
    highFrequencyStart: '2026-05-31',
    highFrequencyEnd: '2026-06-24',
  },
  {
    key: 'graduation',
    name: 'Graduation Season',
    coreTerm: 'graduation gifts',
    titleTerms: ['Graduation', 'Class of 2026'],
    nodeStart: '2026-04-01',
    nodeEnd: '2026-06-15',
  },
];

function card(overrides = {}) {
  return {
    sku: 'DAD1001',
    asin: 'B0DAD1001',
    price: 19.99,
    unitsSold_30d: 5,
    listing: { title: "Dad Pocket Hug Token - Mother's Day Gifts for Dad" },
    createContext: {
      coverage: { hasSpAuto: true, hasSpKeyword: false },
      accountId: 120,
      siteId: 4,
    },
    productProfile: {
      productType: 'jewelry',
      productTypes: ['jewelry'],
      targetAudience: ['dad', 'men'],
      occasion: ['fathers day'],
      visualTheme: ['dad', 'gift'],
      listingTitle: "Dad Pocket Hug Token - Mother's Day Gifts for Dad",
      confidence: 0.85,
    },
    adStats: { '30d': { spend: 18, clicks: 60 } },
    campaigns: [],
    ...overrides,
  };
}

{
  const top = rankTopSalesSkus([
    { sku: 'A', unitsSold_30d: 10 },
    { sku: 'B', unitsSold_30d: 40 },
    { sku: 'C', unitsSold_30d: 20 },
  ], 2);
  assert.deepStrictEqual([...top], ['B', 'C']);
}

{
  assert.strictEqual(campaignNameFor('broad', "Father's Day Gifts", 'DAD1001'), "broad - father's day gifts - DAD1001");
}

{
  const result = buildSeasonTitleDryRun({
    snapshot: { productCards: [card()] },
    events,
    businessDate: '2026-05-15',
    topSalesLimit: 0,
  });
  const item = result.items[0];
  assert.strictEqual(item.sku, 'DAD1001');
  assert.strictEqual(item.selectedEvent.key, 'fathers_day');
  assert.strictEqual(item.expiredTitleEvents[0].key, 'mothers_day');
  assert.strictEqual(item.titleDecision, 'auto_execute');
  assert.ok(item.suggestedTitle.includes("Father's Day Gifts"));
  assert.strictEqual(item.adActions.length, 1);
  assert.strictEqual(item.adActions[0].mode, 'broad');
  assert.strictEqual(item.adActions[0].dailyBudget, 3);
  assert.strictEqual(item.adActions[0].defaultBid, 0.26);
}

{
  const result = buildSeasonTitleDryRun({
    snapshot: { productCards: [card()] },
    events,
    businessDate: '2026-05-15',
    topSalesLimit: 0,
    protectedListingSkus: normalizeProtectedListingSkus(['DAD1001']),
  });
  const item = result.items[0];
  assert.strictEqual(item.titleDecision, 'protected_listing_hold');
  assert.strictEqual(item.suggestedTitle, item.currentTitle);
  assert.ok(item.listingProtection.reason.includes('preserve'));
  assert.strictEqual(result.summary.protectedListingHolds, 1);
}

{
  const result = buildSeasonTitleDryRun({
    snapshot: { productCards: [card({ saleStatus: '保留页面' })] },
    events,
    businessDate: '2026-05-15',
    topSalesLimit: 0,
  });
  const item = result.items[0];
  assert.strictEqual(item.titleDecision, 'protected_listing_hold');
  assert.strictEqual(item.suggestedTitle, item.currentTitle);
  assert.strictEqual(item.listingProtection.source, 'saleStatus');
}

{
  const result = buildSeasonTitleDryRun({
    snapshot: {
      productCards: [
        card({ sku: 'TOP001', unitsSold_30d: 500 }),
        ...Array.from({ length: 50 }, (_, index) => card({ sku: `SKU${String(index).padStart(3, '0')}`, unitsSold_30d: 499 - index })),
      ],
    },
    events,
    businessDate: '2026-05-15',
    topSalesLimit: 50,
  });
  const topItem = result.items.find(item => item.sku === 'TOP001');
  assert.strictEqual(topItem.titleDecision, 'operator_approval_required');
  assert.strictEqual(topItem.adDecision, 'operator_approval_required');
  assert.strictEqual(topItem.adActions.length, 0);
}

{
  const result = buildSeasonTitleDryRun({
    snapshot: {
      productCards: [card({
        sku: 'NEW001',
        price: 9.99,
        opendate: '2026-05-01',
        adStats: { '30d': { spend: 0, clicks: 0 } },
        createContext: {
          coverage: { hasSpAuto: false, hasSpKeyword: false },
          accountId: 120,
          siteId: 4,
        },
      })],
    },
    events,
    businessDate: '2026-05-15',
    topSalesLimit: 0,
  });
  const actions = result.items[0].adActions;
  assert.deepStrictEqual(actions.map(action => action.mode), ['auto', 'broad']);
  assert.ok(actions.every(action => action.defaultBid <= 0.3));
}

{
  const result = buildSeasonTitleDryRun({
    snapshot: {
      productCards: [card({
        sku: 'MISS001',
        listing: null,
        productProfile: {
          productType: 'gift',
          targetAudience: ['dad'],
          occasion: ['fathers day'],
          visualTheme: ['dad'],
          confidence: 0.8,
        },
      })],
    },
    events,
    businessDate: '2026-05-15',
    topSalesLimit: 0,
  });
  const item = result.items[0];
  assert.strictEqual(item.titleDecision, 'review_missing_current_title');
  assert.strictEqual(item.adDecision, 'review_missing_current_title');
  assert.strictEqual(item.adActions.length, 0);
}

{
  const result = buildSeasonTitleDryRun({
    snapshot: {
      productCards: [card({
        sku: 'OLD001',
        listing: { title: "Mom Keepsake Token - Mother's Day Gifts" },
        productProfile: {
          productType: 'jewelry',
          targetAudience: ['mom'],
          occasion: ['mothers day'],
          visualTheme: ['mom'],
          listingTitle: "Mom Keepsake Token - Mother's Day Gifts",
          confidence: 0.8,
        },
      })],
    },
    events: [events[0]],
    businessDate: '2026-05-15',
    topSalesLimit: 0,
  });
  const item = result.items[0];
  assert.strictEqual(item.titleDecision, 'auto_execute');
  assert.ok(item.suggestedTitle.includes('Mom Gifts'));
  assert.strictEqual(/Mother's Day/i.test(item.suggestedTitle), false);
  assert.strictEqual(item.adActions.length, 0);
}

{
  const earthDay = {
    key: 'earth_day',
    name: 'Earth Day',
    coreTerm: 'volunteer appreciation gifts',
    titleTerms: ['Earth Day', 'volunteer appreciation gifts', 'thank you cards', 'pocket hug'],
    nodeStart: '2026-04-22',
    nodeEnd: '2026-04-22',
  };
  const terms = eventSpecificTitleTerms(earthDay);
  assert.ok(terms.includes('Earth Day'));
  assert.strictEqual(terms.includes('thank you cards'), false);
  assert.strictEqual(terms.includes('volunteer appreciation gifts'), false);
  const result = buildSeasonTitleDryRun({
    snapshot: {
      productCards: [card({
        sku: 'THANKYOU001',
        listing: { title: 'Medical Laboratory Gifts with Thank You Cards for Lab Technicians' },
        productProfile: {
          productType: 'gift',
          targetAudience: ['lab technicians'],
          occasion: ['lab week'],
          visualTheme: ['medical laboratory'],
          listingTitle: 'Medical Laboratory Gifts with Thank You Cards for Lab Technicians',
          confidence: 0.8,
        },
      })],
    },
    events: [earthDay],
    businessDate: '2026-05-15',
    topSalesLimit: 0,
  });
  assert.strictEqual(result.items.length, 0);
}

{
  const randomActs = {
    key: 'random_acts_of_kindness_day_week',
    name: 'Random Acts of Kindness Day / Week',
    coreTerm: 'kindness gifts',
    titleTerms: ['Random Acts of Kindness Day / Week', 'kindness gifts', 'pocket hug', 'affirmation cards'],
    nodeStart: '2026-02-17',
    nodeEnd: '2026-02-17',
  };
  const terms = eventSpecificTitleTerms(randomActs);
  assert.strictEqual(terms.includes('week'), false);
  assert.strictEqual(terms.includes('week gifts'), false);
  assert.deepStrictEqual(
    buildSeasonTitleDryRun({
      snapshot: {
        productCards: [card({
          sku: 'HOLYWEEK001',
          listing: { title: 'Religious Easter Crafts Holy Week Craft Kit with Jesus Stickers' },
          productProfile: {
            productType: 'craft kit',
            targetAudience: ['church'],
            occasion: ['easter'],
            visualTheme: ['easter'],
            listingTitle: 'Religious Easter Crafts Holy Week Craft Kit with Jesus Stickers',
            confidence: 0.8,
          },
        })],
      },
      events: [randomActs],
      businessDate: '2026-05-15',
      topSalesLimit: 0,
    }).items,
    []
  );
}

{
  const labWeek = {
    key: 'medical_laboratory_professionals_week_lab_week',
    name: 'Medical Laboratory Professionals Week / Lab Week',
    coreTerm: 'lab tech gifts',
    titleTerms: ['Medical Laboratory Professionals Week / Lab Week', 'lab tech gifts', 'medical laboratory gifts'],
    nodeStart: '2026-04-19',
    nodeEnd: '2026-04-25',
  };
  const title = 'Kenning Lab Week Gifts for Medical Laboratory Professionals, Science Enamel Pins with Thank You Cards';
  assert.strictEqual(
    suggestExpiredOnlyTitle(title, [labWeek]),
    'Kenning Lab Tech Gifts for Medical Laboratory Professionals, Science Enamel Pins with Thank You Cards'
  );
  const result = buildSeasonTitleDryRun({
    snapshot: {
      productCards: [card({
        sku: 'LAB001',
        listing: { title },
        productProfile: {
          productType: 'gift',
          targetAudience: ['lab technicians'],
          occasion: ['lab week'],
          visualTheme: ['medical laboratory'],
          listingTitle: title,
          confidence: 0.8,
        },
      })],
    },
    events: [labWeek],
    businessDate: '2026-05-15',
    topSalesLimit: 0,
  });
  const item = result.items[0];
  assert.strictEqual(item.titleDecision, 'auto_execute');
  assert.ok(item.suggestedTitle.includes('Lab Tech Gifts'));
  assert.strictEqual(/Lab Week/i.test(item.suggestedTitle), false);
}

{
  const easter = {
    key: 'easter',
    name: 'Easter',
    coreTerm: 'easter basket fillers',
    titleTerms: ['Easter', 'easter basket fillers', 'christian easter gifts'],
    nodeStart: '2026-04-05',
    nodeEnd: '2026-04-05',
  };
  const result = buildSeasonTitleDryRun({
    snapshot: {
      productCards: [card({
        sku: 'EASTER001',
        listing: { title: 'Religious Easter Craft Kit with Jesus Stickers for Church Activities' },
        productProfile: {
          productType: 'craft kit',
          targetAudience: ['church'],
          occasion: ['easter'],
          visualTheme: ['easter'],
          listingTitle: 'Religious Easter Craft Kit with Jesus Stickers for Church Activities',
          confidence: 0.8,
        },
      })],
    },
    events: [easter],
    businessDate: '2026-05-15',
    topSalesLimit: 0,
  });
  const item = result.items[0];
  assert.strictEqual(item.titleDecision, 'review_expired_title_no_replacement');
  assert.strictEqual(item.currentTitle, item.suggestedTitle);
}

{
  const result = buildSeasonTitleDryRun({
    snapshot: {
      productCards: [card({
        sku: 'READY001',
        listing: { title: "Dad Pocket Hug Token - Father's Day Gifts for Dad" },
        productProfile: {
          productType: 'jewelry',
          targetAudience: ['dad'],
          occasion: ['fathers day'],
          visualTheme: ['dad'],
          listingTitle: "Dad Pocket Hug Token - Father's Day Gifts for Dad",
          confidence: 0.8,
        },
      })],
    },
    events,
    businessDate: '2026-05-15',
    topSalesLimit: 0,
  });
  const item = result.items[0];
  assert.strictEqual(item.titleDecision, 'no_title_change_required');
  assert.strictEqual(result.summary.autoExecutable, 0);
  assert.ok(item.adActions.length > 0);
}

{
  const lowFitEvents = [
    events[0],
    {
      key: 'mental_health',
      name: 'Mental Health Awareness Month',
      coreTerm: 'mental health awareness month gifts',
      titleTerms: ['Mental Health Awareness Month', 'Mental Health Awareness Month Gifts'],
      nodeStart: '2026-06-01',
      nodeEnd: '2026-06-30',
    },
  ];
  const result = buildSeasonTitleDryRun({
    snapshot: {
      productCards: [card({
        sku: 'LOWFIT001',
        listing: { title: "Generic Storage Bag - Mother's Day Gifts" },
        productProfile: {
          productType: 'gift',
          targetAudience: [],
          occasion: [],
          visualTheme: ['storage'],
          listingTitle: "Generic Storage Bag - Mother's Day Gifts",
          confidence: 0.8,
        },
      })],
    },
    events: lowFitEvents,
    businessDate: '2026-05-15',
    topSalesLimit: 0,
  });
  const item = result.items[0];
  assert.strictEqual(item.titleDecision, 'review_expired_title_no_replacement');
  assert.strictEqual(item.adDecision, 'no_action');
  assert.strictEqual(item.adActions.length, 0);
}

{
  const mentalHealth = {
    key: 'mental_health_awareness_month',
    name: 'Mental Health Awareness Month',
    coreTerm: 'mental health awareness month gifts',
    titleTerms: ['Mental Health Awareness Month', 'mental health awareness month gifts'],
    nodeStart: '2026-05-01',
    nodeEnd: '2026-05-31',
  };
  const result = buildSeasonTitleDryRun({
    snapshot: {
      productCards: [card({
        sku: 'JUNE001',
        listing: { title: 'Bucherry Black History Cupcake Toppers Black History Month Decorations Mini Round Acrylic DIY Charms' },
        productProfile: {
          productType: 'party supplies',
          productTypes: ['party supplies'],
          targetAudience: ['women', 'men'],
          occasion: [],
          visualTheme: ['black', 'red', 'green'],
          listingTitle: 'Bucherry Black History Cupcake Toppers Black History Month Decorations Mini Round Acrylic DIY Charms',
          confidence: 0.75,
        },
        createContext: {
          keywordSeeds: ['juneteenth party supplies', 'juneteenth cupcake decorations', 'juneteenth decorations'],
        },
      })],
    },
    events: [mentalHealth],
    businessDate: '2026-05-18',
    topSalesLimit: 0,
  });
  assert.strictEqual(result.items.length, 0);
}

{
  const currentTitle = 'A'.repeat(195);
  const result = buildSeasonTitleDryRun({
    snapshot: {
      productCards: [card({
        sku: 'LONG001',
        listing: { title: currentTitle },
        productProfile: {
          productType: 'pool float',
          targetAudience: ['men'],
          occasion: ['summer'],
          visualTheme: ['summer'],
          listingTitle: currentTitle,
          confidence: 0.8,
        },
      })],
    },
    events: [{
      key: 'summer',
      name: 'Summer Product Season',
      coreTerm: 'summer party supplies',
      titleTerms: ['summer party supplies', 'pool party decoration', 'summer outdoor'],
      nodeStart: '2026-03-15',
      nodeEnd: '2026-09-30',
    }],
    businessDate: '2026-05-15',
    topSalesLimit: 0,
  });
  const item = result.items[0];
  assert.ok(item.suggestedTitle.length <= 200);
  assert.ok(item.suggestedTitle.includes('Summer Party Supplies'));
}

{
  const title = 'HyDren Inflatable Number Pool Float Birthday Pool Party Decoration, Summer Outdoor Floating Fun';
  const result = buildSeasonTitleDryRun({
    snapshot: {
      productCards: [card({
        sku: 'SUMREADY001',
        listing: { title },
        productProfile: {
          productType: 'pool float',
          targetAudience: ['adults'],
          occasion: ['summer'],
          visualTheme: ['summer', 'pool party'],
          listingTitle: title,
          confidence: 0.8,
        },
      })],
    },
    events: [{
      key: 'summer',
      name: 'Summer Product Season',
      coreTerm: 'summer party supplies',
      titleTerms: ['summer party supplies', 'pool party decoration', 'summer outdoor'],
      nodeStart: '2026-03-15',
      nodeEnd: '2026-09-30',
    }],
    businessDate: '2026-05-15',
    topSalesLimit: 0,
  });
  const item = result.items[0];
  assert.strictEqual(item.titleDecision, 'no_title_change_required');
  assert.strictEqual(/Summer Product Season/i.test(item.suggestedTitle), false);
}

{
  const title = 'HyDren 48 Inch Inflatable Number Pool Float Birthday Party Decoration';
  const result = buildSeasonTitleDryRun({
    snapshot: {
      productCards: [card({
        sku: 'SUMINTERNAL001',
        listing: { title },
        productProfile: {
          productType: 'pool float',
          targetAudience: ['adults'],
          occasion: ['summer'],
          visualTheme: ['summer', 'pool party'],
          listingTitle: title,
          confidence: 0.8,
        },
      })],
    },
    events: [{
      key: 'summer_product_season',
      name: 'Summer Product Season',
      coreTerm: 'summer product season',
      titleTerms: ['Summer Product Season', 'summer product season'],
      nodeStart: '2026-03-15',
      nodeEnd: '2026-09-30',
    }],
    businessDate: '2026-05-15',
    topSalesLimit: 0,
  });
  const item = result.items[0];
  assert.strictEqual(item.titleDecision, 'auto_execute');
  assert.strictEqual(/Summer Product Season/i.test(item.suggestedTitle), false);
  assert.strictEqual(item.adActions.some(action =>
    /summer product season/i.test(`${action.campaignName} ${action.groupName} ${(action.keywords || []).join(' ')}`)
  ), false);
  assert.strictEqual(item.adActions.some(action =>
    /\bunknown\b|for\s*$/i.test((action.keywords || []).join(' | '))
  ), false);
}

{
  const title = 'HyDren Inflatable Number Pool Float Birthday Decoration';
  const result = buildSeasonTitleDryRun({
    snapshot: {
      productCards: [card({
        sku: 'SUMUNKNOWN001',
        listing: { title },
        productProfile: {
          productType: 'unknown',
          targetAudience: ['unknown'],
          occasion: ['summer'],
          visualTheme: ['summer', 'pool party'],
          listingTitle: title,
          confidence: 0.8,
        },
      })],
    },
    events: [{
      key: 'summer_product_season',
      name: 'Summer Product Season',
      coreTerm: 'summer product season',
      titleTerms: ['Summer Product Season', 'summer product season'],
      nodeStart: '2026-03-15',
      nodeEnd: '2026-09-30',
    }],
    businessDate: '2026-05-15',
    topSalesLimit: 0,
  });
  const keywords = result.items[0].adActions.flatMap(action => action.keywords || []);
  assert.strictEqual(keywords.some(term => /\bunknown\b|for\s*$/i.test(term)), false);
}

{
  const title = 'Blulu VIP Party Decorations Movie Night Banner 1920s Party Supplies';
  const result = buildSeasonTitleDryRun({
    snapshot: {
      productCards: [card({
        sku: 'NOSUMMER001',
        listing: { title },
        productProfile: {
          productType: 'party supplies',
          productTypes: ['party supplies'],
          targetAudience: [],
          occasion: ['party'],
          visualTheme: ['movie night'],
          listingTitle: title,
          confidence: 0.8,
        },
      })],
    },
    events: [{
      key: 'summer_product_season',
      name: 'Summer Product Season',
      coreTerm: 'summer party supplies',
      titleTerms: ['summer party supplies', 'pool party decoration', 'summer outdoor'],
      nodeStart: '2026-03-15',
      nodeEnd: '2026-09-30',
    }],
    businessDate: '2026-05-15',
    topSalesLimit: 0,
  });
  assert.strictEqual(result.items.length, 0);
}

{
  const result = buildSeasonTitleDryRun({
    snapshot: {
      productCards: [card({
        sku: 'WED001',
        listing: { title: 'Lewtemi Mexican Duck Piñata for Birthday Party Cinco de Mayo Fiesta Decorations with Piñata Stick Blindfold Confetti Set' },
        productProfile: {
          productType: 'party gifts',
          targetAudience: ['bridal'],
          occasion: ['bridal party'],
          visualTheme: ['fiesta', 'wedding favor gifts'],
          listingTitle: 'Lewtemi Mexican Duck Piñata for Birthday Party Cinco de Mayo Fiesta Decorations with Piñata Stick Blindfold Confetti Set',
          confidence: 0.8,
        },
      })],
    },
    events: [{
      key: 'wedding',
      name: 'Wedding Season',
      coreTerm: 'bridal party gifts',
      titleTerms: ['Bridal Party Gifts'],
      nodeStart: '2026-05-01',
      nodeEnd: '2026-08-31',
    }, {
      key: 'cinco_de_mayo',
      name: 'Cinco de Mayo',
      coreTerm: 'cinco de mayo fiesta',
      titleTerms: ['Cinco de Mayo'],
      nodeStart: '2026-05-05',
      nodeEnd: '2026-05-05',
    }],
    businessDate: '2026-05-15',
    topSalesLimit: 0,
  });
  const item = result.items[0];
  assert.strictEqual(item.titleDecision, 'auto_execute');
  assert.ok(item.suggestedTitle.includes('Wedding Favor Gifts'));
  assert.strictEqual(/Bridal Party Gifts/i.test(item.suggestedTitle), false);
}

{
  const result = buildSeasonTitleDryRun({
    snapshot: {
      productCards: [card({
        sku: 'FIESTA001',
        listing: { title: 'Lewtemi Mexican Donkey Pinata for Birthday Party Cinco de Mayo Fiesta Decorations with Stick Blindfold Confetti Set' },
        productProfile: {
          productType: 'party decor',
          targetAudience: [],
          occasion: ['birthday party'],
          visualTheme: ['fiesta'],
          listingTitle: 'Lewtemi Mexican Donkey Pinata for Birthday Party Cinco de Mayo Fiesta Decorations with Stick Blindfold Confetti Set',
          confidence: 0.8,
        },
      })],
    },
    events: [{
      key: 'wedding',
      name: 'Wedding Season',
      coreTerm: 'bridal party gifts',
      titleTerms: ['Bridal Party Gifts'],
      nodeStart: '2026-05-01',
      nodeEnd: '2026-08-31',
    }, {
      key: 'cinco_de_mayo',
      name: 'Cinco de Mayo',
      coreTerm: 'party favors',
      titleTerms: ['Cinco de Mayo'],
      nodeStart: '2026-05-05',
      nodeEnd: '2026-05-05',
    }],
    businessDate: '2026-05-15',
    topSalesLimit: 0,
  });
  const item = result.items[0];
  assert.strictEqual(item.titleDecision, 'auto_execute');
  assert.ok(item.suggestedTitle.includes('Fiesta'));
  assert.strictEqual(/Wedding Season/i.test(item.suggestedTitle), false);
  assert.strictEqual(/Cinco de Mayo/i.test(item.suggestedTitle), false);
}

console.log('season_title_opportunity tests passed');
