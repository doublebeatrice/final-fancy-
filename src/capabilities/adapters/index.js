const adapters = {
  'adv.keyword.update_bid': () => require('./adv_keyword_update_bid'),
  'adv.campaign.update_budget': () => require('./adv_campaign_update_budget'),
  'review.landing_verify': () => require('./review_landing_verify'),
};

function adapterCapabilityIds() {
  return Object.keys(adapters);
}

function getCapabilityAdapter(capabilityId = '') {
  const load = adapters[String(capabilityId || '')];
  return load ? load() : null;
}

module.exports = {
  adapterCapabilityIds,
  getCapabilityAdapter,
};
