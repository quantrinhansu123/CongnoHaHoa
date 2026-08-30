/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadApi() {
  const context = {
    __STREAL_ZALO_TEST_MODE__: true,
    Date,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  const source = fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'zalo-content.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'zalo-content.js' });
  return context.__STREAL_ZALO_TEST_API__;
}

const api = loadApi();

test('đọc ngày và giờ hiển thị của Zalo', () => {
  assert.equal(api.parseTimelineMarker('CN 23/08/2026').dateKey, '2026-08-23');
  assert.equal(api.parseTimelineMarker('18:43 18/08/2026').kind, 'datetime');
  assert.equal(api.markerDisplayTime(api.parseTimelineMarker('17:58'), '2026-08-18'), '17:58 18/8/2026');
});

test('loại tiêu đề điều khiển và giữ tên hội thoại thật', () => {
  assert.equal(api.cleanTitleText('Nguyễn Đắc Công'), 'Nguyễn Đắc Công');
  assert.equal(api.cleanTitleText('Thêm bạn'), '');
  assert.equal(api.cleanTitleText('NGƯỜI LẠ'), '');
  assert.equal(api.cleanTitleText('Gửi yêu cầu kết bạn tới người này'), '');
});

test('nhận diện chat cá nhân và nhóm', () => {
  assert.equal(api.classifyConversationKind({ text: 'Nguyễn Đắc Công NGƯỜI LẠ' }).type, 'private');
  assert.equal(api.classifyConversationKind({ text: 'Nhóm khách hàng 25 thành viên' }).isGroup, true);
  assert.equal(api.requiresGroupApproval({ type: 'private' }), false);
  assert.equal(api.requiresGroupApproval({ type: 'group' }), true);
});

test('làm sạch nội dung và gộp bong bóng trùng khi cuộn', () => {
  const marker = api.parseTimelineMarker('15:08');
  assert.equal(api.cleanMessageText('400 b 15:08 /-strong /-heart :> :o :-(( :-h', marker), '400 b');
  const base = { direction: 'outgoing', text: 'bác còn gpt k ạ', media_urls: [] };
  assert.equal(
    api.messageContentKey({ ...base, display_time: '17:58' }, { looseTime: true }),
    api.messageContentKey({ ...base, display_time: '17:58 18/8/2026' }, { looseTime: true }),
  );
});

test('chỉ lấy tin khách mới nhất để AI gợi ý', () => {
  const signal = api.latestIncomingSignal([
    { direction: 'incoming', sender_id: 'customer-a', text: 'Tin cũ', display_time: '10:00', media_urls: [], message_id: 'm1' },
    { direction: 'outgoing', sender_id: 'sale', text: 'Sale trả lời', display_time: '10:01', media_urls: [], message_id: 'm2' },
    { direction: 'incoming', sender_id: 'customer-a', text: 'Giá này đắt quá', display_time: '10:02', media_urls: [], message_id: 'm3' },
  ]);
  assert.equal(signal.messageId, 'm3');
  assert.equal(signal.text, 'Giá này đắt quá');
});
