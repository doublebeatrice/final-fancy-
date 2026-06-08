function text(value) {
  return String(value ?? '').trim();
}

function normalizeOcrText(raw) {
  return text(raw)
    .replace(/[锛綇銆嘳]/g, 'O')
    .replace(/[锛憋綉]/g, 'Q')
    .replace(/[锛★絹]/g, 'A')
    .replace(/[锛怾]/g, '0')
    .replace(/[锛慮]/g, '1')
    .replace(/[锛抅]/g, '2')
    .replace(/[锛揮]/g, '3')
    .replace(/[锛擼]/g, '4')
    .replace(/[锛昡]/g, '5')
    .replace(/[锛朷]/g, '6')
    .replace(/[锛梋]/g, '7')
    .replace(/[锛榏]/g, '8')
    .replace(/[锛橾]/g, '9')
    .replace(/\s+/g, ' ');
}

function extractSkus(raw) {
  const value = normalizeOcrText(raw)
    .replace(/\b0A(?=\d{3,5})/g, 'QA')
    .replace(/\bO([A-Z]{1,5}\d{3,5})/g, 'Q$1')
    .replace(/\bN\s*4g(?=\d{2,4})/gi, 'NAY49')
    .replace(/\bN\s*厶\s*v(?=\d{3,5})/gi, 'NAY');
  return [...new Set(value.match(/\b[A-Z]{2,6}\d{3,5}[A-Z0-9-]*\b/g) || [])]
    .map(item => item.toUpperCase());
}

function classifyOcrText(raw) {
  const value = normalizeOcrText(raw).toLowerCase();
  const hasProductSubject = extractSkus(value).length > 0 || /\bB[0-9A-Z]{9}\b/i.test(value);
  if (/开发|产品|新品|品牌故事|变体|母体|卡片|文案|实物|款式|listing|sku|opp|organza|hemp rope|package quantity/i.test(value) || hasProductSubject) {
    return 'developer_product_inquiry';
  }
  if (/会议|纪要|资料|培训|文档|复盘|同步|浼氳|绾|璧勬枡|鍩硅|鏂囨|澶嶇洏|鍚屾/i.test(value)) return 'meeting_or_learning_material';
  if (/舆情|投诉|差评|异常|风险|紧急|老板|预警|鑸嗘|鎶曡|宸|寮傚父|椋庨櫓|绱ф/i.test(value)) return 'sentiment_or_exception_watch';
  return 'general_notification';
}

function priorityForOcr(raw, category, chatContext = {}) {
  if (chatContext.state === 'waiting_external_confirmation' || chatContext.state === 'closed_or_archivable') return 'P2';
  const value = normalizeOcrText(raw);
  if (/马上|今天|老板|风险|异常|投诉|紧急|@|绱ф|浠婂ぉ|鑰佹澘|椋庨櫓|寮傚父|鎶曡/.test(value)) return 'P0';
  if (category === 'developer_product_inquiry' || category === 'sentiment_or_exception_watch') return 'P1';
  return 'P2';
}

function likelyConversationLines(ocr = {}) {
  const lines = Array.isArray(ocr.lines) ? ocr.lines : [];
  return lines
    .filter(line => Number(line.x) < 280 && Number(line.y) > 100 && Number(line.y) < 610)
    .map(line => line.text)
    .filter(Boolean)
    .slice(0, 20);
}

function isMainChatLine(line = {}) {
  const x = Number(line.x);
  const y = Number(line.y);
  return x >= 400 && y >= 80 && y <= 560;
}

function sideForLine(line = {}, imageWidth = 1920) {
  const x = Number(line.x);
  if (x >= Math.max(950, imageWidth * 0.52)) return 'outgoing';
  if (x >= 400) return 'incoming';
  return 'other';
}

