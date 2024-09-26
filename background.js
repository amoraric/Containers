let logMessages = [];
let tabCreatedListener = null;
let tabRemovedListener = null;
let tabUpdatedListener = null;

// Register tab event listeners
function registerTabListeners() {
    tabCreatedListener = async function(tab) {
      if (tab.pinned) return;
  
      const currentWindow = await browser.windows.getCurrent();
      if (tab.windowId !== currentWindow.id) return;
  
      log("Tab created: " + tab.url);
      await updateCurrentGroupTabs();
    };
  
    tabRemovedListener = async function(tabId, removeInfo) {
        const currentWindow = await browser.windows.getCurrent();
        if (removeInfo.windowId !== currentWindow.id) return;
      
        log("Tab removed: " + tabId);
      
        try {
          await updateCurrentGroupTabs();
        } catch (error) {
          log("Error updating current group tabs after tab removed: " + error);
        }
    };
  
    tabUpdatedListener = async function(tabId, changeInfo, tab) {
      if (tab.pinned) return;
  
      const currentWindow = await browser.windows.getCurrent();
      if (tab.windowId !== currentWindow.id) return;
  
      if (changeInfo.url) {
        log("Tab updated: " + tabId + ", new URL: " + changeInfo.url);
        await updateCurrentGroupTabs();
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
  
async function switchToGroup(groupName) {
    log("Switching to group: " + groupName);
    let { tabGroups, currentGroupName } = await browser.storage.local.get(["tabGroups", "currentGroupName"]);
  
    if (groupName === currentGroupName) {
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
    const currentWindowId = currentWindow.id;
  
    // **Disable tab event listeners to prevent interference**
    unregisterTabListeners();
  
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
  
      // Validate the URL
      try {
        new URL(tabUrl);
      } catch (e) {
        log("Invalid URL detected: " + tabUrl + ". Replacing with 'about:blank'.");
        tabUrl = "about:blank";
      }
  
      try {
        const newTab = await browser.tabs.create({ url: tabUrl, pinned: tabInfo.pinned, windowId: currentWindowId });
        log("Opened new tab: " + newTab.id + ", URL: " + tabUrl);
      } catch (error) {
        log("Error opening tab with URL " + tabUrl + ": " + error);
      }
    }
  
    // Remove the temporary tab
    try {
      await browser.tabs.remove(tempTab.id);
      log("Removed temporary tab: " + tempTab.id);
    } catch (error) {
      log("Error removing temporary tab: " + error);
    }
  
    // Update current group name
    await browser.storage.local.set({ currentGroupName: groupName });
    log("Updated current group to: " + groupName);
  
    // **Re-register tab event listeners**
    registerTabListeners();
  
    // Send a message to the sidebar to update the UI
    browser.runtime.sendMessage({ action: "currentGroupChanged", currentGroupName: groupName });
  }

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
  let { currentGroupName } = await browser.storage.local.get("currentGroupName");
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

// Update the current group's tabs in storage
async function updateCurrentGroupTabs() {
  const currentWindow = await browser.windows.getCurrent();
  const { currentGroupName, tabGroups } = await browser.storage.local.get(["currentGroupName", "tabGroups"]);

  const tabs = await browser.tabs.query({ windowId: currentWindow.id, pinned: false });
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

// Wrap getGroups in a function
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
    newTabGroups[groupName] = [{ url: "about:blank", pinned: false }];
    await browser.storage.local.set({ tabGroups: newTabGroups });
    log("Created new group: " + groupName);
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
  
    // No need to send a message if currentGroupName hasn't changed
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
  
    let updatedCurrentGroupName = currentGroupName;
    if (currentGroupName === oldName) {
      await browser.storage.local.set({ currentGroupName: newName });
      updatedCurrentGroupName = newName;
      log("Updated current group to: " + newName);
  
      // Send a message to update the sidebar
      browser.runtime.sendMessage({ action: "currentGroupChanged", currentGroupName: updatedCurrentGroupName });
    }
}