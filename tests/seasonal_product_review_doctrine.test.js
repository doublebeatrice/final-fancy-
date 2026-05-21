const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const closedLoopDoc = fs.readFileSync(
  path.join(root, 'docs', 'CODEX_MINIMAL_CLOSED_LOOP.md'),
  'utf8'
);

assert.match(closedLoopDoc, /## 节日产品过品规则/, '闭环文档必须定义节日产品过品规则');
assert.match(closedLoopDoc, /过节日产品不是只写便签/, '不能把节日过品降级成写便签');
assert.match(
  closedLoopDoc,
  /窗口、库存、已验证出单方向、核心流量、新流量/,
  '节日产品必须先判断窗口、库存、出单方向、核心流量和新流量'
);
assert.match(
  closedLoopDoc,
  /listing\/价格\/主图承接/,
  '节日产品必须判断 listing、价格和主图承接'
);
assert.match(
  closedLoopDoc,
  /日常过到具体 SKU\/ASIN/,
  '日常运营过到具体产品并形成判断时要写便签'
);
assert.match(
  closedLoopDoc,
  /动作、保留、不动或复查/,
  '产品便签要覆盖动作、保留、不动和复查判断'
);
assert.match(
  closedLoopDoc,
  /止损\/继续条件/,
  '产品便签要包含止损或继续条件'
);
assert.match(
  closedLoopDoc,
  /窗口内且库存要走/,
  '窗口内有库存压力时不能机械降投'
);
assert.match(
  closedLoopDoc,
  /曝光不足、点击率弱、转化弱/,
  '必须先拆分曝光、点击和转化问题'
);
assert.match(
  closedLoopDoc,
  /不能把核心流量一路压没/,
  '不能把核心流量一路压没'
);
assert.match(
  closedLoopDoc,
  /找新流量/,
  '窗口内要主动找新流量'
);
assert.match(
  closedLoopDoc,
  /已验证出单方向/,
  '新流量优先从已验证出单方向外扩'
);
assert.match(
  closedLoopDoc,
  /泛词只小额试探/,
  '泛词只能小额试探'
);

console.log('seasonal_product_review_doctrine 测试通过');
