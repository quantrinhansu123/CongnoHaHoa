const ZALO_PATTERNS = ['https://chat.zalo.me/*', 'https://*.zalo.me/*'];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function findZaloTab() {
  const groups = await Promise.all(ZALO_PATTERNS.map((url) => chrome.tabs.query({ url }).catch(() => [])));
  const tabsById = new Map();
  groups.flat().forEach((tab) => {
    if (Number.isInteger(tab?.id)) tabsById.set(tab.id, tab);
  });
  const tabs = [...tabsById.values()];
  const chatTabs = tabs.filter((tab) => {
    try { return new URL(tab.url || '').hostname === 'chat.zalo.me'; } catch { return false; }
  });
  return chatTabs.find((tab) => tab.active)
    || chatTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0]
    || tabs.find((tab) => tab.active)
    || tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0]
    || null;
}

async function waitForTab(tabId, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.status === 'complete') return tab;
    await sleep(250);
  }
  throw new Error('Zalo Web tải quá lâu. Hãy mở lại tab Zalo rồi thử lại.');
}

async function sendToZalo(tabId, message) {
  let response;
  try {
    response = await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    const reason = String(error?.message || error || '');
    if (!/receiving end|could not establish connection|does not exist/i.test(reason)) throw error;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['zalo-content.js'] });
    await sleep(350);
    response = await chrome.tabs.sendMessage(tabId, message);
  }
  return response;
}

async function focusTab(tab) {
  if (!tab?.id) return;
  await chrome.tabs.update(tab.id, { active: true }).catch(() => null);
  if (Number.isInteger(tab.windowId)) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => null);
}

function safeConversationUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('zalo.me')) return '';
    return url.toString();
  } catch {
    return '';
  }
}

async function captureConversation() {
  const tab = await findZaloTab();
  if (!tab?.id) {
    return { ok: false, error: 'Hãy mở sẵn Zalo Web, chọn đúng cuộc hội thoại rồi bấm đồng bộ lại.' };
  }
  await waitForTab(tab.id);
  const result = await sendToZalo(tab.id, { type: 'HAHOA_ZALO_CAPTURE_ACTIVE' });
  if (!result?.ok) return result || { ok: false, error: 'Không đọc được cuộc hội thoại Zalo đang mở.' };
  return { ...result, zaloTabId: tab.id };
}

async function openConversation(payload = {}) {
  let tab = await findZaloTab();
  const requestedUrl = safeConversationUrl(payload.conversationUrl);

  if (!tab?.id) {
    tab = await chrome.tabs.create({ url: requestedUrl || 'https://chat.zalo.me/', active: true });
  } else if (requestedUrl && tab.url !== requestedUrl) {
    tab = await chrome.tabs.update(tab.id, { url: requestedUrl, active: true });
  }
  if (!tab?.id) return { ok: false, error: 'Không mở được Zalo Web.' };

  await focusTab(tab);
  await waitForTab(tab.id);
  const result = await sendToZalo(tab.id, {
    type: 'HAHOA_ZALO_OPEN_CONTACT',
    payload: {
      displayName: String(payload.displayName || ''),
      phone: String(payload.phone || ''),
      conversationKey: String(payload.conversationKey || ''),
      conversationId: String(payload.conversationId || ''),
    },
  }).catch((error) => ({ ok: false, error: error?.message || String(error) }));

  if (result?.ok) return { ...result, zaloTabId: tab.id };
  if (requestedUrl && requestedUrl !== 'https://chat.zalo.me/') {
    return { ok: true, exact: false, warning: result?.error || 'Đã mở liên kết Zalo; chưa xác nhận được đúng tiêu đề hội thoại.' };
  }
  return result || { ok: false, error: 'Không tìm thấy liên hệ trên Zalo Web.' };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'HAHOA_ZALO_BRIDGE_COMMAND') return false;
  const action = message.action;
  const task = action === 'capture'
    ? captureConversation()
    : action === 'open'
      ? openConversation(message.payload || {})
      : Promise.resolve({ ok: false, error: 'Lệnh Zalo không hợp lệ.' });
  task.then(sendResponse).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
