const DEFAULT_SITE_TIMEZONE = 'America/Los_Angeles';
const DEFAULT_DATA_LAG_DAYS = 1;

function pad(value) {
  return String(value).padStart(2, '0');
}

function partsInTimezone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function formatDateParts(parts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function addDays(ymd, days) {
  const [year, month, day] = String(ymd).split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

function resolveSiteTimezone(site = '') {
  const text = String(site || '').trim();
  if (/Amazon\.co\.uk/i.test(text)) return 'Europe/London';
  if (/Amazon\.de/i.test(text)) return 'Europe/Berlin';
  if (/Amazon\.ca/i.test(text)) return 'America/Toronto';
  if (/Amazon\.com/i.test(text) || !text) return DEFAULT_SITE_TIMEZONE;
  return DEFAULT_SITE_TIMEZONE;
}

function buildOpsTimeContext(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const siteTimezone = options.siteTimezone || resolveSiteTimezone(options.site);
  const siteParts = partsInTimezone(now, siteTimezone);
  const localTimezone = options.localTimezone || 'Asia/Shanghai';
  const localParts = partsInTimezone(now, localTimezone);
  const businessDate = options.businessDate || formatDateParts(siteParts);
  const localDate = options.localDate || formatDateParts(localParts);
  const dataLagDays = Number.isFinite(Number(options.dataLagDays)) ? Number(options.dataLagDays) : DEFAULT_DATA_LAG_DAYS;
  const dataDate = options.dataDate || addDays(businessDate, -dataLagDays);
  const sourceRunId = options.sourceRunId || `ops_${now.toISOString().replace(/[:.]/g, '-')}`;
  return {
    runAt: now.toISOString(),
    businessDate,
    localDate,
    dataDate,
    siteTimezone,
    localTimezone,
    sourceRunId,
    siteLocalTime: `${formatDateParts(siteParts)}T${pad(siteParts.hour)}:${pad(siteParts.minute)}:${pad(siteParts.second)}`,
    localTime: `${formatDateParts(localParts)}T${pad(localParts.hour)}:${pad(localParts.minute)}:${pad(localParts.second)}`,
    dataLagDays,
  };
}

function attachTimeToAction(action = {}, timeContext = {}) {
  return {
    ...action,
    runAt: action.runAt || timeContext.runAt,
    businessDate: action.businessDate || timeContext.businessDate,
    localDate: action.localDate || timeContext.localDate,
    dataDate: action.dataDate || timeContext.dataDate,
    siteTimezone: action.siteTimezone || timeContext.siteTimezone,
    localTimezone: action.localTimezone || timeContext.localTimezone,
    sourceRunId: action.sourceRunId || timeContext.sourceRunId,
  };
}

function attachTimeToPlan(plan = [], timeContext = {}) {
  return (plan || []).map(item => ({
    ...item,
    runAt: item.runAt || timeContext.runAt,
    businessDate: item.businessDate || timeContext.businessDate,
    localDate: item.localDate || timeContext.localDate,
    dataDate: item.dataDate || timeContext.dataDate,
    siteTimezone: item.siteTimezone || timeContext.siteTimezone,
    localTimezone: item.localTimezone || timeContext.localTimezone,
    sourceRunId: item.sourceRunId || timeContext.sourceRunId,
    actions: (item.actions || []).map(action => attachTimeToAction(action, timeContext)),
  }));
}

module.exports = {
  DEFAULT_SITE_TIMEZONE,
  addDays,
  attachTimeToAction,
  attachTimeToPlan,
  buildOpsTimeContext,
  resolveSiteTimezone,
};
