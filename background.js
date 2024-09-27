let currentGroupName = null;
let isSwitchingGroups = false;

// Custom log function
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Initialize the extension
async function initialize() {
  log("Initializing extension...");
  const result = await browser.storage.local.get("currentGroupName");
  currentGroupName = result.currentGroupName || "Default Group";
  await browser.storage.local.set({ currentGroupName });
  await initializeDefaultGroup();
  registerTabListeners();
}

initialize();

// Initialize the default group
async function initializeDefaultGroup() {
  const { tabGroups } = await browser.storage.local.get("tabGroups");
  if (!tabGroups || !tabGroups["Default Group"]) {
    const currentWindow = await browser.windows.getCurrent();
    const tabs = await browser.tabs.query({ windowId: currentWindow.id, pinned: false });
    const tabData = tabs.map(tab => ({
      url: tab.url,
      title: tab.title, // Ensure title is stored
      pinned: tab.pinned,
      id: tab.id,
      windowId: tab.windowId,
      index: tab.index,
    }));
    const newTabGroups = tabGroups || {};
    newTabGroups["Default Group"] = tabData;
    await browser.storage.local.set({ tabGroups: newTabGroups });
    log("Initialized Default Group with current tabs");
  }
}

// Debounce function
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Reduce debounce time to 200ms
const debouncedUpdateCurrentGroupTabs = debounce(updateCurrentGroupTabs, 200);

// Register tab event listeners
function registerTabListeners() {
  browser.tabs.onCreated.addListener(tabCreatedListener);
  browser.tabs.onRemoved.addListener(tabRemovedListener);
  browser.tabs.onUpdated.addListener(tabUpdatedListener);
}

// Unregister tab event listeners
function unregisterTabListeners() {
  browser.tabs.onCreated.removeListener(tabCreatedListener);
  browser.tabs.onRemoved.removeListener(tabRemovedListener);
  browser.tabs.onUpdated.removeListener(tabUpdatedListener);
}

// Tab event listeners
async function tabCreatedListener(tab) {
  if (isSwitchingGroups || tab.pinned) return;
  const currentWindow = await browser.windows.getCurrent();
  if (tab.windowId !== currentWindow.id) return;
  debouncedUpdateCurrentGroupTabs();
}

async function tabRemovedListener(tabId, removeInfo) {
  if (isSwitchingGroups) return;
  const currentWindow = await browser.windows.getCurrent();
  if (removeInfo.windowId !== currentWindow.id) return;
  debouncedUpdateCurrentGroupTabs(); // Use debounced function
}

async function tabUpdatedListener(tabId, changeInfo, tab) {
  if (isSwitchingGroups || tab.pinned) return;
  const currentWindow = await browser.windows.getCurrent();
  if (tab.windowId !== currentWindow.id || !changeInfo.url) return;
  debouncedUpdateCurrentGroupTabs();
}

// Update the current group's tabs in storage
async function updateCurrentGroupTabs() {
  const currentWindow = await browser.windows.getCurrent();
  const { tabGroups } = await browser.storage.local.get("tabGroups");
  const tabs = await browser.tabs.query({ windowId: currentWindow.id, pinned: false });
  const tabData = tabs.map(tab => ({
    url: tab.url,
    title: tab.title, // Ensure title is stored
    pinned: tab.pinned,
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
  }));
  const newTabGroups = tabGroups || {};
  newTabGroups[currentGroupName] = tabData;
  await browser.storage.local.set({ tabGroups: newTabGroups });
  log(`Updated tabs for group: ${currentGroupName}`);

  // Notify the sidebar to update the dropdown for the specific group
  browser.runtime.sendMessage({ action: "tabsUpdated", groupName: currentGroupName, tabs: tabData });
}

