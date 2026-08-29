(() => {
  if (window.__HAHOA_ZALO_CONTENT__) return;
  window.__HAHOA_ZALO_CONTENT__ = true;

  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const fold = (value) => normalize(value).toLocaleLowerCase('vi-VN');

  function isVisible(node) {
    if (!(node instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 2 && rect.height > 2;
  }

  function cleanTitle(value) {
    return normalize(value)
      .replace(/^\(\d+\)\s*/, '')
      .replace(/\s*[-|–]\s*Zalo\s*$/i, '')
      .replace(/^(Zalo|Tin nhắn|Danh bạ)$/i, '');
  }

  function selectedConversation() {
    const selectors = '[aria-selected="true"], [data-selected="true"], [class*="selected"], [class*="active"]';
    const candidates = [...document.querySelectorAll(selectors)].filter((node) => {
      if (!isVisible(node)) return false;
      const rect = node.getBoundingClientRect();
      const text = cleanTitle(node.textContent || '');
      return rect.left < Math.min(window.innerWidth * 0.48, 620) && rect.width > 80 && text.length > 0 && text.length < 220;
    });
    return candidates.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0] || null;
  }

  function findHeader() {
    const selectors = [
      '[class*="conversation-name"]', '[class*="chat-title"]', '[class*="display-name"]',
      '[class*="header"] [class*="name"]', '[role="heading"]', 'h1', 'h2', 'h3',
      '[class*="title"]', '[class*="name"]', '[title]'
    ];
    const candidates = [...document.querySelectorAll(selectors.join(','))].map((node) => {
      if (!isVisible(node)) return null;
      const rect = node.getBoundingClientRect();
      const text = cleanTitle(node.getAttribute('title') || node.textContent || '');
      if (!text || text.length > 100 || /^(Zalo|Tin nhắn|Danh bạ|Cloud của tôi)$/i.test(text)) return null;
      let score = 0;
      if (rect.top < 180) score += 6;
      if (rect.left > 230) score += 5;
      if (rect.left > window.innerWidth * 0.25) score += 3;
      if (rect.height < 80) score += 2;
      if (/^(H1|H2|H3)$/.test(node.tagName) || node.getAttribute('role') === 'heading') score += 2;
      return { node, text, score };
    }).filter(Boolean).sort((a, b) => b.score - a.score);

    if (candidates[0]?.text) return candidates[0];
    const selected = selectedConversation();
    const selectedText = cleanTitle(selected?.textContent || '');
    if (selectedText) return { node: selected, text: selectedText.split(/\n/)[0], score: 0 };
    return { node: null, text: cleanTitle(document.title), score: -1 };
  }

  function stableValue(value) {
    const text = normalize(value);
    if (!text || text.length < 3 || text.length > 300) return '';
    if (/^(active|selected|true|false|chat|conversation|panel|content|main|root)$/i.test(text)) return '';
    return text;
  }

  const KEY_ATTRIBUTES = ['data-conversation-id', 'data-thread-id', 'data-uid', 'data-user-id', 'data-zalo-id', 'data-id', 'data-key', 'id'];

  function keyFromElement(node) {
    let current = node;
    for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
      for (const attribute of KEY_ATTRIBUTES) {
        const value = stableValue(current.getAttribute?.(attribute));
        if (!value) continue;
        if (/^(data-id|data-key|id)$/.test(attribute) && !/\d/.test(value) && !/^[a-f0-9-]{8,}$/i.test(value)) continue;
        return { key: value, source: attribute };
      }
      const href = current.getAttribute?.('href') || current.querySelector?.('a[href]')?.getAttribute('href');
      if (href) {
        try {
          const url = new URL(href, window.location.href);
          const token = stableValue(url.hash.replace(/^#\/?/, '') || url.searchParams.get('id') || url.searchParams.get('uid'));
          if (token) return { key: token, source: 'href' };
        } catch {}
      }
    }
    return { key: '', source: 'none' };
  }

  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16).padStart(8, '0');
  }

  function phoneFromHeader(headerNode) {
    let root = headerNode;
    for (let depth = 0; root && depth < 5; depth += 1, root = root.parentElement) {
      const match = normalize(root.textContent || '').match(/(?:\+?84|0)(?:[ .-]?\d){9}\b/);
      if (match) return match[0].replace(/[^\d+]/g, '');
    }
    return '';
  }

  function capture() {
    if (!window.location.hostname.endsWith('zalo.me')) return { ok: false, error: 'Tab hiện tại không phải Zalo Web.' };
    const header = findHeader();
    const displayName = cleanTitle(header.text);
    if (!displayName) return { ok: false, error: 'Hãy chọn một cuộc hội thoại trên Zalo Web rồi thử lại.' };
    const selected = selectedConversation();
    const identity = keyFromElement(selected || header.node);
    const conversationId = identity.key
      ? `zalo_${identity.source.replace(/[^a-z0-9]/gi, '_')}_${hash(identity.key)}`
      : `zalo_title_${hash(fold(displayName))}`;
    return {
      ok: true,
      displayName,
      phone: phoneFromHeader(header.node),
      conversationId,
      conversationKey: identity.key,
      conversationUrl: window.location.href,
      identitySource: identity.source,
      capturedAt: new Date().toISOString(),
    };
  }

  function clickTarget(node) {
    const target = node?.closest?.('a, button, [role="button"], [role="listitem"]') || node;
    if (!target || !isVisible(target)) return false;
    target.scrollIntoView?.({ block: 'center' });
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    target.click();
    return true;
  }

  function findByConversationKey(key) {
    if (!key) return null;
    for (const attribute of KEY_ATTRIBUTES) {
      for (const node of document.querySelectorAll(`[${attribute}]`)) {
        if (node.getAttribute(attribute) === key && isVisible(node)) return node;
      }
    }
    return null;
  }

  function findSearchInput() {
    const candidates = [...document.querySelectorAll('input, [contenteditable="true"]')].filter((node) => {
      if (!isVisible(node)) return false;
      const rect = node.getBoundingClientRect();
      const hint = fold(`${node.getAttribute('placeholder') || ''} ${node.getAttribute('aria-label') || ''}`);
      return rect.top < 180 && rect.left < Math.min(window.innerWidth * 0.45, 600)
        && (hint.includes('tìm') || hint.includes('search') || node.tagName === 'INPUT');
    });
    return candidates.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] || null;
  }

  function setSearchValue(input, value) {
    input.focus();
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      const prototype = input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      setter?.call(input, value);
    } else {
      input.textContent = value;
    }
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function contactResult(query, displayName) {
    const wanted = fold(query);
    const wantedName = fold(displayName);
    const candidates = [...document.querySelectorAll('[role="listitem"], li, [class*="item"], [class*="contact"], [class*="friend"]')].map((node) => {
      if (!isVisible(node)) return false;
      const rect = node.getBoundingClientRect();
      if (rect.left > Math.min(window.innerWidth * 0.55, 720) || rect.top < 70) return false;
      const text = fold(node.textContent || '');
      const matchedBy = wanted && text.includes(wanted) ? 'query' : wantedName && text.includes(wantedName) ? 'name' : '';
      return matchedBy ? { node, matchedBy } : null;
    }).filter(Boolean);
    return candidates.sort((a, b) => a.node.getBoundingClientRect().top - b.node.getBoundingClientRect().top)[0] || null;
  }

  async function openContact(payload = {}) {
    const keyMatch = findByConversationKey(normalize(payload.conversationKey));
    if (keyMatch && clickTarget(keyMatch)) {
      await sleep(650);
      return { ...capture(), ok: true, exact: true, method: 'conversation_key' };
    }

    const phone = String(payload.phone || '').replace(/[^\d+]/g, '');
    const displayName = normalize(payload.displayName);
    const query = phone || displayName;
    if (!query) return { ok: false, error: 'Liên hệ chưa có SĐT hoặc mã hội thoại.' };
    const input = findSearchInput();
    if (!input) return { ok: false, error: 'Không tìm thấy ô tìm kiếm Zalo. Hãy mở trang Tin nhắn rồi thử lại.' };
    setSearchValue(input, query);

    for (let attempt = 0; attempt < 12; attempt += 1) {
      await sleep(250);
      const result = contactResult(query, displayName);
      if (result && clickTarget(result.node)) {
        await sleep(800);
        const current = capture();
        const exact = result.matchedBy === 'query' || fold(current.displayName) === fold(displayName);
        return {
          ...current,
          ok: true,
          exact,
          method: phone ? 'phone_search' : 'name_search',
          warning: exact ? '' : 'Đã mở kết quả gần nhất theo tên; hãy kiểm tra lại nếu có nhiều người trùng tên.',
        };
      }
    }
    return { ok: false, error: `Không tìm thấy ${displayName || phone} trong kết quả Zalo.` };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'HAHOA_ZALO_CAPTURE_ACTIVE') {
      Promise.resolve(capture()).then(sendResponse);
      return true;
    }
    if (message?.type === 'HAHOA_ZALO_OPEN_CONTACT') {
      openContact(message.payload || {})
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    return false;
  });
})();
