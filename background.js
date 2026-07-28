const DASHBOARD_URL = chrome.runtime.getURL("index.html");

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: DASHBOARD_URL });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    installedAt: new Date().toISOString(),
    appVersion: chrome.runtime.getManifest().version
  });
});
