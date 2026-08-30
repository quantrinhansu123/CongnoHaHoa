(() => {
  if (globalThis.__HAHOA_ZALO_REFERENCE_CONTENT_V140__) return;
  globalThis.__HAHOA_ZALO_REFERENCE_CONTENT_V140__ = true;
  const CONTROL_TEXT = /^(aa|soạn|soạn tin nhắn|nhập tin nhắn|nhập @, tin nhắn|message|write a message|type a message|gửi|send|đã gửi|sent|đã xem|seen|đang nhập|typing|zalo|tất cả|all|chưa đọc|unread|tìm kiếm|search|thông báo|notifications|tắt thông báo|mute notifications|trang cá nhân|profile|thông tin|info|file|ảnh|photo|video|sticker|gif|emoji|like)$/i;
  const SYSTEM_TEXT = /^(tin nhắn và cuộc gọi|bạn đã tạo nhóm này|bạn chưa kết nối|các bạn không phải|giờ đây, các bạn|now you can|cuộc gọi|missed call|đã thu hồi|recalled|đã ghim|pinned|đã đổi|changed|đã thêm|added|đã rời|left|sử dụng zalo pc để tìm tin nhắn trước ngày|tải zalo pc)\b/i;
  const MENU_TEXT = /^(đoạn chat|tin nhắn|danh bạ|khám phá|nhật ký|cloud của tôi|zalo ai|todo|media|file phương tiện|quyền riêng tư|privacy|cài đặt|settings|tùy chỉnh|customize)$/i;
  const ICON_CODE_TEXT = /^(?:\/-)?(?:strong|heart|like|sad|angry|wow|haha|cry|love|thumb|sticker|emoji)$|^(?:>|<|:>|:o|:-o|:-h|:-\(\(|:\(\(|:\)|:-\)|;\)|;-\)|:d|:-d|:\*|:-\*)$/i;
  const HEADER_NOISE_TEXT = /^(người lạ|stranger|nhóm chung(?:\s*\(\d+\))?|mutual groups?|gửi kết bạn|gửi yêu cầu kết bạn.*|thêm bạn|kết bạn|more|xem thêm)$/i;
  const MESSAGE_CONTENT_CLASS_RE = /(bubble|message-content|msg-content|chat-content|text-content|content-message)/i;
  const MESSAGE_ROW_CLASS_RE = /(message-item|msg-item|chat-item|zmessage|message-row|msg-row)/i;
  const BLOCKED_REGION_SELECTOR = '[role="navigation"], nav, aside, [class*="sidebar"], [class*="contact-list"], [class*="right-info"], [class*="toolbar"], [class*="compose"], [class*="emoji-picker"]';
  const QUOTED_CONTENT_SELECTOR = 'blockquote, [class*="quoted"], [class*="quote-content"], [class*="quote-message"], [class*="reference"], [class*="reply-preview"], [class*="reply-quote"], [class*="replied-message"], [data-quoted="true"], [data-quote-id]';
  const MESSAGE_CONTROL_SELECTOR = 'button, [role="button"], [class*="reaction"], [class*="react-icon"], [class*="menu-button"], [class*="action-menu"], [class*="tooltip"]';

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function nextPaint() {
    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        resolve();
      };
      setTimeout(finish, 50);
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
    });
  }

  function hashString(value) {
    let hash = 0;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function isVisible(node) {
    if (!node || !(node instanceof Element)) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0
      && rect.height > 0
      && style.visibility !== 'hidden'
      && style.display !== 'none'
      && Number(style.opacity || 1) !== 0;
  }

  function rectOverlap(a, b) {
    if (!a || !b) return 0;
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return width * height;
  }

  function isInsideScrollerViewport(node, scroller) {
    if (!node || !scroller || !scroller.contains(node) || !isVisible(node)) return false;
    const rect = node.getBoundingClientRect();
    const viewport = scroller.getBoundingClientRect();
    return rectOverlap(rect, viewport) > 0
      && rect.right > viewport.left
      && rect.left < viewport.right;
  }

  function textQuality(value) {
    const text = normalize(value);
    if (!text) return 0;
    const letters = (text.match(/[0-9a-zà-ỹ]/gi) || []).length;
    const symbols = (text.match(/[^0-9a-zà-ỹ\s]/gi) || []).length;
    return letters - symbols * 0.35;
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function validDateParts(day, month, year) {
    const probe = new Date(year, month - 1, day);
    return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
  }

  function parseTimelineMarker(value, now = new Date()) {
    const text = normalize(value);
    if (!text || text.length > 80) return null;
    const lower = text.toLocaleLowerCase('vi-VN');
    if (/^(đã gửi|sent|đã xem|seen)(?:\s+\d{1,2}:\d{2})?$/.test(lower)) {
      return { kind: 'status', text };
    }

    let match = lower.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (match) {
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      const day = Number(match[3]);
      const month = Number(match[4]);
      const year = Number(match[5].length === 2 ? `20${match[5]}` : match[5]);
      if (hour < 24 && minute < 60 && validDateParts(day, month, year)) {
        return { kind: 'datetime', text, hour, minute, day, month, year, dateKey: `${year}-${pad2(month)}-${pad2(day)}` };
      }
    }

    match = lower.match(/^(?:(?:t|thứ)\s*[2-7]|cn|chủ nhật)?\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
      if (validDateParts(day, month, year)) {
        return { kind: 'date', text, day, month, year, dateKey: `${year}-${pad2(month)}-${pad2(day)}` };
      }
    }

    match = lower.match(/^(hôm nay|today|hôm qua|yesterday)(?:,?\s+lúc)?(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (match) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (/hôm qua|yesterday/.test(match[1])) date.setDate(date.getDate() - 1);
      const marker = {
        kind: match[2] ? 'datetime' : 'date',
        text,
        day: date.getDate(),
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        dateKey: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
      };
      if (match[2]) {
        marker.hour = Number(match[2]);
        marker.minute = Number(match[3]);
      }
      return marker;
    }

    match = lower.match(/^(\d{1,2}):(\d{2})$/);
    if (match && Number(match[1]) < 24 && Number(match[2]) < 60) {
      return { kind: 'time', text, hour: Number(match[1]), minute: Number(match[2]) };
    }
    return null;
  }

  function isTimestampText(text) {
    return Boolean(parseTimelineMarker(text));
  }

  function markerIso(marker, fallbackDateKey = '') {
    if (!marker || !['time', 'datetime'].includes(marker.kind)) return '';
    const dateKey = marker.dateKey || fallbackDateKey;
    const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(marker.hour),
      Number(marker.minute),
      0,
      0,
    );
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }

  function markerDisplayTime(marker, fallbackDateKey = '') {
    if (!marker || !['time', 'datetime'].includes(marker.kind)) return '';
    const timeText = `${pad2(marker.hour)}:${pad2(marker.minute)}`;
    const dateKey = marker.dateKey || fallbackDateKey;
    const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${timeText} ${Number(match[3])}/${Number(match[2])}/${match[1]}` : timeText;
  }

  function stripZaloIconArtifacts(value) {
    return normalize(String(value || '').replace(
      /(?:^|\s)(?:\/(?:-)(?:strong|heart|like|sad|angry|wow|haha|cry|love|thumb|sticker|emoji)|:>|:o|:-o|:-h|:-\(\(|:\(\(|:\)|:-\)|;\)|;-\)|:d|:-d|:\*|:-\*|>|<)(?=\s|$)/gi,
      ' ',
    ));
  }

  function cleanMessageText(value, marker = null) {
    let text = stripZaloIconArtifacts(value)
      .replace(/(?:^|\s)(?:đã gửi|sent|đã xem|seen)\s*$/i, '')
      .trim();
    if (marker && ['time', 'datetime'].includes(marker.kind)) {
      const timeText = `${Number(marker.hour)}:${pad2(marker.minute)}`;
      const paddedTimeText = `${pad2(marker.hour)}:${pad2(marker.minute)}`;
      const escapedTimes = [timeText, paddedTimeText]
        .filter((item, index, all) => all.indexOf(item) === index)
        .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
      text = text.replace(new RegExp(`(?:^|\\s)(?:${escapedTimes})(?:\\s+\\d{1,2}[\\/.]\\d{1,2}[\\/.]\\d{2,4})?\\s*$`, 'i'), '').trim();
    }
    return normalize(text);
  }

  function isNoiseText(text, title = '', { structuralMessage = false } = {}) {
    const value = stripZaloIconArtifacts(text);
    if (!value || value.length > 5000) return true;
    if (ICON_CODE_TEXT.test(value)) return true;
    if (/^\/[-a-z0-9_]+$/i.test(value)) return true;
    if (value.includes('/-') && /\/(?:-)(?:strong|heart|like|sad|angry|wow|haha|cry|love|thumb|sticker|emoji)/i.test(value) && !/[à-ỹ]/i.test(value)) return true;
    if (!structuralMessage && value.length <= 6 && /^[:;\-><()dpho*]+$/i.test(value)) return true;
    if (!structuralMessage && !/[0-9a-zà-ỹ]/i.test(value)) return true;
    if (CONTROL_TEXT.test(value) || SYSTEM_TEXT.test(value) || MENU_TEXT.test(value) || HEADER_NOISE_TEXT.test(value)) return true;
    if (isTimestampText(value)) return true;
    if (!structuralMessage && title && value.toLocaleLowerCase('vi-VN') === normalize(title).toLocaleLowerCase('vi-VN')) return true;
    return false;
  }

  function cleanTitleText(value) {
    let text = normalize(value)
      .replace(/^zalo\s*[-–|]\s*/i, '')
      .replace(/\s*[-–|]\s*zalo$/i, '');
    text = text.replace(/\b(vừa truy cập|online|offline|đang hoạt động|last seen|active)\b.*$/i, '').trim();
    if (!text || text.length > 120 || textQuality(text) < Math.max(2, text.length * 0.2)) return '';
    if (CONTROL_TEXT.test(text) || MENU_TEXT.test(text) || SYSTEM_TEXT.test(text) || ICON_CODE_TEXT.test(text) || HEADER_NOISE_TEXT.test(text)) return '';
    if (/gửi yêu cầu kết bạn|nhóm chung|người lạ/i.test(text)) return '';
    if (text.includes('/-') && /\/(?:-)(?:strong|heart|like|sad|angry|wow|haha|cry|love|thumb|sticker|emoji)/i.test(text) && !/[à-ỹ]/i.test(text)) return '';
    return text;
  }

  function isComposerCandidate(node) {
    if (!isVisible(node)) return false;
    const label = normalize(`${node.getAttribute('aria-label') || ''} ${node.getAttribute('placeholder') || ''} ${node.getAttribute('role') || ''} ${node.className || ''}`);
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.45 || rect.width < 120) return false;
    return /nhập.*tin nhắn|tin nhắn|message|textbox|compose|chat-input/i.test(label)
      || node.isContentEditable
      || node.matches('textarea');
  }

  function findComposer() {
    return [
      ...document.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea, input[placeholder], input[aria-label]'),
    ].filter(isComposerCandidate).sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] || null;
  }

  function findThreadShell(composer) {
    if (!composer) return document.body;
    let current = composer.parentElement;
    let best = composer.parentElement || document.body;
    for (let depth = 0; current && depth < 16; depth += 1, current = current.parentElement) {
      if (!isVisible(current)) continue;
      const rect = current.getBoundingClientRect();
      if (rect.height >= window.innerHeight * 0.55 && rect.width >= 420 && rect.width <= window.innerWidth * 0.96) {
        best = current;
        if (rect.height >= window.innerHeight * 0.8) break;
      }
    }
    return best || document.body;
  }

  function messageEvidence(node) {
    try {
      return Math.min(40, node.querySelectorAll('[data-id], [data-key], [data-msg-id], [data-message-id], [class*="message"], [class*="msg-"], [class*="bubble"], [class*="chat-item"]').length);
    } catch {
      return 0;
    }
  }

  function scoreScrollerCandidate(node, composer, shell) {
    if (!node || !isVisible(node)) return -Infinity;
    const rect = node.getBoundingClientRect();
    if (rect.width < Math.min(340, window.innerWidth * 0.32) || rect.height < 220) return -Infinity;
    if (composer && node.contains(composer)) return -Infinity;
    const classes = normalize(node.className || '');
    if (/(sidebar|contact-list|conversation-list|friend-list|nav-list|chat-input|composer)/i.test(classes)) return -Infinity;
    const style = window.getComputedStyle(node);
    const overflowAmount = Number(node.scrollHeight || 0) - Number(node.clientHeight || 0);
    const explicitlyScrollable = /(auto|scroll|overlay)/i.test(style.overflowY || '');
    if (!explicitlyScrollable && overflowAmount < 40) return -Infinity;
    const composerRect = composer?.getBoundingClientRect?.();
    const horizontalOverlap = composerRect
      ? Math.max(0, Math.min(rect.right, composerRect.right) - Math.max(rect.left, composerRect.left))
      : 0;
    let score = 220;
    if (explicitlyScrollable) score += 120;
    score += Math.min(160, Math.max(0, overflowAmount) / 12);
    score += Math.min(130, rect.height / 5);
    score += messageEvidence(node) * 14;
    if (composerRect && rect.bottom <= composerRect.top + 100) score += 100;
    if (composerRect && horizontalOverlap >= Math.min(rect.width, composerRect.width) * 0.55) score += 120;
    if (rect.left + rect.width / 2 > window.innerWidth * 0.42) score += 55;
    if (rect.width > window.innerWidth * 0.94) score -= 180;
    if (rect.left < window.innerWidth * 0.12 && rect.right < window.innerWidth * 0.62) score -= 160;
    if (shell && shell !== document.body && !shell.contains(node)) score -= 80;
    return score;
  }

  function findMessageScroller(shell, composer) {
    const scope = shell && shell !== document.body ? shell : document;
    const candidates = [...scope.querySelectorAll('main, section, [role="main"], div')]
      .map((node) => ({ node, score: scoreScrollerCandidate(node, composer, shell) }))
      .filter((item) => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.node || null;
  }

  function headerCandidateText(node) {
    const ownText = normalize(node.innerText || node.textContent || '');
    const attrText = normalize(node.getAttribute('title') || node.getAttribute('aria-label') || '');
    const own = cleanTitleText(ownText);
    const attr = cleanTitleText(attrText);
    if (own && own.length <= 80) return own;
    return attr && attr.length <= 80 ? attr : '';
  }

  function scoreHeaderCandidate(node, scroller) {
    if (!isVisible(node) || scroller.contains(node)) return null;
    if (node.closest(`${BLOCKED_REGION_SELECTOR}, button, [role="button"]`)) return null;
    const rect = node.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const bandTop = Math.max(0, scrollerRect.top - Math.min(280, window.innerHeight * 0.36));
    if (rect.top < bandTop || rect.bottom > scrollerRect.top + 24) return null;
    if (rect.right < scrollerRect.left || rect.left > scrollerRect.right) return null;
    if (rect.height > 82 || rect.width < 14 || rect.width > Math.min(620, scrollerRect.width * 0.72)) return null;
    const text = headerCandidateText(node);
    if (!text) return null;
    const style = window.getComputedStyle(node);
    const fontSize = Number.parseFloat(style.fontSize || '0') || 0;
    const fontWeight = Number.parseInt(style.fontWeight || '400', 10) || (/bold/i.test(style.fontWeight || '') ? 700 : 400);
    const classes = normalize(node.className || '');
    let score = fontSize * 12 + (fontWeight >= 600 ? 80 : 0);
    score += /header|conversation|chat-title|user-name|display-name/i.test(classes) ? 70 : 0;
    score -= Math.abs(rect.left - (scrollerRect.left + 32)) * 0.12;
    score -= Math.abs(rect.bottom - scrollerRect.top) * 0.1;
    score -= Math.max(0, text.length - 36) * 2;
    if (/^[A-ZÀ-Ỹ\s]+$/.test(text) && text.length > 3) score -= 80;
    return { node, text, score };
  }

  function findConversationHeader(scroller) {
    const selectors = [
      'h1', 'h2', 'h3', '[role="heading"]', 'strong', 'b', '[title]', '[aria-label]',
      '[class*="display-name"]', '[class*="user-name"]', '[class*="conversation-name"]',
      '[class*="chat-title"]', '[class*="header"] [class*="name"]', '[class*="truncate"]',
      '[class*="title"]', '[class*="name"]',
    ];
    const candidates = [...document.querySelectorAll(selectors.join(', '))]
      .map((node) => scoreHeaderCandidate(node, scroller))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    if (candidates[0]?.text) return candidates[0];
    const fallback = cleanTitleText(document.title.replace(/\(\d+\)\s*/g, ''));
    return { node: null, text: fallback || '', score: -1 };
  }

  function stableIdValue(value) {
    const text = normalize(value);
    if (!text || text.length < 4 || text.length > 300) return '';
    if (/^(active|selected|true|false|chat|conversation|panel|content|main|root|undefined|null)$/i.test(text)) return '';
    if (/\s{2,}/.test(text)) return '';
    return text;
  }

  function stableAttributeValue(name, value) {
    const text = stableIdValue(value);
    if (!text) return '';
    if (/^data-(conversation-id|thread-id|uid|user-id|zalo-id)$/.test(name)) return text;
    if (/^(data-id|data-key|id)$/.test(name)) {
      if (/^(chat|conversation|message|header|content|panel|view|main|root)[-_a-z]*$/i.test(text)) return '';
      if (!/\d/.test(text) && !/^[a-f0-9-]{8,}$/i.test(text)) return '';
    }
    return text;
  }

  function idFromUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      const parts = url.pathname.split('/').filter(Boolean);
      for (const key of ['chat', 'conversation', 'convo', 'thread', 't']) {
        const idx = parts.indexOf(key);
        const candidate = stableIdValue(parts[idx + 1] || '');
        if (idx >= 0 && candidate) return { value: candidate, source: `url_path_${key}` };
      }
      for (const name of ['id', 'uid', 'phone', 'thread_id', 'conversation_id']) {
        const candidate = stableIdValue(url.searchParams.get(name) || new URLSearchParams(url.hash.replace(/^#/, '')).get(name) || '');
        if (candidate) return { value: candidate, source: `url_${name}` };
      }
      const hash = stableIdValue(url.hash.replace(/^#\/?/, ''));
      if (hash && !/^chat$/i.test(hash)) return { value: hash, source: 'url_hash' };
    } catch {
      // ignored
    }
    return null;
  }

  function idFromElement(node) {
    if (!node) return null;
    const attributes = [
      'data-conversation-id', 'data-thread-id', 'data-uid', 'data-user-id',
      'data-zalo-id', 'data-id', 'data-key', 'id',
    ];
    let current = node;
    for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
      for (const name of attributes) {
        const value = stableAttributeValue(name, current.getAttribute?.(name) || '');
        if (value) return { value, source: `dom_${name.replace(/^data-/, '')}` };
      }
      const href = current.getAttribute?.('href') || current.querySelector?.('a[href]')?.getAttribute('href') || '';
      const fromHref = href ? idFromUrl(href) : null;
      if (fromHref) return fromHref;
    }
    return null;
  }

  function stableAvatarFingerprint(headerNode, scroller) {
    const scrollerRect = scroller.getBoundingClientRect();
    const roots = [];
    if (headerNode) {
      let current = headerNode.parentElement;
      for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) roots.push(current);
    }
    for (const root of roots) {
      const image = [...root.querySelectorAll('img')].find((node) => {
        if (!isVisible(node)) return false;
        const rect = node.getBoundingClientRect();
        return rect.bottom <= scrollerRect.top + 24 && rect.width >= 28 && rect.height >= 28;
      });
      const raw = image?.getAttribute('src') || image?.getAttribute('data-src') || '';
      if (!raw || /^(blob:|data:)/i.test(raw)) continue;
      try {
        const url = new URL(raw, window.location.href);
        url.search = '';
        url.hash = '';
        if (url.pathname && !/^\/$/.test(url.pathname)) return `${url.hostname}${url.pathname}`;
      } catch {
        // ignored
      }
    }
    return '';
  }

  function findSelectedConversationElement(title, scroller) {
    const wanted = normalize(title).toLocaleLowerCase('vi-VN');
    const selectors = '[aria-selected="true"], [data-selected="true"], [class*="selected"], [class*="active"]';
    const scrollerRect = scroller.getBoundingClientRect();
    return [...document.querySelectorAll(selectors)].find((node) => {
      if (!isVisible(node) || scroller.contains(node)) return false;
      const rect = node.getBoundingClientRect();
      if (rect.left >= scrollerRect.right || rect.top >= scrollerRect.bottom) return false;
      const text = normalize(node.innerText || node.textContent || '').toLocaleLowerCase('vi-VN');
      return wanted && (text === wanted || text.startsWith(`${wanted} `) || text.includes(` ${wanted} `));
    }) || null;
  }

  function conversationIdentity(title, headerNode, scroller) {
    const fromCurrentUrl = idFromUrl(window.location.href);
    if (fromCurrentUrl) {
      return { id: `zalo_url_${hashString(`${fromCurrentUrl.source}|${fromCurrentUrl.value}`)}`, source: fromCurrentUrl.source, confidence: 'high' };
    }
    const fromHeader = idFromElement(headerNode);
    if (fromHeader) {
      return { id: `zalo_dom_${hashString(`${fromHeader.source}|${fromHeader.value}`)}`, source: fromHeader.source, confidence: 'high' };
    }
    const selected = findSelectedConversationElement(title, scroller);
    const fromSelected = idFromElement(selected);
    if (fromSelected) {
      return { id: `zalo_dom_${hashString(`${fromSelected.source}|${fromSelected.value}`)}`, source: `selected_${fromSelected.source}`, confidence: 'high' };
    }
    const avatar = stableAvatarFingerprint(headerNode, scroller);
    if (avatar) {
      return { id: `zalo_avatar_${hashString(avatar)}`, source: 'header_avatar', confidence: 'medium' };
    }
    return { id: `zalo_title_${hashString(normalize(title).toLocaleLowerCase('vi-VN') || 'unknown')}`, source: 'title_fallback', confidence: 'low' };
  }

  function collectParticipants(title, identity) {
    if (!title || /^zalo$/i.test(title)) return [];
    return [{ id: identity?.confidence === 'high' ? identity.id : '', name: title, profile_url: '' }];
  }

  function classifyConversationKind(value = {}) {
    const text = normalize(value.text || '').toLocaleLowerCase('vi-VN');
    const attributes = normalize(value.attributes || '').toLocaleLowerCase('vi-VN');
    const combined = `${text} ${attributes}`.trim();
    const privatePattern = /người lạ|gửi yêu cầu kết bạn|nhóm chung(?:\s*\(|\b)|mutual groups?|stranger/iu;
    const groupPattern = /\b\d{1,4}\s*(?:thành viên|members?)\b|\b(?:thêm thành viên|quản lý nhóm|rời nhóm|group chat)\b/iu;
    if (privatePattern.test(combined)) {
      return { type: 'private', isGroup: false, evidence: 'private_header' };
    }
    if (groupPattern.test(combined) || /(?:^|\s)(?:group|group-chat|conversation-group)(?:\s|$)/i.test(attributes)) {
      return { type: 'group', isGroup: true, evidence: 'group_header' };
    }
    return { type: 'unknown', isGroup: false, evidence: 'no_group_evidence' };
  }

  function conversationKind(headerNode, scroller) {
    const scrollerRect = scroller.getBoundingClientRect();
    const textParts = [];
    const attributeParts = [];
    let current = headerNode;
    for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
      const rect = current.getBoundingClientRect?.();
      if (!rect) continue;
      const insideHeaderBand = rect.bottom <= scrollerRect.top + 48
        && rect.top >= Math.max(0, scrollerRect.top - 260)
        && rect.left >= scrollerRect.left - 120
        && rect.right <= scrollerRect.right + 120;
      if (!insideHeaderBand) continue;
      textParts.push(current.innerText || current.textContent || '');
      for (const name of ['class', 'role', 'aria-label', 'data-type', 'data-conversation-type']) {
        attributeParts.push(current.getAttribute?.(name) || '');
      }
    }
    return classifyConversationKind({ text: textParts.join(' '), attributes: attributeParts.join(' ') });
  }

  function requiresGroupApproval(kind = {}) {
    return kind.type !== 'private';
  }

  function refineConversationKind(kind = {}, visibleMessages = []) {
    if (kind.type !== 'unknown') return kind;
    const incoming = (Array.isArray(visibleMessages) ? visibleMessages : [])
      .filter((row) => row?.direction === 'incoming');
    const namedSenders = new Set(incoming
      .map((row) => normalize(row?.sender_name || ''))
      .filter((name) => name && name !== 'Khách hàng'));
    const senderIds = new Set(incoming
      .map((row) => normalize(row?.sender_id || ''))
      .filter(Boolean));
    if (namedSenders.size || senderIds.size > 1) {
      return { type: 'group', isGroup: true, evidence: 'group_message_senders' };
    }
    if (incoming.length) {
      return { type: 'private', isGroup: false, evidence: 'private_message_layout' };
    }
    return kind;
  }

  function classTrail(node, stopNode) {
    const values = [];
    let current = node;
    for (let depth = 0; current && current !== stopNode && depth < 6; depth += 1, current = current.parentElement) {
      values.push(normalize(current.className || ''));
    }
    return values.join(' ');
  }

  function senderNameText(value, conversationTitle = '') {
    const text = normalize(value);
    if (!text || text.length > 80 || /^@|https?:\/\//i.test(text)) return '';
    if (/^\[?(?:ảnh|photo|image|sticker|gif)\]?$/i.test(text)) return '';
    if (isTimestampText(text) || CONTROL_TEXT.test(text) || SYSTEM_TEXT.test(text) || MENU_TEXT.test(text)) return '';
    if (conversationTitle && text.toLocaleLowerCase('vi-VN') === normalize(conversationTitle).toLocaleLowerCase('vi-VN')) return '';
    const words = text.split(/\s+/).filter(Boolean);
    const letters = (text.match(/[a-zà-ỹ]/gi) || []).length;
    if (!words.length || words.length > 9 || letters < 2 || /[!?;]|\.{2,}/.test(text)) return '';
    return text;
  }

  function senderSearchScopes(node, scroller) {
    const scopes = [];
    let current = node;
    const scrollerRect = scroller.getBoundingClientRect();
    for (let depth = 0; current && current !== scroller && depth < 6; depth += 1, current = current.parentElement) {
      if (!isVisible(current)) continue;
      const rect = current.getBoundingClientRect();
      if (rect.width >= scrollerRect.width * 0.94 || rect.height > 680) break;
      scopes.push(current);
      const classes = normalize(current.className || '');
      if (MESSAGE_ROW_CLASS_RE.test(classes) || current.hasAttribute?.('data-msg-id') || current.hasAttribute?.('data-message-id')) break;
    }
    return scopes;
  }

  function senderNameFromNode(node, scroller, conversationTitle = '') {
    const rootRect = node.getBoundingClientRect();
    let best = null;
    senderSearchScopes(node, scroller).forEach((scope, scopeIndex) => {
      const selector = '[data-sender-name], [data-author-name], [data-display-name], [class*="sender"], [class*="author"], [class*="display-name"], [class*="user-name"], div, span, strong, b, p';
      const leaves = [...scope.querySelectorAll(selector)].slice(0, 160).map((candidate) => {
        if (!isVisible(candidate) || isQuotedOrControlNode(candidate, scope)) return null;
        const direct = normalize([...candidate.childNodes]
          .filter((child) => child.nodeType === Node.TEXT_NODE)
          .map((child) => child.textContent || '')
          .join(' '));
        const attributeName = normalize(
          candidate.getAttribute?.('data-sender-name')
          || candidate.getAttribute?.('data-author-name')
          || candidate.getAttribute?.('data-display-name')
          || '',
        );
        const name = senderNameText(attributeName || direct, conversationTitle);
        if (!name) return null;
        return { node: candidate, name, rect: candidate.getBoundingClientRect(), attributeName };
      }).filter(Boolean);

      leaves.forEach((candidate) => {
        const classes = normalize(candidate.node.className || '');
        const explicitClass = /sender|author|display-name|user-name|from-name/i.test(classes);
        const bodyBelow = leaves.filter((other) => (
          other !== candidate
          && other.rect.top >= candidate.rect.bottom - 3
          && other.name.toLocaleLowerCase('vi-VN') !== candidate.name.toLocaleLowerCase('vi-VN')
        ));
        const style = window.getComputedStyle(candidate.node);
        const fontSize = Number.parseFloat(style.fontSize || '0') || 0;
        const visualSenderLabel = bodyBelow.some((other) => {
          const bodyStyle = window.getComputedStyle(other.node);
          const bodyFontSize = Number.parseFloat(bodyStyle.fontSize || '0') || 0;
          return normalize(bodyStyle.color || '') !== normalize(style.color || '')
            || (fontSize > 0 && bodyFontSize > fontSize + 0.4)
            || Number.parseInt(style.fontWeight || '400', 10) !== Number.parseInt(bodyStyle.fontWeight || '400', 10);
        });
        if (!candidate.attributeName && !explicitClass && !visualSenderLabel) return;
        const verticalDistance = candidate.rect.bottom <= rootRect.top
          ? rootRect.top - candidate.rect.bottom
          : Math.max(0, candidate.rect.top - rootRect.top);
        if (verticalDistance > 190 || Math.abs(candidate.rect.left - rootRect.left) > 100) return;
        let score = 260 - scopeIndex * 18 - verticalDistance * 0.7;
        if (candidate.attributeName) score += 260;
        if (explicitClass) score += 180;
        if (visualSenderLabel) score += 120;
        if (fontSize > 0 && fontSize <= 17) score += 25;
        if (!best || score > best.score) best = { name: candidate.name, score };
      });
    });
    return best?.name || '';
  }

  function senderAvatarId(node, scroller) {
    const rootRect = node.getBoundingClientRect();
    let best = null;
    senderSearchScopes(node, scroller).forEach((scope, scopeIndex) => {
      [...scope.querySelectorAll('img')].slice(0, 30).forEach((image) => {
        if (!isVisible(image)) return;
        const rect = image.getBoundingClientRect();
        const classes = normalize(`${image.className || ''} ${classTrail(image, scope)}`);
        const squareEnough = Math.abs(rect.width - rect.height) <= Math.max(8, rect.width * 0.24);
        if (!squareEnough || rect.width < 24 || rect.width > 88 || rect.height < 24 || rect.height > 88) return;
        if (/reaction|sticker|emoji|toolbar|button-icon/i.test(classes)) return;
        const besideBubble = rect.right <= rootRect.left + 28 && rect.bottom >= rootRect.top - 24 && rect.top <= rootRect.bottom + 24;
        const explicitAvatar = /avatar|user-photo|profile-photo/i.test(classes);
        if (!besideBubble && !explicitAvatar) return;
        const raw = String(image.currentSrc || image.src || image.getAttribute('src') || image.getAttribute('data-src') || '').trim();
        if (!raw || /^data:/i.test(raw)) return;
        let stable = raw;
        try {
          const url = new URL(raw, window.location.href);
          url.search = '';
          url.hash = '';
          stable = `${url.hostname}${url.pathname}`;
        } catch {
          // Keep a non-URL blob identifier as a last-resort fingerprint.
        }
        const distance = Math.abs(rect.top - rootRect.top) + Math.max(0, rootRect.left - rect.right);
        const score = (explicitAvatar ? 180 : 80) - scopeIndex * 12 - distance * 0.4;
        if (!best || score > best.score) best = { id: `zalo_avatar_${hashString(stable)}`, score };
      });
    });
    return best?.id || '';
  }

  function stripSenderPrefix(text, senderName) {
    const value = normalize(text);
    const name = normalize(senderName);
    if (!value || !name || value.toLocaleLowerCase('vi-VN') === name.toLocaleLowerCase('vi-VN')) return value;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return normalize(value.replace(new RegExp(`^${escaped}(?:\\s+|[：:]\\s*)`, 'iu'), '')) || value;
  }

  function senderFromNode(node, scroller, conversationTitle = '') {
    const aria = normalize(node.getAttribute('aria-label') || '');
    const classes = classTrail(node, scroller);
    const rect = node.getBoundingClientRect();
    const shellBounds = scroller.getBoundingClientRect();
    const geometrySelf = rect.left + rect.width / 2 > shellBounds.left + shellBounds.width * 0.58;
    const classSelf = /\b(me|self|mine|right|owner|sent|out|outgoing)\b|message-out|msg-out|chat-item-me|bubble-me|msg-sent/i.test(classes);
    const self = classSelf || geometrySelf || /(^|\b)(bạn|you)\s*:/i.test(aria);
    const detectedName = self ? '' : senderNameFromNode(node, scroller, conversationTitle);
    const avatarId = self ? '' : senderAvatarId(node, scroller);
    return {
      sender_name: self ? 'Nhân viên' : (detectedName || 'Khách hàng'),
      sender_id: self ? '' : (avatarId || (detectedName ? `zalo_member_${hashString(detectedName.toLocaleLowerCase('vi-VN'))}` : '')),
      sender_type: self ? 'staff' : 'customer',
      direction: self ? 'outgoing' : 'incoming',
      sender_is_self: self,
      sender_name_explicit: Boolean(detectedName),
    };
  }

  function validMessageContainer(node, scroller) {
    if (!node || node === scroller || !isInsideScrollerViewport(node, scroller)) return false;
    const rect = node.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    return rect.width >= 12 && rect.height >= 10 && rect.width < scrollerRect.width * 0.93 && rect.height < 640;
  }

  function messageRootForLeaf(node, scroller) {
    let current = node;
    let contentCandidate = null;
    let rowCandidate = null;
    let geometryCandidate = null;
    for (let depth = 0; current && current !== scroller && depth < 10; depth += 1, current = current.parentElement) {
      if (!validMessageContainer(current, scroller)) continue;
      const classes = normalize(current.className || '');
      const rect = current.getBoundingClientRect();
      if (!contentCandidate && (MESSAGE_CONTENT_CLASS_RE.test(classes) || /bubble/i.test(classes))) contentCandidate = current;
      if (!rowCandidate && (MESSAGE_ROW_CLASS_RE.test(classes) || current.hasAttribute('data-msg-id') || current.hasAttribute('data-message-id'))) rowCandidate = current;
      const style = window.getComputedStyle(current);
      const hasVisualBox = style.backgroundColor !== 'rgba(0, 0, 0, 0)'
        || Number.parseFloat(style.borderRadius || '0') >= 4;
      if (!geometryCandidate && hasVisualBox && rect.width < scroller.getBoundingClientRect().width * 0.78) geometryCandidate = current;
    }
    return contentCandidate || rowCandidate || geometryCandidate || node.parentElement || node;
  }

  function visibleTextLeaves(root) {
    return [...root.querySelectorAll('div, span, p, strong, em, b')].filter((node) => {
      if (!isVisible(node)) return false;
      const directText = normalize([...node.childNodes]
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent || '')
        .join(' '));
      return Boolean(directText);
    });
  }

  function looksLikeQuotedBlock(node, root) {
    if (!node || !root || node === root || !root.contains(node)) return false;
    if (!isVisible(node)) return false;
    const rect = node.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    if (rect.width < 48 || rect.height < 22 || rect.height > Math.max(180, rootRect.height * 0.82)) return false;
    if (node.matches?.(QUOTED_CONTENT_SELECTOR)) return true;
    const style = window.getComputedStyle(node);
    const leftBorder = Number.parseFloat(style.borderLeftWidth || '0') || 0;
    const rightBorder = Number.parseFloat(style.borderRightWidth || '0') || 0;
    const hasQuoteBorder = (leftBorder >= 2 && !/none|hidden/i.test(style.borderLeftStyle || ''))
      || (rightBorder >= 2 && !/none|hidden/i.test(style.borderRightStyle || ''));
    const pseudoStrip = ['::before', '::after'].some((pseudo) => {
      try {
        const pseudoStyle = window.getComputedStyle(node, pseudo);
        const width = Number.parseFloat(pseudoStyle.width || '0') || 0;
        const height = Number.parseFloat(pseudoStyle.height || '0') || 0;
        const color = normalize(pseudoStyle.backgroundColor || pseudoStyle.borderColor || '');
        return width >= 2 && width <= 10 && height >= 18 && !/transparent|rgba\(0, 0, 0, 0\)/i.test(color);
      } catch {
        return false;
      }
    });
    const classes = normalize(`${node.className || ''} ${node.getAttribute?.('data-type') || ''} ${node.getAttribute?.('aria-label') || ''}`);
    const broadReplyClass = /quote|quoted|reference|reply|replied/i.test(classes)
      && visibleTextLeaves(node).length >= 2;
    return hasQuoteBorder || pseudoStrip || broadReplyClass;
  }

  function containsReplyQuote(root) {
    const descendants = [...root.querySelectorAll('blockquote, div, span, section, article, [class], [data-quote-id], [data-quoted="true"]')].slice(0, 180);
    if (descendants.some((node) => looksLikeQuotedBlock(node, root))) return true;
    const rootRect = root.getBoundingClientRect();
    return descendants.some((node) => {
      if (!isVisible(node)) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width < 2 || rect.width > 10 || rect.height < 22 || rect.height > Math.min(180, rootRect.height * 0.82)) return false;
      const style = window.getComputedStyle(node);
      const color = normalize(style.backgroundColor || style.borderColor || '');
      if (!color || /transparent|rgba\(0, 0, 0, 0\)/i.test(color)) return false;
      const card = node.parentElement;
      if (!card || card === root) return false;
      const quotedLeaves = visibleTextLeaves(card);
      const replyLeaves = visibleTextLeaves(root).filter((leaf) => !card.contains(leaf));
      return quotedLeaves.length >= 2 && replyLeaves.length >= 1;
    });
  }

  function quotedAncestor(node, root) {
    let current = node;
    for (let depth = 0; current && current !== root && depth < 9; depth += 1, current = current.parentElement) {
      if (looksLikeQuotedBlock(current, root)) return current;
    }
    return null;
  }

  function isQuotedOrControlNode(node, root) {
    if (quotedAncestor(node, root)) return true;
    const control = node.closest?.(MESSAGE_CONTROL_SELECTOR);
    return Boolean(control && control !== root);
  }

  function messageRawId(root, scroller) {
    const attributes = ['data-msg-id', 'data-message-id', 'data-id', 'data-key'];
    let current = root;
    for (let depth = 0; current && current !== scroller && depth < 6; depth += 1, current = current.parentElement) {
      for (const name of attributes) {
        const value = stableAttributeValue(name, current.getAttribute?.(name) || '');
        if (value) return `${name}:${value}`;
      }
      const id = stableAttributeValue('id', current.getAttribute?.('id') || '');
      if (id && /\d/.test(id)) return `id:${id}`;
    }
    return '';
  }

  function srcsetCandidates(value) {
    const text = String(value || '').trim();
    if (!text) return [];
    if (/^data:/i.test(text)) {
      return [text.replace(/\s+\d+(?:\.\d+)?[wx]\s*$/i, '').trim()];
    }
    return text.split(',')
      .map((item) => item.trim().replace(/\s+\d+(?:\.\d+)?[wx]\s*$/i, '').trim())
      .filter(Boolean);
  }

  function cssImageUrls(value) {
    const urls = [];
    const text = String(value || '');
    const pattern = /url\(\s*(["']?)(.*?)\1\s*\)/gi;
    let match = null;
    while ((match = pattern.exec(text))) {
      if (match[2]) urls.push(match[2]);
    }
    return urls;
  }

  function collectMedia(root) {
    const urls = new Set();
    const candidates = new Set();
    let hasVisualMedia = false;
    const remember = (rawValue) => {
      const raw = String(rawValue || '').trim();
      if (!raw) return;
      if (/^(blob:|data:)/i.test(raw)) {
        candidates.add(raw);
        return;
      }
      try {
        const url = new URL(raw, window.location.href);
        if (url.protocol !== 'https:') return;
        urls.add(url.href);
        candidates.add(url.href);
      } catch {
        // ignored
      }
    };
    const mediaNodes = new Set([
      root,
      ...[...root.querySelectorAll?.('img, picture, video, source, canvas, [role="img"], [style], [class]') || []].slice(0, 240),
    ]);
    mediaNodes.forEach((node) => {
      if (!isVisible(node) || isQuotedOrControlNode(node, root)) return;
      const rect = node.getBoundingClientRect();
      const classes = normalize(`${node.className || ''} ${classTrail(node, root)}`);
      if (rect.width < 38 || rect.height < 38 || /avatar|reaction|toolbar|button-icon/i.test(classes)) return;

      const beforeCount = candidates.size;
      if (node.matches?.('img, video, source')) {
        [
          node.currentSrc,
          node.src,
          node.poster,
          ...['src', 'data-src', 'data-original', 'data-lazy-src', 'data-image', 'data-url', 'poster']
            .map((name) => node.getAttribute?.(name)),
        ].forEach(remember);
        srcsetCandidates(node.srcset || node.getAttribute?.('srcset') || node.getAttribute?.('data-srcset')).forEach(remember);
      }
      if (node.matches?.('canvas') && Number(node.width || 0) >= 38 && Number(node.height || 0) >= 38) {
        try {
          remember(node.toDataURL('image/jpeg', 0.88));
        } catch {
          // A cross-origin canvas cannot be copied; other candidate URLs may still work.
        }
      }
      for (const pseudo of [null, '::before', '::after']) {
        try {
          const style = window.getComputedStyle(node, pseudo);
          [style.backgroundImage, style.maskImage, style.webkitMaskImage, style.content]
            .flatMap(cssImageUrls)
            .forEach(remember);
        } catch {
          // Pseudo-element styles are not available in every Zalo/Chrome build.
        }
      }
      if (candidates.size > beforeCount || (node.matches?.('img, video, canvas') && rect.width >= 38 && rect.height >= 38)) {
        hasVisualMedia = true;
      }
    });
    return { urls: [...urls].slice(0, 10), candidates: [...candidates].slice(0, 10), hasVisualMedia };
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Không đọc được ảnh Zalo'));
      reader.readAsDataURL(blob);
    });
  }

  async function compressTransferImage(blob, maxBytes) {
    if (blob.size <= maxBytes) return blob;
    if (!/^image\//i.test(blob.type || '') || /gif|svg/i.test(blob.type || '') || typeof createImageBitmap !== 'function') return null;
    let bitmap = null;
    try {
      bitmap = await createImageBitmap(blob);
      const maxDimension = 1800;
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width || 1, bitmap.height || 1));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.86, 0.72, 0.58]) {
        const compressed = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (compressed && compressed.size <= maxBytes) return compressed;
      }
      return null;
    } catch {
      return null;
    } finally {
      try { bitmap?.close?.(); } catch {}
    }
  }

  async function hydrateMediaRows(rows, state) {
    for (const row of rows) {
      const uploads = [];
      for (const sourceUrl of row.media_candidates || []) {
        if (state.count >= state.maxCount || state.totalBytes >= state.maxTotalBytes) break;
        let cached = state.cache.get(sourceUrl);
        if (cached === undefined) {
          cached = null;
          try {
            const response = await fetch(sourceUrl, { credentials: 'include' });
            if (response.ok) {
              const original = await response.blob();
              if (/^image\//i.test(original.type || '')) {
                const transferable = await compressTransferImage(original, state.maxItemBytes);
                if (transferable && state.totalBytes + transferable.size <= state.maxTotalBytes) {
                  const dataUrl = await blobToDataUrl(transferable);
                  if (dataUrl) cached = { data_url: dataUrl, byte_size: transferable.size, content_type: transferable.type || 'image/jpeg' };
                }
              }
            }
          } catch {
            // Keep the original HTTPS URL when Zalo blocks a local copy.
          }
          state.cache.set(sourceUrl, cached);
          if (cached) {
            state.count += 1;
            state.totalBytes += cached.byte_size;
          } else {
            state.missed += 1;
          }
        }
        if (cached) uploads.push({ source_url: sourceUrl, data_url: cached.data_url, content_type: cached.content_type });
      }
      row.media_uploads = uploads;
      delete row.media_candidates;
    }
    return rows;
  }

  function leafTextCandidates(root) {
    const selectors = '[dir="auto"], p, span, small, div, li, [class*="text"], [class*="content"]';
    return [...root.querySelectorAll(selectors)].filter((node) => {
      if (!isVisible(node) || isQuotedOrControlNode(node, root)) return false;
      const text = normalize(node.innerText || node.textContent || '');
      if (!text) return false;
      const directText = normalize([...node.childNodes]
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent || '')
        .join(' '));
      if (directText) return true;
      return ![...node.children].some((child) => normalize(child.innerText || child.textContent || ''));
    });
  }

  function extractMessageText(root, title, marker = null) {
    const parts = [];
    leafTextCandidates(root).forEach((node) => {
      const directText = normalize([...node.childNodes]
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent || '')
        .join(' '));
      const text = cleanMessageText(directText || normalize(node.innerText || node.textContent || ''), marker);
      if (isNoiseText(text, title, { structuralMessage: true })) return;
      if (parts[parts.length - 1] === text || parts.includes(text)) return;
      parts.push(text);
    });
    if (parts.length) return cleanMessageText(parts.join('\n'), marker);
    const fallback = cleanMessageText(root.innerText || root.textContent || '', marker);
    if (parseTimelineMarker(fallback) || isNoiseText(fallback, title, { structuralMessage: true })) return '';
    return fallback;
  }

  function directDisplayMarker(root) {
    const candidates = [root, ...root.querySelectorAll('time, abbr, [class*="time"], [class*="date"], span, small, div')];
    const rootRect = root.getBoundingClientRect();
    let best = null;
    candidates.forEach((node) => {
      if (!isVisible(node) || isQuotedOrControlNode(node, root)) return;
      const explicit = normalize(node.getAttribute?.('datetime') || node.getAttribute?.('data-utime') || '');
      const directText = normalize([...node.childNodes]
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent || '')
        .join(' '));
      const marker = [explicit, directText, normalize(node.innerText || node.textContent || '')]
        .map(stripZaloIconArtifacts)
        .map((value) => parseTimelineMarker(value))
        .find((value) => value && ['time', 'datetime'].includes(value.kind));
      if (!marker || !['time', 'datetime'].includes(marker.kind)) return;
      const rect = node.getBoundingClientRect();
      const score = (marker.kind === 'datetime' ? 200 : 0)
        - Math.abs(rootRect.bottom - rect.bottom)
        - Math.max(0, rect.height - 40) * 2;
      if (!best || score > best.score) best = { marker, score };
    });
    return best?.marker || null;
  }

  function timelineDateMarkers(scroller) {
    const byKey = new Map();
    const nodes = scroller.querySelectorAll('time, abbr, [class*="time"], [class*="date"], span, p, div');
    nodes.forEach((node) => {
      if (!isInsideScrollerViewport(node, scroller)) return;
      const marker = parseTimelineMarker(node.getAttribute?.('datetime') || node.innerText || node.textContent || '');
      if (!marker?.dateKey) return;
      const rect = node.getBoundingClientRect();
      const key = `${marker.dateKey}|${Math.round(rect.top)}`;
      if (!byKey.has(key)) byKey.set(key, { ...marker, top: rect.top });
    });
    return [...byKey.values()].sort((a, b) => a.top - b.top);
  }

  function nearestDateKey(root, dateMarkers) {
    const top = root.getBoundingClientRect().top;
    let current = '';
    for (const marker of dateMarkers) {
      if (marker.top <= top + 3) current = marker.dateKey;
      else break;
    }
    return current;
  }

  function collectMessageRoots(scroller) {
    const selector = '[data-id], [data-key], [data-msg-id], [data-message-id], [class*="message"], [class*="msg-"], [class*="bubble"], [class*="chat-item"], [dir="auto"], [role="img"], img, picture, video, source, canvas, div[class*="text"], div[class*="content"], p, span';
    const roots = new Set();
    const considerNode = (node) => {
      if (!isInsideScrollerViewport(node, scroller) || isQuotedOrControlNode(node, scroller)) return;
      const text = normalize(node.innerText || node.textContent || '');
      const hasMedia = node.matches('img, picture, video, source, canvas, [role="img"]')
        || node.querySelector?.('img, picture, video, source, canvas, [role="img"], [style*="background"], [style*="image"]');
      if ((!text || isTimestampText(text)) && !hasMedia) return;
      const root = messageRootForLeaf(node, scroller);
      if (validMessageContainer(root, scroller)) roots.add(root);
      else if (validMessageContainer(node, scroller)) roots.add(node);
    };
    scroller.querySelectorAll(selector).forEach(considerNode);

    // Zalo frequently ships minified class names. Keep a geometry-based fallback so
    // a UI rename cannot make a populated conversation look completely empty.
    if (roots.size < 3) {
      scroller.querySelectorAll('div, li').forEach((node) => {
        const directText = normalize([...node.childNodes]
          .filter((child) => child.nodeType === Node.TEXT_NODE)
          .map((child) => child.textContent || '')
          .join(' '));
        const directMedia = [...node.children].some((child) => child.matches?.('img, picture, video, source, canvas, [role="img"]'));
        if (!directText && !directMedia) return;
        considerNode(node);
      });
    }
    return [...roots].sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return (ra.top - rb.top) || (ra.left - rb.left);
    });
  }

  function messageContentKey(row, { looseTime = false } = {}) {
    const displayTime = normalize(row.display_time || '');
    const time = looseTime ? (displayTime.match(/\d{1,2}:\d{2}/)?.[0] || displayTime) : displayTime;
    const sender = normalize(row.sender_id || row.sender_name || '');
    return `${row.direction}|${sender}|${normalize(row.text)}|${time}|${(row.media_urls || []).join('|')}`;
  }

  function latestIncomingSignal(rows = []) {
    const list = Array.isArray(rows) ? rows : [];
    const latest = list[list.length - 1];
    if (!latest || latest.direction !== 'incoming') return null;
    return {
      key: messageContentKey(latest, { looseTime: true }),
      messageId: String(latest.message_id || ''),
      text: normalize(latest.text || ''),
    };
  }

  function collectMessages(scroller, limit, title, seed = '', round = 0, ignoredReplyIds = null, skippedReplyIds = null) {
    const roots = collectMessageRoots(scroller);
    const dateMarkers = timelineDateMarkers(scroller);
    const rows = [];
    const nearbyContent = new Map();
    const senderNamesById = new Map();
    let previousIncoming = null;
    roots.forEach((root, index) => {
      if (root.closest?.('[contenteditable="true"], textarea, input, [role="textbox"]')) return;
      const media = collectMedia(root);
      const directMarker = directDisplayMarker(root);
      const senderDetails = senderFromNode(root, scroller, title);
      const senderNameExplicit = senderDetails.sender_name_explicit === true;
      const sender = { ...senderDetails };
      delete sender.sender_name_explicit;
      const rect = root.getBoundingClientRect();
      if (sender.direction === 'incoming') {
        const rememberedName = sender.sender_id ? senderNamesById.get(sender.sender_id) : '';
        if (sender.sender_name === 'Khách hàng' && rememberedName) sender.sender_name = rememberedName;
        const verticalGap = previousIncoming ? rect.top - previousIncoming.bottom : Infinity;
        const sameColumn = previousIncoming ? Math.abs(rect.left - previousIncoming.left) <= 90 : false;
        const compatibleAvatar = previousIncoming
          ? (!sender.sender_id || !previousIncoming.senderId || sender.sender_id === previousIncoming.senderId)
          : false;
        if (sender.sender_name === 'Khách hàng' && previousIncoming && verticalGap >= -8 && verticalGap <= 110 && sameColumn && compatibleAvatar) {
          sender.sender_name = previousIncoming.name;
          sender.sender_id = sender.sender_id || previousIncoming.senderId;
        }
        if (sender.sender_id && sender.sender_name !== 'Khách hàng') senderNamesById.set(sender.sender_id, sender.sender_name);
        previousIncoming = {
          name: sender.sender_name,
          senderId: sender.sender_id,
          left: rect.left,
          bottom: rect.bottom,
        };
      } else {
        previousIncoming = null;
      }
      let text = extractMessageText(root, title, directMarker);
      if (senderNameExplicit) text = stripSenderPrefix(text, sender.sender_name);
      if (!text && !media.hasVisualMedia) return;
      const finalText = text || '[Ảnh]';
      const dateKey = directMarker?.dateKey || nearestDateKey(root, dateMarkers);
      const sentAt = markerIso(directMarker, dateKey);
      const displayTime = markerDisplayTime(directMarker, dateKey);
      const rawId = messageRawId(root, scroller);
      const rawKey = rawId || `${sender.direction}|${finalText}|${displayTime}|${media.urls.join('|')}`;
      const row = {
        message_id: `zalo_dom_${hashString(`${seed}|${rawKey}`)}`,
        text: finalText,
        sent_at: sentAt,
        display_time: displayTime,
        dom_index: index,
        capture_round: round,
        source: 'zalo_web_dom',
        media_urls: media.urls,
        media_candidates: media.candidates,
        media_type: media.hasVisualMedia ? 'image' : 'text',
        dom_message_id: rawId,
        date_context: dateKey,
        ...sender,
      };
      if (containsReplyQuote(root)) {
        ignoredReplyIds?.add(row.message_id);
        skippedReplyIds?.add(row.message_id);
        const legacyText = cleanMessageText(root.innerText || root.textContent || '', directMarker);
        if (!rawId && legacyText) {
          const legacyKey = `${sender.direction}|${legacyText}|${displayTime}|${media.urls.join('|')}`;
          ignoredReplyIds?.add(`zalo_dom_${hashString(`${seed}|${legacyKey}`)}`);
        }
        return;
      }
      const contentKey = messageContentKey(row, { looseTime: true });
      const top = rect.top;
      const previous = nearbyContent.get(contentKey);
      if (previous && Math.abs(previous.top - top) < 14) {
        if (row.sent_at && !previous.row.sent_at) Object.assign(previous.row, row);
        return;
      }
      nearbyContent.set(contentKey, { top, row });
      rows.push(row);
    });
    return rows.slice(Math.max(0, rows.length - limit));
  }

  function mergeMessages(target, rows) {
    rows.forEach((row) => {
      const direct = target.get(row.message_id);
      if (direct) {
        target.set(row.message_id, {
          ...direct,
          ...row,
          sent_at: row.sent_at || direct.sent_at,
          display_time: row.display_time || direct.display_time,
          media_urls: [...new Set([...(direct.media_urls || []), ...(row.media_urls || [])])],
          media_uploads: row.media_uploads?.length ? row.media_uploads : (direct.media_uploads || []),
        });
        return;
      }
      const contentKey = messageContentKey(row, { looseTime: true });
      const existing = [...target.entries()].find(([, item]) => messageContentKey(item, { looseTime: true }) === contentKey);
      if (existing && (!row.dom_message_id || !existing[1].dom_message_id || row.dom_message_id === existing[1].dom_message_id)) {
        target.set(existing[0], {
          ...existing[1],
          ...row,
          message_id: existing[1].message_id,
          sent_at: row.sent_at || existing[1].sent_at,
          display_time: row.display_time || existing[1].display_time,
          media_urls: [...new Set([...(existing[1].media_urls || []), ...(row.media_urls || [])])],
          media_uploads: row.media_uploads?.length ? row.media_uploads : (existing[1].media_uploads || []),
        });
        return;
      }
      target.set(row.message_id, row);
    });
  }

  function visibleScrollerSignature(scroller) {
    const text = normalize(scroller.innerText || scroller.textContent || '').slice(0, 4000);
    return hashString(`${text}|${scroller.scrollHeight}|${scroller.scrollTop}`);
  }

  async function settleScroll(scroller, maxWaitMs, atTop) {
    try {
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    } catch {
      // ignored
    }
    const startedAt = Date.now();
    const minimumWait = Math.min(maxWaitMs, atTop ? 320 : 180);
    let previous = visibleScrollerSignature(scroller);
    let stableChecks = 0;
    while (Date.now() - startedAt < maxWaitMs) {
      await sleep(80);
      await nextPaint();
      const current = visibleScrollerSignature(scroller);
      stableChecks = current === previous ? stableChecks + 1 : 0;
      previous = current;
      if (Date.now() - startedAt >= minimumWait && stableChecks >= 2) break;
    }
  }

  function sortCollectedMessages(rows) {
    return rows.sort((a, b) => {
      const aTime = Date.parse(a.sent_at || '');
      const bTime = Date.parse(b.sent_at || '');
      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
      const roundOrder = Number(b.capture_round || 0) - Number(a.capture_round || 0);
      if (roundOrder) return roundOrder;
      return Number(a.dom_index || 0) - Number(b.dom_index || 0);
    });
  }

  async function collectAcrossScroll(scroller, title, identity, limit, payload = {}) {
    const messages = new Map();
    const ignoredReplyIds = new Set();
    const skippedReplyIds = new Set();
    const mediaState = {
      cache: new Map(),
      count: 0,
      missed: 0,
      totalBytes: 0,
      maxCount: 8,
      maxItemBytes: 3_200_000,
      maxTotalBytes: 12_000_000,
    };
    const originalBottomGap = Math.max(0, scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop);
    const maxScrolls = Math.max(1, Math.min(Number(payload.maxScrolls || 80), 260));
    const pauseMs = Math.max(320, Math.min(Number(payload.pauseMs || 600), 1400));
    const scrollStepRatio = Math.max(0.72, Math.min(Number(payload.scrollStepRatio || 0.92), 0.98));
    const deep = payload.deep !== false;
    const seed = identity.id;
    let rounds = 1;

    mergeMessages(messages, await hydrateMediaRows(collectMessages(scroller, limit, title, seed, 0, ignoredReplyIds, skippedReplyIds), mediaState));
    if (deep && messages.size < limit) {
      let stableRounds = 0;
      let stableTopRounds = 0;
      for (let step = 0; step < maxScrolls && messages.size < limit; step += 1) {
        const beforeTop = Number(scroller.scrollTop || 0);
        const beforeHeight = Number(scroller.scrollHeight || 0);
        const beforeCount = messages.size;
        const beforeSignature = visibleScrollerSignature(scroller);
        // Gần một trang mỗi nấc: đủ nhanh nhưng vẫn chồng lấn để không bỏ sót bong bóng.
        const jump = Math.max(420, Math.floor((scroller.clientHeight || window.innerHeight) * scrollStepRatio));
        scroller.scrollTop = Math.max(0, beforeTop - jump);
        const requestedTop = scroller.scrollTop <= 2;
        await settleScroll(scroller, pauseMs, requestedTop);
        rounds += 1;
        mergeMessages(messages, await hydrateMediaRows(collectMessages(scroller, limit, title, seed, step + 1, ignoredReplyIds, skippedReplyIds), mediaState));
        const afterTop = Number(scroller.scrollTop || 0);
        const afterHeight = Number(scroller.scrollHeight || 0);
        const afterSignature = visibleScrollerSignature(scroller);
        const unchanged = messages.size === beforeCount
          && Math.abs(afterTop - beforeTop) < 8
          && Math.abs(afterHeight - beforeHeight) < 8
          && afterSignature === beforeSignature;
        stableRounds = unchanged ? stableRounds + 1 : 0;
        const stableAtTop = requestedTop
          && afterTop <= 2
          && messages.size === beforeCount
          && Math.abs(afterHeight - beforeHeight) < 8;
        stableTopRounds = stableAtTop ? stableTopRounds + 1 : 0;
        if (stableTopRounds >= 2 || stableRounds >= 3) break;
      }
    }

    try {
      scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight - originalBottomGap);
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    } catch {
      // ignored
    }
    return {
      messages: sortCollectedMessages([...messages.values()]).slice(-limit),
      rounds,
      mediaCaptured: mediaState.count,
      mediaMissed: mediaState.missed,
      ignoredReplyIds: [...ignoredReplyIds].slice(0, 500),
      skippedReplyCount: skippedReplyIds.size,
    };
  }

  async function stableHeader(scroller) {
    let previous = '';
    let last = findConversationHeader(scroller);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await sleep(180);
      last = findConversationHeader(scroller);
      const current = normalize(last.text).toLocaleLowerCase('vi-VN');
      if (current && current === previous) return last;
      previous = current;
    }
    return last;
  }

  async function collectZaloThread(payload = {}) {
    const host = window.location.hostname;
    if (!host.endsWith('zalo.me')) {
      return { ok: false, final: true, error: 'Tab hiện tại không phải Zalo Web.' };
    }
    const composer = findComposer();
    const shell = findThreadShell(composer);
    const scroller = findMessageScroller(shell, composer);
    if (!scroller) {
      return {
        ok: false,
        final: true,
        error: 'Không xác định được khung cuộn tin nhắn Zalo. Hãy mở một hội thoại, tải lại Zalo Web rồi thử lại.',
      };
    }
    const header = await stableHeader(scroller);
    const title = cleanTitleText(header.text);
    if (!title) {
      return { ok: false, final: true, error: 'Chưa đọc được tên hội thoại từ phần đầu khung chat Zalo.' };
    }
    const identity = conversationIdentity(title, header.node, scroller);
    const headerKind = conversationKind(header.node, scroller);
    const visibleMessages = headerKind.type === 'unknown'
      ? collectMessages(scroller, 80, title, identity.id)
      : [];
    const kind = refineConversationKind(headerKind, visibleMessages);
    if (requiresGroupApproval(kind) && !kind.isGroup && !payload.metadataOnly && !payload.authorizedGroup) {
      return {
        ok: false,
        final: true,
        conversation_type: kind.type,
        group_evidence: kind.evidence,
        error: 'Nhóm Zalo này chưa được Admin xác nhận. Hãy gửi yêu cầu duyệt rồi đồng bộ lại.',
      };
    }
    const approvedAsGroup = kind.isGroup || payload.authorizedGroup === true;
    const conversationType = kind.type === 'private'
      ? 'private'
      : approvedAsGroup ? 'group' : 'unknown';
    const threadMetadata = {
      source: 'zalo_web_dom',
      conversation_id: identity.id,
      conversation_url: window.location.href,
      conversation_title: title,
      conversation_type: conversationType,
      is_group: approvedAsGroup,
      is_group_candidate: conversationType !== 'private',
      group_evidence: kind.evidence,
      customer_name: title,
      customer_id: identity.confidence === 'high' ? identity.id : '',
      participants: collectParticipants(title, identity),
      captured_at: new Date().toISOString(),
      identity_source: identity.source,
      identity_confidence: identity.confidence,
    };
    if (payload.metadataOnly) {
      return {
        ok: true,
        final: true,
        ...threadMetadata,
        messages: [],
        count: 0,
        warning: conversationType === 'private'
          ? 'Đã nhận diện chat riêng Zalo để đồng bộ trực tiếp.'
          : kind.isGroup
            ? 'Đã nhận diện nhóm Zalo để kiểm tra quyền đồng bộ.'
            : 'Đã gửi tên hội thoại để Admin xác nhận đây là nhóm Zalo.',
      };
    }
    const limit = Math.max(20, Math.min(Number(payload.limit || 1000), 8000));
    const collected = await collectAcrossScroll(scroller, title, identity, limit, payload);
    const headerAfter = findConversationHeader(scroller);
    const titleAfter = cleanTitleText(headerAfter.text);
    if (titleAfter && normalize(titleAfter).toLocaleLowerCase('vi-VN') !== normalize(title).toLocaleLowerCase('vi-VN')) {
      return {
        ok: false,
        final: true,
        error: 'Hội thoại Zalo đã thay đổi trong lúc đồng bộ. Hãy giữ nguyên cuộc chat và bấm đồng bộ lại.',
      };
    }
    const messages = collected.messages;
    return {
      ok: messages.length > 0,
      final: true,
      ...threadMetadata,
      messages,
      ignored_message_ids: collected.ignoredReplyIds,
      skipped_reply_count: collected.skippedReplyCount,
      count: messages.length,
      scan_rounds: collected.rounds,
      media_capture_count: collected.mediaCaptured,
      media_capture_warning: collected.mediaMissed
        ? `${collected.mediaMissed} ảnh Zalo không thể sao chép từ DOM.`
        : '',
      warning: messages.length
        ? `Đã quét ${messages.length} tin nhắn Zalo qua ${collected.rounds} lượt cuộn.${collected.skippedReplyCount ? ` Đã bỏ ${collected.skippedReplyCount} tin trả lời/trích dẫn.` : ''}`
        : 'Không thấy bong bóng tin nhắn trong hội thoại Zalo đang mở.',
    };
  }

  const testApi = {
    cleanTitleText,
    hashString,
    markerDisplayTime,
    markerIso,
    messageContentKey,
    latestIncomingSignal,
    parseTimelineMarker,
    cleanMessageText,
    containsReplyQuote,
    stripZaloIconArtifacts,
    classifyConversationKind,
    requiresGroupApproval,
    refineConversationKind,
    stableAttributeValue,
    stableIdValue,
    srcsetCandidates,
    cssImageUrls,
    senderNameText,
    stripSenderPrefix,
  };
  if (typeof globalThis !== 'undefined' && globalThis.__STREAL_ZALO_TEST_MODE__) {
    globalThis.__STREAL_ZALO_TEST_API__ = testApi;
    return;
  }

  function startIncomingMessageWatcher() {
    if (globalThis.__STREAL_ZALO_AUTO_WATCHER__) return;
    globalThis.__STREAL_ZALO_AUTO_WATCHER__ = true;
    let timer = null;
    let running = false;
    let conversationId = '';
    let lastIncomingKey = '';

    const inspect = async () => {
      if (running) return;
      running = true;
      try {
        const composer = findComposer();
        const shell = findThreadShell(composer);
        const scroller = findMessageScroller(shell, composer);
        if (!scroller) return;
        const bottomGap = Math.max(0, scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop);
        if (bottomGap > 180) return;
        const header = findConversationHeader(scroller);
        const title = cleanTitleText(header.text);
        if (!title) return;
        const identity = conversationIdentity(title, header.node, scroller);
        const firstInspection = !conversationId;
        const conversationChanged = Boolean(conversationId && conversationId !== identity.id);
        if (firstInspection || conversationChanged) {
          conversationId = identity.id;
          lastIncomingKey = '';
        }
        const signal = latestIncomingSignal(collectMessages(scroller, 100, title, identity.id));
        if (!signal?.key) return;
        if (firstInspection) {
          lastIncomingKey = signal.key;
          return;
        }
        if (signal.key === lastIncomingKey) return;
        lastIncomingKey = signal.key;
        await chrome.runtime.sendMessage({
          type: 'STREAL_ZALO_INCOMING_MESSAGE_DETECTED',
          payload: {
            autoDetected: true,
            expectedConversationId: identity.id,
            trigger_message_id: signal.messageId,
            trigger_text: signal.text,
          },
        }).catch(() => null);
      } finally {
        running = false;
      }
    };

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void inspect(), 350);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    setInterval(() => void inspect(), 2000);
    setTimeout(() => void inspect(), 800);
  }

  // Theo dõi đúng bong bóng đến mới nhất như bộ đồng bộ sale-fsolution.
  startIncomingMessageWatcher();

  const HAHOA_KEY_ATTRIBUTES = ['data-conversation-id', 'data-thread-id', 'data-uid', 'data-user-id', 'data-zalo-id', 'data-id', 'data-key', 'id'];

  function hahoaFindByConversationKey(key) {
    const wanted = normalize(key);
    if (!wanted) return null;
    for (const attribute of HAHOA_KEY_ATTRIBUTES) {
      for (const node of document.querySelectorAll('[' + attribute + ']')) {
        if (node.getAttribute(attribute) === wanted && isVisible(node)) return node;
      }
    }
    return null;
  }

  function hahoaClick(node) {
    const target = node?.closest?.('a, button, [role="button"], [role="listitem"]') || node;
    if (!target || !isVisible(target)) return false;
    target.scrollIntoView?.({ block: 'center' });
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    target.click();
    return true;
  }

  function hahoaSearchInput() {
    return [...document.querySelectorAll('input, [contenteditable="true"]')]
      .filter((node) => {
        if (!isVisible(node)) return false;
        const rect = node.getBoundingClientRect();
        const hint = normalize((node.getAttribute('placeholder') || '') + ' ' + (node.getAttribute('aria-label') || '')).toLocaleLowerCase('vi-VN');
        return rect.top < 190
          && rect.left < Math.min(window.innerWidth * 0.46, 650)
          && (hint.includes('tìm') || hint.includes('search') || node.tagName === 'INPUT');
      })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] || null;
  }

  function hahoaSetSearch(input, value) {
    input.focus();
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      const prototype = input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
    } else {
      input.textContent = value;
    }
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function hahoaSearchResult(query, displayName) {
    const wanted = normalize(query).toLocaleLowerCase('vi-VN');
    const wantedName = normalize(displayName).toLocaleLowerCase('vi-VN');
    return [...document.querySelectorAll('[role="listitem"], li, [class*="item"], [class*="contact"], [class*="friend"]')]
      .map((node) => {
        if (!isVisible(node)) return null;
        const rect = node.getBoundingClientRect();
        if (rect.left > Math.min(window.innerWidth * 0.56, 760) || rect.top < 70) return null;
        const value = normalize(node.innerText || node.textContent || '').toLocaleLowerCase('vi-VN');
        const matchedBy = wanted && value.includes(wanted) ? 'query' : wantedName && value.includes(wantedName) ? 'name' : '';
        return matchedBy ? { node, matchedBy } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.node.getBoundingClientRect().top - b.node.getBoundingClientRect().top)[0] || null;
  }

  async function hahoaOpenContact(payload = {}) {
    const keyNode = hahoaFindByConversationKey(payload.conversationKey);
    if (keyNode && hahoaClick(keyNode)) {
      await sleep(650);
      return { ok: true, exact: true, method: 'conversation_key' };
    }
    const phone = String(payload.phone || '').replace(/[^\d+]/g, '');
    const displayName = normalize(payload.displayName);
    const query = phone || displayName;
    if (!query) return { ok: false, error: 'Liên hệ chưa có SĐT hoặc mã hội thoại.' };
    const input = hahoaSearchInput();
    if (!input) return { ok: false, error: 'Không tìm thấy ô tìm kiếm Zalo. Hãy mở trang Tin nhắn rồi thử lại.' };
    hahoaSetSearch(input, query);
    for (let attempt = 0; attempt < 14; attempt += 1) {
      await sleep(250);
      const result = hahoaSearchResult(query, displayName);
      if (!result || !hahoaClick(result.node)) continue;
      await sleep(750);
      return {
        ok: true,
        exact: result.matchedBy === 'query',
        method: phone ? 'phone_search' : 'name_search',
        warning: result.matchedBy === 'query' ? '' : 'Đã mở kết quả gần nhất theo tên; hãy kiểm tra lại nếu có người trùng tên.',
      };
    }
    return { ok: false, error: 'Không tìm thấy ' + (displayName || phone) + ' trong kết quả Zalo.' };
  }

  function hahoaMessageType(value) {
    const raw = normalize(value).toLocaleLowerCase('vi-VN');
    if (raw === 'image' || raw === 'photo' || raw === 'video') return 'image';
    if (raw === 'file') return 'file';
    if (raw === 'system') return 'system';
    return 'text';
  }

  async function hahoaCaptureThread(options = {}) {
    const metadata = await collectZaloThread({ metadataOnly: true });
    if (!metadata?.ok) return metadata;
    const expectedConversationId = String(options.expectedConversationId || '');
    if (expectedConversationId && metadata.conversation_id !== expectedConversationId) {
      return { ok: false, error: 'Hội thoại Zalo đã thay đổi. Hãy giữ nguyên cuộc chat rồi thử lại.' };
    }
    const automatic = options.autoDetected === true;
    const result = await collectZaloThread({
      limit: Number(options.limit) || (automatic ? 60 : 8000),
      maxScrolls: Number(options.maxScrolls) || (automatic ? 1 : 220),
      pauseMs: Number(options.pauseMs) || (automatic ? 320 : 420),
      scrollStepRatio: Number(options.scrollStepRatio) || (automatic ? 0.82 : 0.96),
      deep: automatic ? false : options.deep !== false,
      authorizedGroup: true,
    });
    const rows = Array.isArray(result?.messages) ? result.messages : [];
    const title = result?.conversation_title || metadata.conversation_title || '';
    return {
      ok: Boolean(title),
      error: title ? '' : (result?.error || metadata.error || 'Không đọc được hội thoại Zalo.'),
      warning: result?.warning || result?.media_capture_warning || '',
      displayName: title,
      phone: '',
      conversationId: result?.conversation_id || metadata.conversation_id || '',
      conversationKey: result?.customer_id || metadata.customer_id || result?.conversation_id || metadata.conversation_id || '',
      conversationUrl: result?.conversation_url || metadata.conversation_url || window.location.href,
      capturedAt: result?.captured_at || metadata.captured_at || new Date().toISOString(),
      identitySource: result?.identity_source || metadata.identity_source || '',
      scanRounds: Number(result?.scan_rounds || 0),
      automatic,
      triggerMessageKey: String(options.triggerMessageKey || ''),
      triggerText: String(options.triggerText || ''),
      messageCount: rows.length,
      messages: rows.map((row, index) => ({
        messageKey: row.message_id || ('zalo_message_' + hashString((row.direction || '') + '|' + (row.text || '') + '|' + (row.display_time || '') + '|' + index)),
        direction: row.direction === 'outgoing' ? 'outgoing' : row.direction === 'system' ? 'system' : 'incoming',
        senderName: row.sender_name || (row.direction === 'outgoing' ? 'Nhân viên' : (title || 'Khách hàng')),
        body: normalize(row.text || '') || (row.media_type === 'image' ? '[Ảnh]' : '[Nội dung không có văn bản]'),
        displayTime: row.display_time || '',
        sentAt: row.sent_at || '',
        messageType: hahoaMessageType(row.media_type),
        sortOrder: index,
      })),
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'HAHOA_ZALO_CAPTURE_ACTIVE_V4') {
      hahoaCaptureThread(message.payload || {})
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    if (message?.type === 'HAHOA_ZALO_CAPTURE_AUTO_V4') {
      hahoaCaptureThread({ ...(message.payload || {}), autoDetected: true })
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    if (message?.type === 'HAHOA_ZALO_OPEN_CONTACT_V4') {
      hahoaOpenContact(message.payload || {})
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    if (message?.type === 'STREAL_ZALO_COLLECT_THREAD') {
      collectZaloThread(message.payload || {})
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, final: true, error: error?.message || String(error) }));
      return true;
    }
    return false;
  });
})();
