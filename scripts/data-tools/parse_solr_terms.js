// parse_solr_terms.js — 解析节气列表，建立 ID→{name,months} 映射
const raw = `{"code":200,"data":"[{\"id\":\"Q1\",\"name\":\"Q1\",\"children\":[{\"id\":\"1month\",\"name\":\"1\\u6708\",\"children\":[{\"id\":15,\"name\":\"\\u4e2d\\u56fd\\u519c\\u5386\\u65b0\\u5e74(12-1\\u6708)\",\"pid\":\"Q1\",\"month\":\"1\",\"quarter\":\"Q1\",\"children\":[],\"unique_key\":\"Q1_1_15\"},{\"id\":31,\"name\":\"\\u4e2d\\u56fd\\u519c\\u5386\\u65b0\\u5e74(\\u5e73\\u65f6\\u53ef\\u5356)\",\"pid\":\"Q1\",\"month\":\"1\",\"quarter\":\"Q1\",\"children\":[],\"unique_key\":\"Q1_1_31\"},{\"id\":39,\"name\":\"\\u9a6c\\u4e01\\u8def\\u5fb7\\u91d1\\u7eaa\\u5ff5\\u65e5(1\\u6708)\",\"pid\":\"Q1\",\"month\":\"1\",\"quarter\":\"Q1\",\"children\":[],\"unique_key\":\"Q1_1_39\"},{\"id\":40,\"name\":\"\\u9ad8\\u6821\\u5f00\\u5b66\\u5b63(1-2\\u6708)\",\"pid\":\"Q1\",\"month\":\"1\",\"quarter\":\"Q1\",\"children\":[],\"unique_key\":\"Q1_1_40\"},{\"id\":54,\"name\":\"\\u8d85\\u7ea7\\u7897(1-2\\u6708)\",\"pid\":\"Q1\",\"month\":\"1\",\"quarter\":\"Q1\",\"children\":[],\"unique_key\":\"Q1_1_54\"},{\"id\":55,\"name\":\"\\u8d85:\"12\",\"quarter\":\"Q4\",\"children\":[],\"unique_key\":\"Q4_12_34\"},{\"id\":61,\"name\":\"\\u5149\\u660e\\u8282(11-12\\u6708)\",\"pid\":\"Q4\",\"month\":\"12\",\"quarter\":\"Q4\",\"children\":[],\"unique_key\":\"Q4_12_61\"},{\"id\":85,\"name\":\"\\u5bbd\\u624e\\u8282(11-1\\u6708)\",\"pid\":\"Q4\",\"month\":\"12\",\"quarter\":\"Q4\",\"children\":[],\"unique_key\":\"Q4_12_85\"},{\"id\":139,\"name\":\"\\u5149\\u660e\\u8282(\\u5e73\\u65f6\\u53ef\\u5356)\",\"pid\":\"Q4\",\"month\":\"12\",\"quarter\":\"Q4\",\"children\":[],\"unique_key\":\"Q4_12_139\"}],\"pid\":\"Q4\"}]},{\"id\":1,\"name\":\"\\u5e38\\u89c4\\u4ea7\\u54c1\"}]"}`;

const parsed = JSON.parse(raw);
const list = JSON.parse(parsed.data);

function flatten(nodes, result = []) {
  for (const n of nodes) {
    if (typeof n.id === 'number') result.push(n);
    if (n.children?.length) flatten(n.children, result);
  }
  return result;
}

const items = flatten(list);
console.log('节气总数:', items.length);
items.forEach(i => console.log(`  id=${i.id} month=${i.month} quarter=${i.quarter} name=${i.name}`));
