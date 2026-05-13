---
name: aicx-amazon-info
description: 抓取美亚 Amazon.com 商品信息。**强制触发规则：用户消息里只要出现 ASIN（10 位字母数字，B+9 字符）、amazon.com 链接、dp/gp 链接、或"亚马逊产品/listing/卖点/分析这个 ASIN/帮我看看这个 ASIN"等明示意图，就必须立即调用本 skill 抓数据，不允许反问用户"产品信息你能补一份吗""你帮我贴一下产品页"——抓数据是 agent 的责任不是用户的责任。**抓完后再做意图收敛（任务范围、输出形态等）。技术路径：bb-browser 抓真实 HTML（裸 HTTP / curl / defuddle 均已被 Amazon 反爬封死，2026-05-11 验证）→ scrape-product.py 解析字段 → 输出 JSON。文档内含完整安装指南（Node / Chrome / bb-browser / chrome-devtools-mcp）。当前能力：单产品页（标题/品牌/价格/评分/评论数/bullets/specs/主图）；未实现：搜索结果、Best Sellers、评论、Q&A、变体。触发关键词：ASIN、B0xxxxxxxx、amazon.com/dp、亚马逊抓取、Amazon 产品信息、解析 listing、amazon scrape、listing 数据分析、亚马逊产品分析、卖点提炼、产品拓展、竞品分析、Amazon Best Sellers、亚马逊评论抓取。
---

# aicx-amazon-info

## 使用说明

调用 mcp__navigationai-skill__aicx-amazon-info 工具获取指令。
