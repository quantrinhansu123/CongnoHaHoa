(() => {
  if (window.__HAHOA_ZALO_WEB_BRIDGE_V130__) return;
  window.__HAHOA_ZALO_WEB_BRIDGE_V130__ = true;

  const PAGE_SOURCE = 'ha-hoa-web-page-v130';
  const EXTENSION_SOURCE = 'ha-hoa-zalo-extension-v130';

  function respond(message) {
    window.postMessage({ source: EXTENSION_SOURCE, ...message }, window.location.origin);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'HAHOA_ZALO_AUTO_CAPTURE_READY' && message.event) {
      respond({ type: 'HAHOA_ZALO_AUTO_CAPTURE_READY', event: message.event });
    }
    return false;
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.source !== PAGE_SOURCE || data.type !== 'HAHOA_ZALO_BRIDGE_REQUEST') return;

    if (data.action === 'ping') {
      respond({
        type: 'HAHOA_ZALO_BRIDGE_RESPONSE',
        requestId: data.requestId,
        ok: true,
        action: 'ping',
        extensionVersion: chrome.runtime.getManifest().version,
      });
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
