import type { RuntimeMessage } from '@dtypes/messages';

const CONTEXT_MENU_ID = 'wds-open-studio';

/** Reloading/updating the extension invalidates every content script
 *  already injected into open tabs (see resource-observer.ts) — Chrome
 *  never re-injects into tabs that predate the reload, only into tabs
 *  opened/navigated afterward. Re-running content.js here on every tab that
 *  matches the manifest's content_scripts pattern removes the need to
 *  manually refresh each tab after a dev rebuild.
 *
 *  This is a fresh script instance layered on top of the orphaned old one,
 *  not a true hot-swap: the old instance's MutationObserver/listeners are
 *  still technically present in the page, but they self-disconnect on their
 *  next tick once they detect the invalidated context (see isContextValid()
 *  in resource-observer.ts), so there's no lasting duplication. */
async function reinjectContentScriptIntoOpenTabs(): Promise<void> {
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  } catch {
    return;
  }
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch {
      // Restricted page (chrome://, Web Store, PDF viewer, etc.) — the
      // manifest's content_scripts never ran here either. Skip.
    }
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Open Web Data Studio',
    contexts: ['page']
  });
  // Keep the toolbar icon opening the popup by default; side panel is
  // opened explicitly via the OPEN_SIDE_PANEL message or its own command.
  void chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false });

  if (details.reason === 'update' || details.reason === 'install') {
    void reinjectContentScriptIntoOpenTabs();
  }
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
