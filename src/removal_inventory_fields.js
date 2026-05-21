const REMOVAL_INVENTORY_ROUTE = '/internalControl/inventory/index';
const REMOVAL_INVENTORY_ADD_VIEW_ROUTE = '/internalControl/internal_control_inventory_add_view';

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeLabel(value) {
  return text(value)
    .replace(/^[*:\uff1a\s]+|[*:\uff1a\s]+$/g, '')
    .replace(/[\uff1a:]+$/g, '')
    .trim();
}

function unique(items) {
  const seen = new Set();
  const result = [];
  for (const item of items || []) {
    const value = text(item);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function redactUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  return raw
    .replace(/(Inventory-Token=)[^&#]+/gi, '$1<redacted>')
    .replace(/((?:jwt|token|csrf)[_-]?(?:token)?=)[^&#]+/gi, '$1<redacted>');
}

function inferRoute(raw) {
  const urls = [
    raw?.page?.url,
    ...(raw?.frames || []).map(frame => frame.url),
  ].map(text).filter(Boolean);
  const url = urls.find(item => item.includes(REMOVAL_INVENTORY_ROUTE)) || urls[0] || '';
  try {
    return new URL(url).pathname || REMOVAL_INVENTORY_ROUTE;
  } catch (_) {
    return url.includes(REMOVAL_INVENTORY_ROUTE) ? REMOVAL_INVENTORY_ROUTE : '';
  }
}

function normalizeControl(control = {}) {
  const label = normalizeLabel(
    control.label ||
    control.placeholder ||
    control.name ||
    control.id ||
    control.type
  );
  if (!label && !text(control.name) && !text(control.id)) return null;
  return {
    label,
    name: text(control.name),
    id: text(control.id),
    type: text(control.type || 'text'),
    value: text(control.value),
    placeholder: text(control.placeholder),
    options: unique(control.options || []).slice(0, 30),
  };
}

function selectBestTable(frames = []) {
  let best = { headers: [], rows: [] };
  let bestScore = 0;
  for (const frame of frames) {
    const table = frame?.table || {};
    const headers = unique(table.headers || []);
    const rows = Array.isArray(table.rows) ? table.rows : [];
    const score = headers.length * 100 + rows.length;
    if (score > bestScore) {
      best = { headers, rows };
      bestScore = score;
    }
  }
  return best;
}

function rowsToObjects(headers, rows, previewLimit) {
  return (rows || []).slice(0, previewLimit).map(row => {
    const output = {};
    headers.forEach((header, index) => {
      output[header || `col_${index + 1}`] = text(row?.[index]);
    });
    return output;
  });
}

function dedupeFilters(filters) {
  const seen = new Set();
  const result = [];
  for (const filter of filters) {
    const key = [
      normalizeLabel(filter.label),
      text(filter.name),
      text(filter.id),
      text(filter.type),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(filter);
  }
  return result;
}

function aggregateAddViewFields(fields) {
  const byKey = new Map();
  for (const field of fields) {
    const key = text(field.name || field.id);
    if (!key) continue;
    const existing = byKey.get(key) || {
      ...field,
      options: [],
      value: '',
      readonly: field.readonly === true,
      disabled: field.disabled === true,
    };
    if (field.label) existing.label = field.label;
    if (field.name) existing.name = field.name;
    if (field.id) existing.id = field.id;
    if (field.type) existing.type = field.type;
    if (field.placeholder) existing.placeholder = field.placeholder;
    if (field.value && field.readonly) existing.value = field.value;
    existing.readonly = existing.readonly || field.readonly === true;
    existing.disabled = existing.disabled || field.disabled === true;
    const optionCandidates = [
      ...(field.options || []),
      ...((field.type === 'radio' && field.value) ? [field.value] : []),
    ];
    existing.options = unique([...(existing.options || []), ...optionCandidates]);
    byKey.set(key, existing);
  }
  return Array.from(byKey.values());
}

function parseRemovalInventoryPageInspection(raw = {}, options = {}) {
  const previewLimit = Number.isFinite(Number(options.previewLimit))
    ? Math.max(0, Number(options.previewLimit))
    : 10;
  const frames = Array.isArray(raw.frames) ? raw.frames : [];
  const filters = [];
  for (const frame of frames) {
    for (const control of frame.controls || []) {
      const normalized = normalizeControl(control);
      if (normalized) filters.push(normalized);
    }
  }
  const uniqueFilters = dedupeFilters(filters);

  const table = selectBestTable(frames);
  const columns = unique(table.headers || []);
  const rows = Array.isArray(table.rows) ? table.rows : [];
  const summaryFields = unique(frames.flatMap(frame => frame.summaryTexts || [])).slice(0, 40);
  const endpointHints = unique(frames.flatMap(frame => frame.endpointHints || [])).slice(0, 40);
  const actions = unique(frames.flatMap(frame => frame.buttons || [])).slice(0, 40);
  const warnings = [];
  if (!uniqueFilters.length) warnings.push('no_filter_fields_detected');
  if (!columns.length) warnings.push('no_table_columns_detected');
  if (!rows.length) warnings.push('no_visible_rows_detected');

  return {
    generatedAt: text(raw.capturedAt) || new Date().toISOString(),
    readOnly: true,
    boundary: [
      'read_only',
      'no_clicks',
      'no_submit_no_delete_no_removal_application',
      'do_not_persist_tokens_cookies_or_csrf',
    ],
    page: {
      route: inferRoute(raw),
      url: redactUrl(raw.page?.url),
      title: text(raw.page?.title),
      frameCount: frames.length,
    },
    filters: uniqueFilters,
    actions,
    table: {
      columns,
      visibleRowCount: rows.length,
      previewRows: rowsToObjects(columns, rows, previewLimit),
    },
    summaryFields,
    endpointHints,
    warnings,
  };
}

function parseRemovalInventoryAddViewInspection(raw = {}, options = {}) {
  const fields = [];
  for (const item of raw.formItems || []) {
    const label = normalizeLabel(item.label || item.text);
    for (const input of item.inputs || []) {
      const normalized = normalizeControl({
        ...input,
        label,
      });
      if (normalized) {
        fields.push({
          ...normalized,
          readonly: input.readonly === true || input.readOnly === true,
          disabled: input.disabled === true,
        });
      }
    }
  }
  const uniqueFields = aggregateAddViewFields(fields);
  const readOnlyValues = uniqueFields
    .filter(item => item.readonly && item.value)
    .map(item => ({
      label: item.label,
      name: item.name,
      value: item.value,
    }));
  const writableFields = uniqueFields
    .filter(item => !item.readonly && !item.disabled)
    .map(item => ({
      label: item.label,
      name: item.name,
      type: item.type,
      options: item.options,
    }));
  const endpointHints = unique(raw.endpoints || []);
  const warnings = [];
  if (!uniqueFields.length) warnings.push('no_add_view_fields_detected');
  if (endpointHints.some(item => item.includes('/internalControl/inventory/add'))) {
    warnings.push('write_endpoint_detected_but_not_called');
  }

  return {
    generatedAt: text(raw.capturedAt) || new Date().toISOString(),
    readOnly: true,
    boundary: [
      'read_only',
      'open_view_only',
      'no_submit_no_add_no_delete_no_removal_application',
      'do_not_persist_tokens_cookies_or_csrf',
    ],
    page: {
      route: REMOVAL_INVENTORY_ADD_VIEW_ROUTE,
      url: redactUrl(raw.url),
      title: text(raw.title),
    },
    sku: text(raw.sku),
    aid: text(raw.aid),
    sections: unique(raw.sections || []),
    fields: uniqueFields,
    writableFields,
    readOnlyValues,
    actions: unique((raw.buttons || []).map(button => typeof button === 'string' ? button : button.text)),
    endpointHints,
    warnings,
  };
}

module.exports = {
  REMOVAL_INVENTORY_ADD_VIEW_ROUTE,
  REMOVAL_INVENTORY_ROUTE,
  normalizeLabel,
  parseRemovalInventoryAddViewInspection,
  parseRemovalInventoryPageInspection,
  redactUrl,
};
