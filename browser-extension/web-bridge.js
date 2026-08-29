(() => {
  if (window.__HAHOA_ZALO_WEB_BRIDGE__) return;
  window.__HAHOA_ZALO_WEB_BRIDGE__ = true;

  const PAGE_SOURCE = 'ha-hoa-web-page';
  const EXTENSION_SOURCE = 'ha-hoa-zalo-extension';

  function respond(message) {
    window.postMessage({ source: EXTENSION_SOURCE, ...message }, window.location.origin);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.source !== PAGE_SOURCE || data.type !== 'HAHOA_ZALO_BRIDGE_REQUEST') return;

    if (data.action === 'ping') {
      respond({ type: 'HAHOA_ZALO_BRIDGE_RESPONSE', requestId: data.requestId, ok: true, action: 'ping' });
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: 'HAHOA_ZALO_BRIDGE_COMMAND',
        requestId: data.requestId,
        action: data.action,
        payload: data.payload || {},
      },
      (response) => {
        if (chrome.runtime.lastError) {
          respond({
            type: 'HAHOA_ZALO_BRIDGE_RESPONSE',
            requestId: data.requestId,
            ok: false,
            error: chrome.runtime.lastError.message || 'Tiện ích Zalo không phản hồi.',
          });
          return;
        }
        respond({
          type: 'HAHOA_ZALO_BRIDGE_RESPONSE',
          requestId: data.requestId,
          ...(response || { ok: false, error: 'Tiện ích Zalo không phản hồi.' }),
        });
      },
    );
  });
})();
