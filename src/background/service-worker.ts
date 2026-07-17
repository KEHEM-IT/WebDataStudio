import type { RuntimeMessage } from '@types/messages';

const CONTEXT_MENU_ID = 'wds-open-studio';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Open Web Data Studio',
    contexts: ['page']
  });
  // Keep the toolbar icon opening the popup by default; side panel is
  // opened explicitly via the OPEN_SIDE_PANEL message or its own command.
  void chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && tab?.id) {
    void chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === 'toggle-picker') {
    const msg: RuntimeMessage = { type: 'PICKER_START' };
    void chrome.tabs.sendMessage(tab.id, msg).catch(() => {
      /* content script not injected on this page (e.g. chrome:// URL) */
    });
  } else if (command === 'quick-export') {
    void chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === 'GET_ACTIVE_TAB_INFO') {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      const response: RuntimeMessage = {
        type: 'ACTIVE_TAB_INFO',
        url: tab?.url ?? '',
        title: tab?.title ?? '',
        tabId: tab?.id ?? -1
      };
      sendResponse(response);
    });
    return true; // async response
  }

  if (message.type === 'OPEN_SIDE_PANEL') {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) void chrome.sidePanel.open({ tabId: tab.id });
    });
    return false;
  }

  return false;
});
