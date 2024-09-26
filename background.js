// background.js

let logMessages = [];
let tabCreatedListener = null;
let tabRemovedListener = null;
let tabUpdatedListener = null;
let currentGroupName = null;
let isSwitchingGroups = false;

// Custom log function
function log(message) {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] ${message}`;
  console.log(formattedMessage);
  logMessages.push(formattedMessage);
}

// Initialize the extension
async function initialize() {
  log("Initializing extension...");
  const result = await browser.storage.local.get("currentGroupName");
  currentGroupName = result.currentGroupName;
  if (!currentGroupName) {
    currentGroupName = "Default Group";
    await browser.storage.local.set({ currentGroupName });
    log("Set currentGroupName to Default Group");
  }

  await initializeDefaultGroup();
  registerTabListeners();
}

initialize();

// Initialize the default group
async function initializeDefaultGroup() {
  const { tabGroups } = await browser.storage.local.get("tabGroups");
  if (!tabGroups || !tabGroups["Default Group"]) {
    // No default group exists yet, create it
    const currentWindow = await browser.windows.getCurrent();
    const tabs = await browser.tabs.query({ windowId: currentWindow.id, pinned: false });
    const tabData = tabs.map(tab => ({ url: tab.url, pinned: tab.pinned }));
    const newTabGroups = tabGroups || {};
    newTabGroups["Default Group"] = tabData;
    await browser.storage.local.set({ tabGroups: newTabGroups });
    log("Initialized Default Group with current tabs");
  }
}

// Register tab event listeners
function registerTabListeners() {
  // Tab created
  tabCreatedListener = async function(tab) {
    if (isSwitchingGroups) return;
    try {
      if (tab.pinned) return;

      const currentWindow = await browser.windows.getCurrent();
      if (tab.windowId !== currentWindow.id) return;

      log("Tab created: " + tab.url);
      await updateCurrentGroupTabs();
    } catch (error) {
      log("Error in tabCreatedListener: " + error);
    }
  };

  // Tab removed
  tabRemovedListener = async function(tabId, removeInfo) {
    if (isSwitchingGroups) return;
    try {
      const currentWindow = await browser.windows.getCurrent();
      if (removeInfo.windowId !== currentWindow.id) return;

      log("Tab removed: " + tabId);
      await updateCurrentGroupTabs();
    } catch (error) {
      log("Error in tabRemovedListener: " + error);
    }
  };

  // Tab updated
  tabUpdatedListener = async function(tabId, changeInfo, tab) {
    if (isSwitchingGroups) return;
    try {
      if (tab.pinned) return;

      const currentWindow = await browser.windows.getCurrent();
      if (tab.windowId !== currentWindow.id) return;

      if (changeInfo.url) {
        log("Tab updated: " + tabId + ", new URL: " + changeInfo.url);
        await updateCurrentGroupTabs();
      }
    } catch (error) {
      log("Error in tabUpdatedListener: " + error);
    }
  };

  browser.tabs.onCreated.addListener(tabCreatedListener);
  browser.tabs.onRemoved.addListener(tabRemovedListener);
  browser.tabs.onUpdated.addListener(tabUpdatedListener);
}

function unregisterTabListeners() {
  if (tabCreatedListener) {
    browser.tabs.onCreated.removeListener(tabCreatedListener);
    tabCreatedListener = null;
  }
  if (tabRemovedListener) {
    browser.tabs.onRemoved.removeListener(tabRemovedListener);
    tabRemovedListener = null;
  }
  if (tabUpdatedListener) {
    browser.tabs.onUpdated.removeListener(tabUpdatedListener);
    tabUpdatedListener = null;
  }
}

// Update the current group's tabs in storage
async function updateCurrentGroupTabs() {
  const currentWindow = await browser.windows.getCurrent();
  const { tabGroups } = await browser.storage.local.get("tabGroups");

  const tabs = await browser.tabs.query({ windowId: currentWindow.id, pinned: false });
  const tabData = tabs.map(tab => ({
    url: tab.url,
    title: tab.title,
    pinned: tab.pinned,
    id: tab.id, // Include tab ID for debugging
  }));

  const newTabGroups = tabGroups || {};
  newTabGroups[currentGroupName] = tabData;

  await browser.storage.local.set({ tabGroups: newTabGroups });
  log("Updated tabs for group: " + currentGroupName);
}

async function switchToGroup(groupName) {
  if (isSwitchingGroups) {
    log("Group switch already in progress");
    return;
  }
  isSwitchingGroups = true;
  log("Switching to group: " + groupName);
  const { tabGroups } = await browser.storage.local.get("tabGroups");

  if (groupName === currentGroupName) {
    log("Already in group: " + groupName);
    isSwitchingGroups = false;
    return;
  }

  // Save current group's tabs before switching
  await updateCurrentGroupTabs();

  if (!tabGroups || !tabGroups[groupName]) {
    log("Group does not exist: " + groupName);
    console.error("Group does not exist");
    isSwitchingGroups = false;
    return;
  }

  // Update current group name in storage and local variable
  currentGroupName = groupName;
  await browser.storage.local.set({ currentGroupName });
  log(`Updated current group to: ${currentGroupName}`);

  // Disable tab event listeners to prevent interference
  unregisterTabListeners();

  const currentWindow = await browser.windows.getCurrent();
  const currentWindowId = currentWindow.id;

  // Open a temporary tab to prevent window from closing
  let tempTab;
  try {
    tempTab = await browser.tabs.create({ url: "about:blank", windowId: currentWindowId });
    log("Opened temporary tab with ID: " + tempTab.id);
  } catch (error) {
    log("Error opening temporary tab: " + error);
    // Re-register event listeners before exiting
    registerTabListeners();
    isSwitchingGroups = false;
    return;
  }

  // Close all current tabs except pinned tabs and the temporary tab
  const currentTabs = await browser.tabs.query({ windowId: currentWindowId, pinned: false });
  const tabIdsToClose = currentTabs
    .filter(tab => tab.id !== tempTab.id) // Exclude the temporary tab from being closed
    .map(tab => tab.id);

  log("Closing tabs: " + tabIdsToClose.join(', '));

  if (tabIdsToClose.length > 0) {
    try {
      await browser.tabs.remove(tabIdsToClose);
    } catch (error) {
      log("Error removing tabs: " + error);
    }
  }

  // Open tabs from the new group
  const newGroupTabs = tabGroups[groupName];
  for (const tabInfo of newGroupTabs) {
    let tabUrl = tabInfo.url;

    // Check for privileged URLs
    if (tabUrl.startsWith('about:')) {
      log(`Cannot open privileged URL: ${tabUrl}. Replacing with 'about:blank'.`);
      tabUrl = 'about:blank';
    }

    // Validate the URL
    try {
      new URL(tabUrl);
    } catch (e) {
      log(`Invalid URL detected: ${tabUrl}. Replacing with 'about:blank'.`);
      tabUrl = 'about:blank';
    }

    // Attempt to open the tab
    try {
      const newTab = await browser.tabs.create({ url: tabUrl, pinned: tabInfo.pinned, windowId: currentWindowId });
      log(`Opened new tab: ${newTab.id}, URL: ${tabUrl}`);
    } catch (error) {
      log(`Error opening tab with URL ${tabUrl}: ${error}`);
    }
  }

  // Remove the temporary tab
  try {
    await browser.tabs.remove(tempTab.id);
    log("Removed temporary tab: " + tempTab.id);
  } catch (error) {
    log("Error removing temporary tab: " + error);
  }

  // Re-register tab event listeners
  registerTabListeners();
  isSwitchingGroups = false;

  // Send a message to the sidebar to update the UI
  browser.runtime.sendMessage({ action: "currentGroupChanged", currentGroupName });
}

// Listen for messages from the sidebar
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "createGroup") {
    createNewGroup(message.groupName).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error(error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (message.action === "switchGroup") {
    switchToGroup(message.groupName).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error(error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (message.action === "deleteGroup") {
    deleteGroup(message.groupName).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error(error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (message.action === "renameGroup") {
    renameGroup(message.oldName, message.newName).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error(error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (message.action === "getGroups") {
    getGroups().then((groups) => {
      sendResponse({ success: true, groups });
    }).catch((error) => {
      console.error(error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (message.action === "saveLogs") {
    saveLogsToFile().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error(error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// Function to save logs to a file
async function saveLogsToFile() {
  const blob = new Blob([logMessages.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  await browser.downloads.download({
    url: url,
    filename: 'extension_logs.txt',
    saveAs: true
  });

  URL.revokeObjectURL(url);
  log("Logs saved to file.");
}

// Get groups from storage
async function getGroups() {
  const groups = await browser.storage.local.get("tabGroups");
  return groups.tabGroups || {};
}

async function createNewGroup(groupName) {
  const { tabGroups } = await browser.storage.local.get("tabGroups");
  if (tabGroups && tabGroups[groupName]) {
    log("Group already exists: " + groupName);
    console.error("Group already exists");
    return;
  }
  const newTabGroups = tabGroups || {};

  // Initialize with current tabs
  const currentWindow = await browser.windows.getCurrent();
  const tabs = await browser.tabs.query({ windowId: currentWindow.id, pinned: false });
  const tabData = tabs.map(tab => ({
    url: tab.url,
    title: tab.title,
    pinned: tab.pinned,
    id: tab.id,
  }));

  newTabGroups[groupName] = tabData;
  await browser.storage.local.set({ tabGroups: newTabGroups });
  log("Created new group: " + groupName);
}

async function deleteGroup(groupName) {
  const { tabGroups } = await browser.storage.local.get("tabGroups");
  if (groupName === currentGroupName) {
    log("Cannot delete the currently active group: " + groupName);
    console.error("Cannot delete the currently active group");
    return;
  }
  if (!tabGroups || !tabGroups[groupName]) {
    log("Group does not exist: " + groupName);
    console.error("Group does not exist");
    return;
  }
  delete tabGroups[groupName];
  await browser.storage.local.set({ tabGroups });
  log("Deleted group: " + groupName);
}

async function renameGroup(oldName, newName) {
  const { tabGroups } = await browser.storage.local.get("tabGroups");

  if (!tabGroups || !tabGroups[oldName]) {
    log("Group does not exist: " + oldName);
    console.error("Group does not exist");
    return;
  }

  if (tabGroups[newName]) {
    log("A group with the new name already exists: " + newName);
    console.error("A group with the new name already exists");
    return;
  }

  tabGroups[newName] = tabGroups[oldName];
  delete tabGroups[oldName];

  await browser.storage.local.set({ tabGroups });
  log("Renamed group from " + oldName + " to " + newName);

  if (currentGroupName === oldName) {
    currentGroupName = newName;
    await browser.storage.local.set({ currentGroupName });
    log("Updated current group to: " + currentGroupName);

    // Send a message to update the sidebar
    browser.runtime.sendMessage({ action: "currentGroupChanged", currentGroupName });
  }
}
