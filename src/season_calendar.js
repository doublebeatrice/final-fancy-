const { addDays } = require('./ops_time');

function ymd(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function nthWeekdayOfMonth(year, month, weekday, nth) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return ymd(year, month, 1 + offset + (nth - 1) * 7);
}

function lastWeekdayOfMonth(year, month, weekday) {
  const last = new Date(Date.UTC(year, month, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return ymd(year, month, last.getUTCDate() - offset);
}

function inRange(date, start, end) {
  return date >= start && date <= end;
}

function buildSeasonRules(year) {
  const mothersDay = nthWeekdayOfMonth(year, 5, 0, 2);
  const fathersDay = nthWeekdayOfMonth(year, 6, 0, 3);
  const memorialDay = lastWeekdayOfMonth(year, 5, 1);
  return [
    { key: 'nurse_week', label: 'Nurse Week', themeTokens: ['nurse', 'healthcare', 'medical'], peakStart: ymd(year, 5, 6), peakEnd: ymd(year, 5, 12) },
    { key: 'teacher_appreciation', label: 'Teacher Appreciation', themeTokens: ['teacher', 'school', 'educator'], peakStart: ymd(year, 5, 4), peakEnd: ymd(year, 5, 8) },
    { key: 'mothers_day', label: "Mother's Day", themeTokens: ['mother', 'mothers day', 'mom', 'mama', 'godmother', 'god mother', 'godparent', 'madrina'], peakStart: addDays(mothersDay, -5), peakEnd: mothersDay },
    { key: 'memorial_day', label: 'Memorial Day', themeTokens: ['memorial', 'patriotic', 'remembrance'], peakStart: addDays(memorialDay, -7), peakEnd: memorialDay },
    { key: 'graduation', label: 'Graduation', themeTokens: ['graduation', 'graduate', 'class of', 'senior'], peakStart: ymd(year, 5, 15), peakEnd: ymd(year, 6, 20) },
    { key: 'fathers_day', label: "Father's Day", themeTokens: ['father', 'fathers day', 'dad'], peakStart: addDays(fathersDay, -7), peakEnd: fathersDay },
    { key: 'summer', label: 'Summer', themeTokens: ['summer', 'beach', 'pool', 'tropical', 'camp'], peakStart: ymd(year, 6, 1), peakEnd: ymd(year, 8, 15) },
    { key: 'wedding', label: 'Wedding Season', themeTokens: ['wedding', 'bride', 'bridal', 'bridesmaid'], peakStart: ymd(year, 5, 1), peakEnd: ymd(year, 8, 31) },
  ].map(rule => ({
    ...rule,
    preheatStart: addDays(rule.peakStart, -35),
    preheatEnd: addDays(rule.peakStart, -1),
    tailStart: addDays(rule.peakEnd, 1),
    tailEnd: addDays(rule.peakEnd, 21),
    offseasonStart: addDays(rule.peakEnd, 22),
  }));
}

function getSeasonWindows(dateYmd) {
  const year = Number(String(dateYmd).slice(0, 4));
  const rules = [
    ...buildSeasonRules(year - 1),
    ...buildSeasonRules(year),
    ...buildSeasonRules(year + 1),
  ];
  const active = [];
  for (const rule of rules) {
    let phase = '';
    if (inRange(dateYmd, rule.preheatStart, rule.preheatEnd)) phase = 'preheat';
    else if (inRange(dateYmd, rule.peakStart, rule.peakEnd)) phase = 'peak';
    else if (inRange(dateYmd, rule.tailStart, rule.tailEnd)) phase = 'tail';
    else if (inRange(dateYmd, rule.offseasonStart, addDays(rule.offseasonStart, 90))) phase = 'offseason';
    if (phase) active.push({ ...rule, phase });
  }
  return active.sort((a, b) => {
    const rank = { peak: 0, preheat: 1, tail: 2, offseason: 3 };
    return rank[a.phase] - rank[b.phase] || a.peakStart.localeCompare(b.peakStart);
  });
}

function getUpcomingSeasonWindows(dateYmd, horizonDays = 45) {
  const year = Number(String(dateYmd).slice(0, 4));
  const rules = [
    ...buildSeasonRules(year - 1),
    ...buildSeasonRules(year),
    ...buildSeasonRules(year + 1),
  ];
  const end = addDays(dateYmd, horizonDays);
  return rules
    .filter(rule => rule.peakEnd >= dateYmd && rule.preheatStart <= end)
    .map(rule => {
      let phase = 'upcoming';
      if (inRange(dateYmd, rule.preheatStart, rule.preheatEnd)) phase = 'preheat';
      else if (inRange(dateYmd, rule.peakStart, rule.peakEnd)) phase = 'peak';
      else if (inRange(dateYmd, rule.tailStart, rule.tailEnd)) phase = 'tail';
      const startsInDays = Math.round((Date.parse(`${rule.preheatStart}T00:00:00Z`) - Date.parse(`${dateYmd}T00:00:00Z`)) / 86400000);
      const peakInDays = Math.round((Date.parse(`${rule.peakStart}T00:00:00Z`) - Date.parse(`${dateYmd}T00:00:00Z`)) / 86400000);
      return {
        ...rule,
        phase,
        startsInDays,
        peakInDays,
      };
    })
    .sort((a, b) => {
      const rank = { peak: 0, preheat: 1, upcoming: 2, tail: 3 };
      return rank[a.phase] - rank[b.phase] || a.peakStart.localeCompare(b.peakStart);
    });
}

function matchProductSeason(profile = {}, windows = []) {
  const text = [
    profile.productType,
    ...(profile.productTypes || []),
    ...(profile.targetAudience || []),
    ...(profile.occasion || []),
    ...(profile.seasonality || []),
    ...(profile.visualTheme || []),
    profile.positioning,
    profile.listingTitle,
    profile.categoryPath,
  ].filter(Boolean).join(' ').toLowerCase();
  return windows.filter(window => (window.themeTokens || []).some(token => text.includes(String(token).toLowerCase())));
}

module.exports = {
  buildSeasonRules,
  getSeasonWindows,
  getUpcomingSeasonWindows,
  matchProductSeason,
};