// Switch to a different group
async function switchToGroup(groupName) {
  if (isSwitchingGroups || groupName === currentGroupName) return;
  isSwitchingGroups = true;
  await updateCurrentGroupTabs();

  const { tabGroups } = await browser.storage.local.get("tabGroups");
  if (!tabGroups || !tabGroups[groupName]) {
    isSwitchingGroups = false;
    return;
  }

  currentGroupName = groupName;
  await browser.storage.local.set({ currentGroupName });

  unregisterTabListeners();

  const currentWindow = await browser.windows.getCurrent();
  const currentTabIds = (await browser.tabs.query({ windowId: currentWindow.id, pinned: false })).map(tab => tab.id);

  const newGroupTabs = tabGroups[groupName];
  let newTabs = [];

  for (const tabInfo of newGroupTabs) {
    let tabUrl = tabInfo.url.startsWith('about:') ? 'about:blank' : tabInfo.url;
    try {
      new URL(tabUrl);
    } catch {
      tabUrl = 'about:blank';
    }
    const newTab = await browser.tabs.create({
      url: tabUrl,
      pinned: tabInfo.pinned,
      windowId: currentWindow.id,
      active: false,
      index: tabInfo.index,
    });
    newTabs.push(newTab);
  }

  if (newTabs.length === 0) {
    const newTab = await browser.tabs.create({ url: 'about:blank', windowId: currentWindow.id });
    newTabs.push(newTab);
  }

  await browser.tabs.update(newTabs[0].id, { active: true });

  if (currentTabIds.length > 0) {
    await browser.tabs.remove(currentTabIds);
  }

  await updateCurrentGroupTabs();
  registerTabListeners();
  isSwitchingGroups = false;
  browser.runtime.sendMessage({ action: "currentGroupChanged", currentGroupName });
}

// Listen for messages from the sidebar
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "createGroup") {
    createNewGroup(message.groupName).then(() => sendResponse({ success: true })).catch((error) => {
      console.error(error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (message.action === "switchGroup") {
    switchToGroup(message.groupName).then(() => sendResponse({ success: true })).catch((error) => {
      console.error(error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (message.action === "getGroups") {
    getGroups().then((groups) => sendResponse({ success: true, groups })).catch((error) => {
      console.error(error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (message.action === "focusTab") {
    focusTab(message.tabId, message.windowId).then(() => sendResponse({ success: true })).catch((error) => {
      console.error('Error focusing on tab:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (message.action === "getTabsForGroup") {
    getTabsForGroup(message.groupName).then((tabs) => sendResponse({ success: true, tabs })).catch((error) => {
      console.error('Error getting tabs for group:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// Get tabs for a specific group
async function getTabsForGroup(groupName) {
  const { tabGroups } = await browser.storage.local.get("tabGroups");
  return (tabGroups && tabGroups[groupName]) || [];
}

// Focus on a specific tab
async function focusTab(tabId, windowId) {
  await browser.tabs.update(tabId, { active: true });
  await browser.windows.update(windowId, { focused: true });
}

// Get groups from storage
async function getGroups() {
  let { tabGroups } = await browser.storage.local.get("tabGroups");
  if (!tabGroups || !tabGroups["Default Group"]) {
    const currentWindow = await browser.windows.getCurrent();
    const tabs = await browser.tabs.query({ windowId: currentWindow.id, pinned: false });
    const tabData = tabs.map(tab => ({
      url: tab.url,
      title: tab.title, // Ensure title is stored
      pinned: tab.pinned,
      id: tab.id,
      windowId: tab.windowId,
      index: tab.index,
    }));
    tabGroups = tabGroups || {};
    tabGroups["Default Group"] = tabData;
    await browser.storage.local.set({ tabGroups });
  }
  return tabGroups;
}

// Create a new group
async function createNewGroup(groupName) {
  const { tabGroups } = await browser.storage.local.get("tabGroups");
  if (tabGroups && tabGroups[groupName]) return;
  const newTabGroups = tabGroups || {};
  newTabGroups[groupName] = [];
  await browser.storage.local.set({ tabGroups: newTabGroups });
}
