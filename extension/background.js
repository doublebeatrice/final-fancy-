// background service worker
// 点击扩展图标时，在新标签页打开 panel（而非 popup，避免失焦销毁）

chrome.action.onClicked.addListener(() => {
  const panelUrl = chrome.runtime.getURL('panel.html');
  chrome.tabs.query({ url: panelUrl }, tabs => {
    if (tabs.length) {
      // 已有标签页，直接激活
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: panelUrl });
    }
  });
});
