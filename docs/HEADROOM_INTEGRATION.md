# Headroom 集成指南

## 概览

Headroom 是一个上下文压缩层，可以在工具输出、日志、RAG 分块等内容到达 LLM 之前对其进行压缩，实现 **60-95% 的 token 节省**，同时保持答案质量。

## 安装

```bash
# 安装 headroom-ai
pip install "headroom-ai[all]"

# 验证安装
headroom --version
```

## 集成方式

### 方式 1：代理服务器模式（推荐 - 最简单）

无需修改代码，自动压缩所有发送给 LLM 的请求。

```bash
# 启动代理
npm run headroom:start

# 或者直接用 headroom
headroom proxy --port 8787
```

然后配置你的应用使用代理：
```bash
# 设置环境变量
export ANTHROPIC_BASE_URL=http://localhost:8787
export OPENAI_API_BASE=http://localhost:8787

# 或在 .env 文件中添加
HEADROOM_PROXY=http://localhost:8787
```

### 方式 2：包装 Claude Code

直接包装 Claude Code，自动启用压缩：

```bash
# 包装 Claude Code
npm run headroom:wrap

# 或者
headroom wrap claude --memory --learn
```

这会自动：
1. 启动代理服务器
2. 配置 Claude Code 使用代理
3. 启用持久化记忆
4. 启用失败学习

### 方式 3：MCP 集成

作为 MCP 工具使用：

```bash
# 安装 MCP 服务器
headroom mcp install

# 然后在 Claude Code 中可用:
# - headroom_compress: 压缩文本
# - headroom_retrieve: 检索原始内容
# - headroom_stats: 查看压缩统计
```

### 方式 4：Python 代码集成

在你的 Python 脚本中直接调用：

```python
from headroom import compress

# 压缩消息
messages = [
    {"role": "user", "content": "长文本或日志..."}
]

compressed = compress(
    messages,
    model="claude-sonnet-4-5-20250514"  # 指定目标模型
)

# compressed 是压缩后的内容，直接发送给 LLM
```

### 方式 5：Node.js 集成

在你的 Node.js 脚本中使用代理：

```javascript
// 1. 启动代理（需要先运行 headroom proxy）

// 2. 配置 HTTP 客户端使用代理
const axios = require('axios');

const client = axios.create({
  baseURL: 'http://localhost:8787',  // headroom proxy 地址
  headers: {
    'Authorization': `Bearer ${process.env.ANTHROPIC_API_KEY}`
  }
});

// 3. 发送请求 - 自动压缩
const response = await client.post('/v1/messages', {
  model: 'claude-sonnet-4-5-20250514',
  messages: [{ role: 'user', content: longText }]
});
```

## 管理命令

### 启动/停止代理
```bash
npm run headroom:start    # 启动代理（后台）
npm run headroom:stop     # 停止代理
npm run headroom:restart  # 重启代理
npm run headroom:status   # 检查状态
```

### 查看日志和性能
```bash
npm run headroom:logs     # 查看代理日志
npm run headroom:perf     # 查看性能统计和节省效果
npm run headroom:doctor   # 运行诊断检查
```

### 配置
编辑 `.headroom.ini` 文件来调整配置：

```ini
[proxy]
port = 8787

[compression]
# 启用输出令牌减少（可选）
output_shaper = false

[memory]
# 启用跨会话记忆
enabled = true
```

## 使用场景

### 场景 1：日常运营脚本

如果你有很多日常运营脚本调用 LLM，通过代理可以自动节省 token：

```bash
# 启动代理
npm run headroom:start

# 然后正常运行脚本
npm run ops:today
npm run ops:agent:boss-paper
```

### 场景 2：Claude Code 交互

直接用 headroom 包装 Claude Code：

```bash
npm run headroom:wrap
# 然后正常使用 Claude Code
```

### 场景 3：批量处理

处理大量日志或数据时特别有效：

```python
# 在你的 Python 脚本中
import os
from headroom import compress

# 读取大量日志
with open('huge_log.txt') as f:
    logs = f.read()

# 压缩
compressed = compress(
    [{"role": "user", "content": logs}],
    model="claude-sonnet-4-5-20250514"
)

# 节省 60-95% 的 token！
print(f"Original: {len(logs)} chars")
print(f"Compressed: {len(str(compressed))} chars")
```

## 监控和优化

### 查看节省效果
```bash
npm run headroom:perf
# 输出示例：
# Input Tokens Saved: 73.2%
# Output Tokens Saved: 31.7% (estimated)
# Total Cost Saved: $12.34
```

### 学习失败模式
```bash
headroom learn
# 自动分析过去的失败，写入 CLAUDE.md/AGENTS.md
```

### 检查压缩质量
```bash
headroom doctor
# 显示：
# - 代理运行状态
# - 配置检查
# - 节省统计
```

## 跨代理记忆

Headroom 支持在 Claude、Codex、Gemini 之间共享压缩后的上下文：

```bash
# 启用记忆
headroom wrap claude --memory

# 查看记忆
headroom memory list
headroom memory stats
```

## 故障排查

### 代理无法启动
```bash
# 检查端口是否被占用
netstat -ano | findstr :8787

# 检查日志
npm run headroom:logs

# 重启代理
npm run headroom:restart
```

### 压缩效果不佳
```bash
# 运行诊断
npm run headroom:doctor

# 查看性能
npm run headroom:perf
```

### 节省的 token 没有生效
确认你的应用确实在通过代理发送请求：

```bash
# 检查环境变量
echo $ANTHROPIC_BASE_URL
# 应该显示: http://localhost:8787
```

## 高级配置

### 输出令牌减少

默认关闭，可选择启用：

```bash
export HEADROOM_OUTPUT_SHAPER=1
headroom proxy --port 8787
```

这会：
- 在系统提示末尾添加简洁性指示
- 在工具调用后降低模型的思考努力程度

### 自动学习

启用自动学习来持续优化：

```bash
headroom wrap claude --learn
```

这会：
- 自动分析失败的工具调用
- 写入 CLAUDE.md/AGENTS.md
- 持续改进压缩效果

## 资源

- 📚 完整文档: https://headroom-docs.vercel.app/docs
- 💬 Discord: https://discord.gg/yRmaUNpsPJ
- 📊 性能基准: https://headroom-docs.vercel.app/docs/benchmarks

## 下一步

1. **立即试用**: `npm run headroom:start`
2. **包装 Claude Code**: `npm run headroom:wrap`
3. **查看效果**: `npm run headroom:perf`
4. **深入配置**: 编辑 `.headroom.ini`

有问题？查看 [故障排查](#故障排查) 或在 Discord 中提问！