function cleanLineText(value) {
  return normalizeOcrText(value)
    .replace(/\s+([A-Z0-9])/g, '$1')
    .replace(/([A-Z0-9])\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function groupChatLines(lines = [], imageWidth = 1920) {
  const ordered = lines
    .filter(isMainChatLine)
    .map(line => ({
      ...line,
      side: sideForLine(line, imageWidth),
      text: cleanLineText(line.text),
    }))
    .filter(line => line.side !== 'other' && line.text)
    .sort((a, b) => Number(a.y) - Number(b.y));

  const groups = [];
  for (const line of ordered) {
    const last = groups[groups.length - 1];
    const lastLine = last && last.lines[last.lines.length - 1];
    const yGap = lastLine ? Number(line.y) - Number(lastLine.y) : 999;
    if (!last || last.side !== line.side || yGap > 42) {
      groups.push({ side: line.side, lines: [line] });
    } else {
      last.lines.push(line);
    }
  }

  return groups.map(group => {
    const texts = group.lines.map(line => line.text).filter(Boolean);
    const first = texts[0] || '';
    const hasSenderHeader = group.side === 'incoming' && texts.some(item => /ALLINAD|ALL IN AD|黄成|榛|榆|滨|\(.+\)/i.test(item));
    let bodyLines = texts;
    let quotedLines = [];
    if (hasSenderHeader && texts.length > 2) {
      quotedLines = texts.slice(0, -1);
      bodyLines = texts.slice(-1);
    } else if (hasSenderHeader) {
      bodyLines = texts.slice(1);
    }
    return {
      side: group.side,
      text: bodyLines.join(' '),
      quotedText: quotedLines.join(' '),
      rawText: texts.join(' '),
      y: Number(group.lines[0].y),
    };
  }).filter(item => item.text || item.quotedText);
}

function inferChatState(latestIncoming = '', yourLastMessage = '') {
  const incoming = normalizeOcrText(latestIncoming);
  const compact = incoming.replace(/\s+/g, '');
  if (/搞定|完成|已处理|可以了|好了/.test(compact)) return 'closed_or_archivable';
  if (/问下|问一下|领导|看看|确认|申请|应该可以|现在问|间下|音看/.test(compact)) return 'waiting_external_confirmation';
  if (incoming && /怎么|能不能|可以吗|申请|帮|看下|处理|回复/.test(compact)) return 'needs_operator_review';
  if (yourLastMessage && !incoming) return 'waiting_reply';
  return incoming ? 'needs_review' : 'unknown';
}

function extractChatContext(ocr = {}) {
  const messages = groupChatLines(ocr.lines || [], Number(ocr.width) || 1920);
  const incoming = messages.filter(item => item.side === 'incoming' && item.text);
  const outgoing = messages.filter(item => item.side === 'outgoing' && item.text);
  const latestIncoming = incoming[incoming.length - 1] || null;
  const yourLast = outgoing[outgoing.length - 1] || null;
  const quotedContext = incoming.slice().reverse().find(item => item.quotedText);
  return {
    messages,
    latestIncoming: latestIncoming ? latestIncoming.text : '',
    yourLastMessage: yourLast ? yourLast.text : '',
    quotedContext: quotedContext ? quotedContext.quotedText : '',
    state: inferChatState(latestIncoming ? latestIncoming.text : '', yourLast ? yourLast.text : ''),
  };
}

function triageOcrResult(ocr = {}) {
  const rawText = normalizeOcrText(ocr.text || '');
  const chatContext = extractChatContext(ocr);
  const category = classifyOcrText(rawText);
  return {
    source: 'wecom_window_ocr',
    image: ocr.image || '',
    language: ocr.language || '',
    lineCount: ocr.lineCount || 0,
    category,
    priority: priorityForOcr(rawText, category, chatContext),
    detectedSubjects: {
      skus: extractSkus(rawText),
      asins: [...new Set(rawText.match(/\bB[0-9A-Z]{9}\b/g) || [])],
      keywords: [],
    },
    chatContext,
    conversationCandidates: likelyConversationLines(ocr),
    textPreview: rawText.slice(0, 800),
    reviewStatus: 'new',
  };
}

module.exports = {
  classifyOcrText,
  extractChatContext,
  extractSkus,
  inferChatState,
  normalizeOcrText,
  triageOcrResult,
};
