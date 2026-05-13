---
name: aicx-zhishiku
description: aicx 个人外挂知识库。用户说"记住/记下/记一下/存到知识库/存为笔记/写到笔记里/aicx 存",立即把内容以 Markdown 写入用户 ~/Documents/aicx-zhishiku/ 并自动分类。用户问"知识库里有什么/我以前记过 X 吗/aicx 查 X/我的笔记 X",立即检索。用户说"那条 X 笔记改成/删了/不对",用 search 定位后用 kb_update 修改;明显冲突时让用户确认。跨平台(macOS/Windows/Linux)自动创建 Documents 下知识库目录,首次运行检测 iCloud/OneDrive 同步并提醒。触发关键词:记住、记下、记一下、存为笔记、存到知识库、记到知识库、写到笔记里、保存这个、aicx 存、aicx 查、aicx 笔记、我的知识库、知识库里有什么、从知识库找、我以前记过、knowledge base、save this note、remember this。不触发场景:用户明确说 Obsidian/OB(走 obsidian-cli 而非本 skill);Claude 自动判断的项目教训(走 auto-memory 而非本 skill);单纯任务提醒(「记得做 X」不入库,除非用户加了「存知识库/记到知识库」类指令)。
---

# aicx-zhishiku

## 使用说明

调用 mcp__navigationai-skill__aicx-zhishiku 工具获取指令。
