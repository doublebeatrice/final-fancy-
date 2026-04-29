(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SalesHistoryParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function num(value) {
    const text = clean(value).replace(/[$,，]/g, '').replace('%', '');
    const match = text.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  }

  function parseDate(value) {
    const text = clean(value);
    const match = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (!match) return '';
    return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
  }

  function stripTags(value) {
    return clean(String(value || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&'));
  }

  function pickField(row, patterns) {
    for (const [key, value] of Object.entries(row || {})) {
      if (patterns.some(pattern => pattern.test(key))) return value;
    }
    return '';
  }

  function normalizeRow(raw = {}) {
    const date = parseDate(pickField(raw, [/日期|时间|date|day|month/i]));
    return {
      date,
      salesQty: num(pickField(raw, [/销量|销售数量|sale.*qty|sales.*qty|quantity|qty/i])),
      salesAmount: num(pickField(raw, [/销售额|销售金额|sales.*amount|amount|revenue|gmv/i])),
      orderQty: num(pickField(raw, [/订单|单量|order/i])),
      originalRow: raw,
    };
  }

  function parseWithDom(html) {
    if (typeof DOMParser === 'undefined') return null;
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const tables = [...doc.querySelectorAll('table')];
    const rows = [];
    for (const table of tables) {
      const trs = [...table.querySelectorAll('tr')];
      let headers = [];
      for (const tr of trs) {
        const cells = [...tr.querySelectorAll('th,td')].map(cell => clean(cell.textContent));
        if (!cells.length) continue;
        if (!headers.length && tr.querySelector('th')) {
          headers = cells;
          continue;
        }
        if (!headers.length) headers = cells.map((_, index) => `col_${index + 1}`);
        const raw = {};
        cells.forEach((value, index) => { raw[headers[index] || `col_${index + 1}`] = value; });
        rows.push(raw);
      }
    }
    return rows;
  }

  function parseWithRegex(html) {
    const rows = [];
    const tableMatches = [...String(html || '').matchAll(/<table[\s\S]*?<\/table>/gi)];
    for (const tableMatch of tableMatches) {
      const trs = [...tableMatch[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(match => match[0]);
      let headers = [];
      for (const tr of trs) {
        const cells = [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(match => stripTags(match[1]));
        if (!cells.length) continue;
        if (!headers.length && /<th/i.test(tr)) {
          headers = cells;
          continue;
        }
        if (!headers.length) headers = cells.map((_, index) => `col_${index + 1}`);
        const raw = {};
        cells.forEach((value, index) => { raw[headers[index] || `col_${index + 1}`] = value; });
        rows.push(raw);
      }
    }
    return rows;
  }

  function summarize(rows = [], options = {}) {
    const now = options.currentDate ? new Date(options.currentDate) : new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentMd = `${String(currentMonth).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const cleanRows = rows.filter(row => row.date);
    const byMonth = new Map();
    let recent7Qty = 0;
    let recent30Qty = 0;
    let lastYearSamePeriodQty = 0;
    for (const row of cleanRows) {
      const date = new Date(row.date);
      if (Number.isNaN(date.getTime())) continue;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      byMonth.set(monthKey, (byMonth.get(monthKey) || 0) + row.salesQty);
      const ageDays = Math.floor((now - date) / 86400000);
      if (ageDays >= 0 && ageDays < 7) recent7Qty += row.salesQty;
      if (ageDays >= 0 && ageDays < 30) recent30Qty += row.salesQty;
      if (date.getFullYear() === currentYear - 1) {
        const md = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        if (Math.abs(md.localeCompare(currentMd)) <= 7 || date.getMonth() + 1 === currentMonth) lastYearSamePeriodQty += row.salesQty;
      }
    }
    const monthTotals = [...byMonth.entries()].map(([month, qty]) => ({ month, qty })).sort((a, b) => a.month.localeCompare(b.month));
    const positiveMonths = monthTotals.filter(item => item.qty > 0);
    const peak = [...monthTotals].sort((a, b) => b.qty - a.qty)[0] || null;
    const start = positiveMonths[0] || null;
    const currentMonthQty = monthTotals
      .filter(item => item.month.endsWith(`-${String(currentMonth).padStart(2, '0')}`))
      .reduce((sum, item) => sum + item.qty, 0);
    const isNearHistoricalStart = !!start && Number(start.month.slice(5, 7)) >= currentMonth && Number(start.month.slice(5, 7)) - currentMonth <= 1;
    let seasonStage = 'no_history';
    if (currentMonthQty > 0 && peak && peak.month.endsWith(`-${String(currentMonth).padStart(2, '0')}`)) seasonStage = 'peak';
    else if (currentMonthQty > 0) seasonStage = 'active';
    else if (isNearHistoricalStart) seasonStage = 'warmup';
    else if (positiveMonths.length) seasonStage = 'offseason';
    return {
      lastYearSamePeriodQty,
      recent30Qty,
      recent7Qty,
      historicalPeakMonth: peak ? peak.month.slice(5, 7) : '',
      historicalStartMonth: start ? start.month.slice(5, 7) : '',
      isNearHistoricalStart,
      seasonStage,
      monthTotals,
    };
  }

  function parseSkuSalesHistoryHtml(html, meta = {}, options = {}) {
    const rawRows = parseWithDom(html) || parseWithRegex(html);
    const rows = rawRows.map(normalizeRow).filter(row => row.date || row.salesQty || row.salesAmount || row.orderQty);
    const parseWarning = rows.length ? '' : 'sales history table parsed but no recognizable date/sales fields';
    return {
      sku: meta.sku || '',
      asin: meta.asin || '',
      site: meta.site || '',
      rows,
      summary: summarize(rows, options),
      rawHtmlSnippet: parseWarning ? String(html || '').slice(0, 1200) : '',
      parseWarning,
    };
  }

  return {
    parseSkuSalesHistoryHtml,
    summarize,
  };
});
