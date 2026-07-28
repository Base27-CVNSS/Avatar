const DASHBOARD_URL = chrome.runtime.getURL("index.html");
const NATIVE_HOST = "vn.base27.cybergirl";
const pending = new Map();
let nativePort = null;
let sequence = 0;

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: DASHBOARD_URL });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    installedAt: new Date().toISOString(),
    appVersion: chrome.runtime.getManifest().version,
    productName: "Cybergirl",
    nativeHostName: NATIVE_HOST
  });
});

function nativeErrorMessage() {
  const detail = chrome.runtime.lastError?.message || "";
  if (/host.*not found|specified native messaging host/i.test(detail)) {
    return "Chưa cài Cybergirl Companion hoặc Native Host chưa được đăng ký cho Microsoft Edge.";
  }
  return detail || "Companion cục bộ đã ngắt kết nối.";
}

function disconnectNative(reason = nativeErrorMessage()) {
  nativePort = null;
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer);
    reject(new Error(reason));
  }
  pending.clear();
  chrome.runtime.sendMessage({
    channel: "cybergirl-native-event",
    message: { event: "native.disconnected", data: { error: reason } }
  }).catch(() => {});
}

function ensureNativePort() {
  if (nativePort) return nativePort;
  nativePort = chrome.runtime.connectNative(NATIVE_HOST);
  nativePort.onMessage.addListener((message) => {
    if (message?.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.ok) item.resolve(message.result);
      else item.reject(new Error(message.error || "Companion trả về lỗi không xác định."));
      return;
    }
    if (message?.event) {
      chrome.runtime.sendMessage({
        channel: "cybergirl-native-event",
        message
      }).catch(() => {});
    }
  });
  nativePort.onDisconnect.addListener(() => disconnectNative());
  return nativePort;
}

function requestNative(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = `${Date.now().toString(36)}-${(sequence += 1).toString(36)}`;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Companion không phản hồi lệnh “${type}” trong thời gian cho phép.`));
    }, type === "chat" || type === "benchmark_tts" ? 180000 : 20000);
    pending.set(id, { resolve, reject, timer });
    try {
      ensureNativePort().postMessage({ id, type, payload });
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      disconnectNative(error.message);
      reject(error);
    }
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.channel !== "cybergirl-native-request") return false;
  requestNative(message.type, message.payload)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
