const QUERY_ENDPOINT = 'https://sellerinventory.yswg.com.cn/pm/edit_apply/query';
const DELETE_ENDPOINT = 'https://sellerinventory.yswg.com.cn/pm/edit_apply/delete';

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sellerList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(',');
  return text(value);
}

function normalizeEditApplyQuery(input = {}) {
  return {
    page: Number(input.page || 1) || 1,
    limit: Number(input.limit || 50) || 50,
    sku: text(input.sku),
    relativeSku: text(input.relativeSku || input.relative_sku),
    productAuditId: text(input.productAuditId || input.product_audit_id),
    skuSn: text(input.skuSn || input.sku_sn),
    startTime: text(input.startTime || input.start_time),
    endTime: text(input.endTime || input.end_time),
    createdStart: text(input.createdStart || input.created_start),
    createdEnd: text(input.createdEnd || input.created_end),
    applierName: text(input.applierName || input.applier_name),
    reason: text(input.reason),
    remark: text(input.remark),
    seller: sellerList(input.seller || 'HJ17,HJ171,HJ172'),
    id: text(input.id),
    status: text(input.status),
    queryType: Number(input.queryType || input.query_type || 3) || 3,
  };
}

function buildEditApplyQueryForm(input = {}) {
  const query = normalizeEditApplyQuery(input);
  const params = new URLSearchParams();
  const fields = {
    page: query.page,
    limit: query.limit,
    sku: query.sku,
    relative_sku: query.relativeSku,
    product_audit_id: query.productAuditId,
    sku_sn: query.skuSn,
    start_time: query.startTime,
    end_time: query.endTime,
    created_start: query.createdStart,
    created_end: query.createdEnd,
    send_to_editor_start: '',
    send_to_editor_end: '',
    copywriting_start: '',
    copywriting_end: '',
    applier_name: query.applierName,
    applier_dept: '',
    checker_name: '',
    checked_name: '',
    language_type: '',
    purchaser_group: '',
    deal_ids: '',
    audit_man: '',
    status: query.status,
    modify: '',
    modify_relative: '',
    upload_site: '',
    dept: '',
    ch_status: '',
    en_status: '',
    collect_status: '',
    backstage_status: '',
    reason: query.reason,
    sellerDept: '',
    sellerGroup: '',
    seller: query.seller,
    id: query.id,
    is_package_level_product: '',
    follow_sku: '',
    copywriting_checker: '',
    remark: query.remark,
    no_pass_reason: '',
    solr_term: '',
    success_flag: '',
    is_urgent: '',
    incentives_status: '',
    edit_site: '',
    query_type: query.queryType,
    copyrightor_group: '',
  };
  for (const [key, value] of Object.entries(fields)) params.set(key, String(value ?? ''));
  return params;
}

function buildEditApplyDeleteForm(input = {}) {
  const id = text(input.id);
  if (!id) throw new Error('missing edit application id');
  const params = new URLSearchParams();
  params.set('_token', text(input.csrf || input.token || input._token));
  params.set('id', id);
  return params;
}

function extractEditApplyRows(response = {}) {
  const candidates = [
    response.rows,
    response.data,
    response.data?.rows,
    response.data?.list,
    response.data?.data,
    response.result,
    response.result?.rows,
    response.result?.list,
  ];
  const rows = candidates.find(Array.isArray) || [];
  return rows.map(row => ({
    ...row,
    id: text(row.id || row.product_audit_id || row.productAuditId),
    sku: text(row.sku),
    relativeSku: text(row.relative_sku || row.relativeSku),
    reason: text(row.reason),
    remark: text(row.remark),
    status: text(row.status || row.status_text || row.statusText),
    applierName: text(row.applier_name || row.applierName),
    createdAt: text(row.created_at || row.createdAt || row.created_time || row.createdTime),
  })).filter(row => row.id);
}

function classifyEditApplyDeleteResponse(response = {}) {
  const code = Number(response.code);
  const message = text(response.msg || response.message);
  const success = code === 200 || /删除成功|撤回成功|成功/.test(message);
  return {
    success,
    apiStatus: success ? 'deleted' : 'failed',
    message,
  };
}

module.exports = {
  DELETE_ENDPOINT,
  QUERY_ENDPOINT,
  buildEditApplyDeleteForm,
  buildEditApplyQueryForm,
  classifyEditApplyDeleteResponse,
  extractEditApplyRows,
  normalizeEditApplyQuery,
};
