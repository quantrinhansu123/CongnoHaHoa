/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function setupBackground() {
  const storage = {};
  const listeners = [];
  const sent = [];
  const chrome = {
    runtime: { onMessage: { addListener: (listener) => listeners.push(listener) } },
    storage: {
      local: {
        get: async (key) => ({ [key]: storage[key] }),
        set: async (value) => Object.assign(storage, value),
      },
    },
    tabs: {
      query: async (filter) => filter?.url
        ? [{ id: 7, url: 'https://chat.zalo.me/', active: true, status: 'complete' }]
        : [{ id: 9, url: 'https://cong-no-ha-hoa-jade.vercel.app/', active: true, status: 'complete' }],
      get: async (id) => ({ id, status: 'complete' }),
      sendMessage: async (tabId, message) => {
        sent.push({ tabId, message });
        if (message.type === 'HAHOA_ZALO_CAPTURE_AUTO_V4') {
          return {
            ok: true,
            displayName: 'Nguyễn Đắc Công',
            conversationId: 'zalo-contact-1',
            conversationKey: 'zalo-contact-1',
            messages: [{ messageKey: 'message-1', direction: 'incoming', body: 'Khách vừa nhắn', sortOrder: 0 }],
          };
        }
        return { ok: true };
      },
      update: async () => null,
      create: async () => null,
    },
    scripting: { executeScript: async () => [] },
    windows: { update: async () => null },
  };
  const context = {
    chrome,
    URL,
    Date,
    crypto: { randomUUID: () => 'event-1' },
    setTimeout: (callback) => { callback(); return 1; },
    clearTimeout: () => undefined,
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'background.js'), 'utf8'),
    context,
    { filename: 'background.js' },
  );
  return { storage, listeners, sent };
}

function send(listener, message, sender = {}) {
  return new Promise((resolve, reject) => {
    const keepAlive = listener(message, sender, resolve);
    if (keepAlive !== true) reject(new Error('Background không giữ cổng phản hồi bất đồng bộ.'));
  });
}

test('xếp tin Zalo mới vào hàng đợi và báo về website', async () => {
  const { storage, listeners, sent } = setupBackground();
  const result = await send(listeners[0], {
    type: 'STREAL_ZALO_INCOMING_MESSAGE_DETECTED',
    payload: {
      expectedConversationId: 'zalo-contact-1',
      trigger_message_id: 'message-1',
      trigger_text: 'Khách vừa nhắn',
    },
  }, { tab: { id: 7, url: 'https://chat.zalo.me/' } });
  assert.equal(result.ok, true);
  assert.equal(storage.hahoa_zalo_pending_captures_v1.length, 1);
  assert.equal(storage.hahoa_zalo_pending_captures_v1[0].capture.displayName, 'Nguyễn Đắc Công');
  assert.equal(sent.some((item) => item.tabId === 9 && item.message.type === 'HAHOA_ZALO_AUTO_CAPTURE_READY'), true);
});

test('website nhận lại hàng đợi rồi xác nhận đã xử lý', async () => {
  const { storage, listeners } = setupBackground();
  storage.hahoa_zalo_pending_captures_v1 = [{ eventId: 'event-1', capture: { ok: true } }];
  const drained = await send(listeners[0], { type: 'HAHOA_ZALO_BRIDGE_COMMAND', action: 'drain' });
  assert.equal(drained.captures.length, 1);
  const acknowledged = await send(listeners[0], {
    type: 'HAHOA_ZALO_BRIDGE_COMMAND',
    action: 'ack',
    payload: { eventId: 'event-1' },
  });
  assert.equal(acknowledged.pendingCount, 0);
  assert.equal(storage.hahoa_zalo_pending_captures_v1.length, 0);
});

test('đồng bộ thủ công dùng nấc cuộn lớn và giới hạn lịch sử sâu', async () => {
  const { listeners, sent } = setupBackground();
  const result = await send(listeners[0], { type: 'HAHOA_ZALO_BRIDGE_COMMAND', action: 'capture' });
  assert.equal(result.ok, true);
  const request = sent.find((item) => item.message.type === 'HAHOA_ZALO_CAPTURE_ACTIVE_V4');
  assert.equal(request.message.payload.limit, 8000);
  assert.equal(request.message.payload.maxScrolls, 220);
  assert.equal(request.message.payload.scrollStepRatio, 0.96);
  assert.equal(request.message.payload.pauseMs, 420);
});
