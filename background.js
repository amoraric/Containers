let currentWindowId = null;

// Initialize the extension
async function initialize() {
  let { currentGroupName } = await browser.storage.local.get("currentGroupName");
  if (!currentGroupName) {
    currentGroupName = "Default Group";
    await browser.storage.local.set({ currentGroupName });
  }

  const currentWindow = await browser.windows.getCurrent();
  currentWindowId = currentWindow.id;

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
  }
}

// Register tab event listeners
function registerTabListeners() {
  // Tab created
  browser.tabs.onCreated.addListener(async (tab) => {
    if (tab.windowId !== currentWindowId || tab.pinned) return;

    // Update the current group's tabs
    await updateCurrentGroupTabs();
  });

  // Tab removed
  browser.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    if (removeInfo.windowId !== currentWindowId) return;

    // Update the current group's tabs
    await updateCurrentGroupTabs();
  });

  // Tab updated (e.g., URL change)
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (tab.windowId !== currentWindowId || tab.pinned) return;

    if (changeInfo.url) {
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
  }
});

async function createNewGroup(groupName) {
  const { tabGroups } = await browser.storage.local.get("tabGroups");
  if (tabGroups && tabGroups[groupName]) {
    console.error("Group already exists");
    return;
  }
  const newTabGroups = tabGroups || {};
  newTabGroups[groupName] = [{ url: "about:newtab", pinned: false }];
  await browser.storage.local.set({ tabGroups: newTabGroups });
}

async function switchToGroup(groupName) {
  let { tabGroups, currentGroupName } = await browser.storage.local.get(["tabGroups", "currentGroupName"]);

  if (groupName === currentGroupName) {
    // Already in this group, do nothing
    console.log("Already in group", groupName);
    return;
  }

  if (!tabGroups || !tabGroups[groupName]) {
    console.error("Group does not exist");
    return;
  }

  // No need to save current tabs here; tab event listeners handle it

  const currentWindow = await browser.windows.getCurrent();
  currentWindowId = currentWindow.id;

  // Open a temporary tab to prevent window from closing
  const tempTab = await browser.tabs.create({ url: "about:blank", windowId: currentWindowId });

  // Close all current tabs except pinned tabs and the temporary tab
  const currentTabs = await browser.tabs.query({ windowId: currentWindowId, pinned: false });
  const tabIdsToClose = currentTabs.map(tab => tab.id);
  if (tabIdsToClose.length > 0) {
    await browser.tabs.remove(tabIdsToClose);
  }

  // Open tabs from the new group
  const newGroupTabs = tabGroups[groupName];
  for (const tabInfo of newGroupTabs) {
    await browser.tabs.create({ url: tabInfo.url, pinned: tabInfo.pinned, windowId: currentWindowId });
  }

  // Remove the temporary tab
  await browser.tabs.remove(tempTab.id);

  // Update current group name
  await browser.storage.local.set({ currentGroupName: groupName });
}

async function deleteGroup(groupName) {
  const { tabGroups, currentGroupName } = await browser.storage.local.get(["tabGroups", "currentGroupName"]);
  if (groupName === currentGroupName) {
    console.error("Cannot delete the currently active group");
    return;
  }
  if (!tabGroups || !tabGroups[groupName]) {
    console.error("Group does not exist");
    return;
  }
  delete tabGroups[groupName];
  await browser.storage.local.set({ tabGroups });
}

async function renameGroup(oldName, newName) {
  const { tabGroups, currentGroupName } = await browser.storage.local.get(["tabGroups", "currentGroupName"]);
  if (!tabGroups || !tabGroups[oldName]) {
    console.error("Group does not exist");
    return;
  }
  if (tabGroups[newName]) {
    console.error("A group with the new name already exists");
    return;
  }
  tabGroups[newName] = tabGroups[oldName];
  delete tabGroups[oldName];
  await browser.storage.local.set({ tabGroups });

  if (currentGroupName === oldName) {
    await browser.storage.local.set({ currentGroupName: newName });
  }
}