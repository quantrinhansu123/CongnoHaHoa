const ZALO_PATTERNS = ['https://chat.zalo.me/*', 'https://*.zalo.me/*'];
const PENDING_CAPTURE_KEY = 'hahoa_zalo_pending_captures_v1';
const MAX_PENDING_CAPTURES = 12;
const autoSyncQueues = new Map();

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function isHaHoaAppUrl(value) {
  try {
    const hostname = new URL(value || '').hostname.toLowerCase();
    return hostname === 'cong-no-ha-hoa-jade.vercel.app'
      || /^cong-no-ha-[a-z0-9-]+-huybitvvts-projects\.vercel\.app$/.test(hostname)
      || hostname === 'localhost'
      || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

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
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    const reason = String(error?.message || error || '');
    if (!/receiving end|could not establish connection|does not exist/i.test(reason)) throw error;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['zalo-content.js'] });
    await sleep(400);
    return chrome.tabs.sendMessage(tabId, message);
  }
}

async function injectLatestZaloBridge(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['zalo-content.js'] });
  await sleep(350);
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
  if (!tab?.id) return { ok: false, error: 'Hãy mở sẵn Zalo Web, chọn đúng cuộc hội thoại rồi bấm đồng bộ lại.' };
  await waitForTab(tab.id);
  await injectLatestZaloBridge(tab.id);
  const result = await sendToZalo(tab.id, {
    type: 'HAHOA_ZALO_CAPTURE_ACTIVE_V4',
    payload: { limit: 8000, maxScrolls: 220, pauseMs: 420, scrollStepRatio: 0.96, deep: true },
  });
  if (!result?.ok) return result || { ok: false, error: 'Không đọc được cuộc hội thoại Zalo đang mở.' };
  return { ...result, zaloTabId: tab.id };
}

async function openConversation(payload = {}) {
  let tab = await findZaloTab();
  const requestedUrl = safeConversationUrl(payload.conversationUrl);
  if (!tab?.id) tab = await chrome.tabs.create({ url: requestedUrl || 'https://chat.zalo.me/', active: true });
  else if (requestedUrl && tab.url !== requestedUrl) tab = await chrome.tabs.update(tab.id, { url: requestedUrl, active: true });
  if (!tab?.id) return { ok: false, error: 'Không mở được Zalo Web.' };

  await focusTab(tab);
  await waitForTab(tab.id);
  await injectLatestZaloBridge(tab.id);
  const result = await sendToZalo(tab.id, {
    type: 'HAHOA_ZALO_OPEN_CONTACT_V4',
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

async function pendingCaptures() {
  const stored = await chrome.storage.local.get(PENDING_CAPTURE_KEY);
  return Array.isArray(stored?.[PENDING_CAPTURE_KEY]) ? stored[PENDING_CAPTURE_KEY] : [];
}

async function savePendingCaptures(rows) {
  await chrome.storage.local.set({ [PENDING_CAPTURE_KEY]: rows.slice(-MAX_PENDING_CAPTURES) });
}

async function notifyApp(event) {
  const tabs = (await chrome.tabs.query({}).catch(() => []))
    .filter((tab) => Number.isInteger(tab?.id) && isHaHoaAppUrl(tab.url))
    .sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)) || (b.lastAccessed || 0) - (a.lastAccessed || 0));
  const tab = tabs[0];
  if (!tab?.id) return false;
  const message = { type: 'HAHOA_ZALO_AUTO_CAPTURE_READY', event };
  try {
    await chrome.tabs.sendMessage(tab.id, message);
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['web-bridge.js'] });
      await sleep(250);
      await chrome.tabs.sendMessage(tab.id, message);
      return true;
    } catch {
      return false;
    }
  }
}

async function queueAutomaticCapture(capture) {
  const rows = await pendingCaptures();
  const triggerKey = String(capture?.triggerMessageKey || capture?.messages?.at?.(-1)?.messageKey || '');
  const conversationKey = String(capture?.conversationKey || capture?.conversationId || '');
  const duplicate = rows.find((row) => row.triggerKey === triggerKey && row.conversationKey === conversationKey);
  if (duplicate) return duplicate;
  const event = {
    eventId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    triggerKey,
    conversationKey,
    capture,
  };
  await savePendingCaptures([...rows, event]);
  await notifyApp(event);
  return event;
}

async function acknowledgeCapture(eventId) {
  const rows = await pendingCaptures();
  const next = rows.filter((row) => row.eventId !== eventId);
  await savePendingCaptures(next);
  return { ok: true, pendingCount: next.length };
}

async function enqueueAutomaticZaloSync(message, sender) {
  const tabId = sender?.tab?.id;
  if (!Number.isInteger(tabId)) return { ok: false, error: 'Không xác định được tab Zalo phát hiện tin mới.' };
  const state = autoSyncQueues.get(tabId) || { running: false, queued: null };
  state.queued = message;
  autoSyncQueues.set(tabId, state);
  if (state.running) return { ok: true, queued: true };
  state.running = true;
  let lastResult = { ok: true };
  try {
    while (state.queued) {
      const current = state.queued;
      state.queued = null;
      await injectLatestZaloBridge(tabId);
      const result = await sendToZalo(tabId, {
        type: 'HAHOA_ZALO_CAPTURE_AUTO_V4',
        payload: {
          autoDetected: true,
          deep: false,
          limit: 60,
          maxScrolls: 1,
          pauseMs: 320,
          expectedConversationId: String(current?.payload?.expectedConversationId || ''),
          triggerMessageKey: String(current?.payload?.trigger_message_id || ''),
          triggerText: String(current?.payload?.trigger_text || ''),
        },
      });
      if (!result?.ok) {
        lastResult = result || { ok: false, error: 'Không đọc được tin Zalo mới.' };
        continue;
      }
      const capture = {
        ...result,
        automatic: true,
        triggerMessageKey: String(current?.payload?.trigger_message_id || result.triggerMessageKey || ''),
        triggerText: String(current?.payload?.trigger_text || result.triggerText || ''),
      };
      const event = await queueAutomaticCapture(capture);
      lastResult = { ok: true, queued: true, eventId: event.eventId };
    }
    return lastResult;
  } finally {
    state.running = false;
    if (!state.queued) autoSyncQueues.delete(tabId);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'STREAL_ZALO_INCOMING_MESSAGE_DETECTED') {
    enqueueAutomaticZaloSync(message, sender)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type !== 'HAHOA_ZALO_BRIDGE_COMMAND') return false;
  const action = message.action;
  const task = action === 'capture'
    ? captureConversation()
    : action === 'open'
      ? openConversation(message.payload || {})
      : action === 'drain'
        ? pendingCaptures().then((captures) => ({ ok: true, captures }))
        : action === 'ack'
          ? acknowledgeCapture(String(message.payload?.eventId || ''))
          : Promise.resolve({ ok: false, error: 'Lệnh Zalo không hợp lệ.' });
  task.then(sendResponse).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
