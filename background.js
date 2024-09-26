let logMessages = [];
let tabCreatedListener = null;
let tabRemovedListener = null;
let tabUpdatedListener = null;
let currentGroupName = null;
let isSwitchingGroups = false;
const DEFAULT_TAB_URL = 'about:blank';

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

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  // Wrap updateCurrentGroupTabs with debounce
  const debouncedUpdateCurrentGroupTabs = debounce(updateCurrentGroupTabs, 500);  

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
        await debouncedUpdateCurrentGroupTabs();
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
        id: tab.id,
        windowId: tab.windowId,
        index: tab.index, // Include index
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
  
    // Get current tabs
    const currentTabs = await browser.tabs.query({ windowId: currentWindowId, pinned: false });
    const currentTabIds = currentTabs.map(tab => tab.id);
  
    // Open tabs from the new group
    const newGroupTabs = tabGroups[groupName];
    let newTabs = [];
  
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
        const newTab = await browser.tabs.create({
            url: tabUrl,
            pinned: tabInfo.pinned,
            windowId: currentWindowId,
            active: false,
            index: tabInfo.index, // Use the saved index
        });
        log(`Opened new tab: ${newTab.id}, URL: ${tabUrl}`);
        newTabs.push(newTab);
      } catch (error) {
        log(`Error opening tab with URL ${tabUrl}: ${error}`);
      }
    }
  
    // If no tabs were opened, open a default tab
    if (newTabs.length === 0) {
      try {
        const newTab = await browser.tabs.create({ url: 'about:blank', windowId: currentWindowId });
        log(`Opened default tab: ${newTab.id}`);
        newTabs.push(newTab);
      } catch (error) {
        log(`Error opening default tab: ${error}`);
      }
    }
  
    // Activate the first new tab
    try {
      await browser.tabs.update(newTabs[0].id, { active: true });
      log(`Activated tab: ${newTabs[0].id}`);
    } catch (error) {
      log(`Error activating tab ${newTabs[0].id}: ${error}`);
    }
  
    // Close the old tabs
    if (currentTabIds.length > 0) {
      try {
        await browser.tabs.remove(currentTabIds);
        log("Closed old tabs: " + currentTabIds.join(', '));
      } catch (error) {
        log("Error removing tabs: " + error);
      }
    }
  
    // Re-register tab event listeners
    registerTabListeners();
    isSwitchingGroups = false;
  
    // Send a message to the sidebar to update the UI
    browser.runtime.sendMessage({ action: "currentGroupChanged", currentGroupName });
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
  } else if (message.action === "focusTab") {
    focusTab(message.tabId, message.windowId).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('Error focusing on tab:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (message.action === "getTabsForGroup") {
    getTabsForGroup(message.groupName).then((tabs) => {
      sendResponse({ success: true, tabs });
    }).catch((error) => {
      console.error('Error getting tabs for group:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Indicate asynchronous response
  }
});

// Add the getTabsForGroup function
async function getTabsForGroup(groupName) {
    const { tabGroups } = await browser.storage.local.get("tabGroups");
    if (tabGroups && tabGroups[groupName]) {
      return tabGroups[groupName];
    } else {
      return [];
    }
  }

async function findTabByIdOrUrl(tabId) {
    // Retrieve the stored tabs for the current group
    const { tabGroups } = await browser.storage.local.get("tabGroups");
    const groupTabs = tabGroups[currentGroupName] || [];
    const targetTabInfo = groupTabs.find(tab => tab.id === tabId);
    if (targetTabInfo) {
      // Find an open tab with the same URL
      const tabs = await browser.tabs.query({ url: targetTabInfo.url });
      return tabs.length > 0 ? tabs[0] : null;
    }
    return null;
  }

  async function focusTab(tabId, windowId) {
    try {
      // Try to update the tab by ID
      await browser.tabs.update(tabId, { active: true });
      // Focus the window
      await browser.windows.update(windowId, { focused: true });
    } catch (error) {
      // If tab doesn't exist, search for a tab with the same URL
      const tabInfo = await findTabByIdOrUrl(tabId);
      if (tabInfo) {
        // Activate the found tab
        await browser.tabs.update(tabInfo.id, { active: true });
        await browser.windows.update(tabInfo.windowId, { focused: true });
      } else {
        // Open the tab if it doesn't exist
        await browser.tabs.create({ url: tabInfo.url });
      }
    }
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

  // Initialize with an empty array of tabs
  newTabGroups[groupName] = []; // Empty array means no tabs

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
