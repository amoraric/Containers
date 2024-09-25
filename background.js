let logMessages = [];

// Custom log function
function log(message) {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] ${message}`;
  console.log(formattedMessage);
  logMessages.push(formattedMessage);
}

// Store the current window ID for tab event handling
let currentWindowId = null;

// Initialize the extension
async function initialize() {
  log("Initializing extension...");
  let { currentGroupName } = await browser.storage.local.get("currentGroupName");
  if (!currentGroupName) {
    currentGroupName = "Default Group";
    await browser.storage.local.set({ currentGroupName });
    log("Set currentGroupName to Default Group");
  }

  const currentWindow = await browser.windows.getCurrent();
  currentWindowId = currentWindow.id;
  log("Current window ID: " + currentWindowId);

  await initializeDefaultGroup();
  registerTabListeners();
}

initialize();

// Initialize the default group
async function initializeDefaultGroup() {
  const { tabGroups } = await browser.storage.local.get("tabGroups");
  if (!tabGroups || !tabGroups["Default Group"]) {
    // No default group exists yet, create it
    const tabs = await browser.tabs.query({ windowId: currentWindowId, pinned: false });
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
  browser.tabs.onCreated.addListener(async (tab) => {
    if (tab.windowId !== currentWindowId || tab.pinned) return;
    log("Tab created: " + tab.url);

    // Update the current group's tabs
    await updateCurrentGroupTabs();
  });

  // Tab removed
  browser.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    if (removeInfo.windowId !== currentWindowId) return;
    log("Tab removed: " + tabId);

    // Update the current group's tabs
    await updateCurrentGroupTabs();
  });

  // Tab updated (e.g., URL change)
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (tab.windowId !== currentWindowId || tab.pinned) return;

    if (changeInfo.url) {
      log("Tab updated: " + tabId + ", new URL: " + changeInfo.url);
      // Update the current group's tabs
      await updateCurrentGroupTabs();
    }
  });
}

// Update the current group's tabs in storage
async function updateCurrentGroupTabs() {
  const { currentGroupName, tabGroups } = await browser.storage.local.get(["currentGroupName", "tabGroups"]);

  const tabs = await browser.tabs.query({ windowId: currentWindowId, pinned: false });
  const tabData = tabs.map(tab => ({ url: tab.url, pinned: tab.pinned }));

  const newTabGroups = tabGroups || {};
  newTabGroups[currentGroupName] = tabData;

  await browser.storage.local.set({ tabGroups: newTabGroups });
  log("Updated tabs for group: " + currentGroupName);
}

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

// Listen for messages from the sidebar
browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.action === "createGroup") {
    await createNewGroup(message.groupName);
  } else if (message.action === "switchGroup") {
    await switchToGroup(message.groupName);
  } else if (message.action === "deleteGroup") {
    await deleteGroup(message.groupName);
  } else if (message.action === "renameGroup") {
    await renameGroup(message.oldName, message.newName);
  } else if (message.action === "getGroups") {
    const groups = await browser.storage.local.get("tabGroups");
    return groups.tabGroups || {};
  } else if (message.action === "saveLogs") {
    await saveLogsToFile();
  }
});

async function createNewGroup(groupName) {
  const { tabGroups } = await browser.storage.local.get("tabGroups");
  if (tabGroups && tabGroups[groupName]) {
    log("Group already exists: " + groupName);
    console.error("Group already exists");
    return;
  }
  const newTabGroups = tabGroups || {};
  newTabGroups[groupName] = [{ url: "about:newtab", pinned: false }];
  await browser.storage.local.set({ tabGroups: newTabGroups });
  log("Created new group: " + groupName);
}

async function switchToGroup(groupName) {
  log("Switching to group: " + groupName);
  let { tabGroups, currentGroupName } = await browser.storage.local.get(["tabGroups", "currentGroupName"]);

  if (groupName === currentGroupName) {
    // Already in this group, do nothing
    log("Already in group: " + groupName);
    return;
  }

  if (!tabGroups || !tabGroups[groupName]) {
    log("Group does not exist: " + groupName);
    console.error("Group does not exist");
    return;
  }

  // No need to save current tabs here; tab event listeners handle it

  const currentWindow = await browser.windows.getCurrent();
  currentWindowId = currentWindow.id;

  // Open a temporary tab to prevent window from closing
  const tempTab = await browser.tabs.create({ url: "about:blank", windowId: currentWindowId });
  log("Opened temporary tab with ID: " + tempTab.id);

  // Close all current tabs except pinned tabs and the temporary tab
  const currentTabs = await browser.tabs.query({ windowId: currentWindowId, pinned: false });
  const tabIdsToClose = currentTabs
    .filter(tab => tab.id !== tempTab.id) // Exclude the temporary tab from being closed
    .map(tab => tab.id);

  log("Closing tabs: " + tabIdsToClose.join(', '));

  if (tabIdsToClose.length > 0) {
    await browser.tabs.remove(tabIdsToClose);
  }

  // Open tabs from the new group
  const newGroupTabs = tabGroups[groupName];
  for (const tabInfo of newGroupTabs) {
    const newTab = await browser.tabs.create({ url: tabInfo.url, pinned: tabInfo.pinned, windowId: currentWindowId });
    log("Opened new tab: " + newTab.id + ", URL: " + tabInfo.url);
  }

  // Remove the temporary tab
  await browser.tabs.remove(tempTab.id);
  log("Removed temporary tab: " + tempTab.id);

  // Update current group name
  await browser.storage.local.set({ currentGroupName: groupName });
  log("Updated current group to: " + groupName);
}

async function deleteGroup(groupName) {
  const { tabGroups, currentGroupName } = await browser.storage.local.get(["tabGroups", "currentGroupName"]);
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
  const { tabGroups, currentGroupName } = await browser.storage.local.get(["tabGroups", "currentGroupName"]);
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
    await browser.storage.local.set({ currentGroupName: newName });
    log("Updated current group to: " + newName);
  }
}