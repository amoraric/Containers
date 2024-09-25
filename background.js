let currentGroupName = "Default Group";

async function initializeDefaultGroup() {
  const groups = await browser.storage.local.get("tabGroups");
  if (!groups.tabGroups) {
    // No groups exist yet, create default group
    const tabs = await browser.tabs.query({ currentWindow: true });
    const tabData = tabs.map(tab => ({ url: tab.url, pinned: tab.pinned }));
    const tabGroups = {
      [currentGroupName]: tabData
    };
    await browser.storage.local.set({ tabGroups });
  }
}

browser.runtime.onInstalled.addListener(() => {
  initializeDefaultGroup();
});

browser.runtime.onStartup.addListener(() => {
  initializeDefaultGroup();
});

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
  const tabGroups = (await browser.storage.local.get("tabGroups")).tabGroups || {};
  if (tabGroups[groupName]) {
    console.error("Group already exists");
    return;
  }
  tabGroups[groupName] = [{ url: "about:newtab", pinned: false }];
  await browser.storage.local.set({ tabGroups });
}

async function switchToGroup(groupName) {
  const tabGroups = (await browser.storage.local.get("tabGroups")).tabGroups;
  if (!tabGroups || !tabGroups[groupName]) {
    console.error("Group does not exist");
    return;
  }

  // Save current tabs to current group
  const currentTabs = await browser.tabs.query({ currentWindow: true });
  const currentTabData = currentTabs.map(tab => ({ url: tab.url, pinned: tab.pinned }));
  tabGroups[currentGroupName] = currentTabData;

  // Update storage
  await browser.storage.local.set({ tabGroups });

  // Close all current tabs
  const tabIds = currentTabs.map(tab => tab.id);
  await browser.tabs.remove(tabIds);

  // Open tabs from the new group
  const newGroupTabs = tabGroups[groupName];
  for (const tabInfo of newGroupTabs) {
    await browser.tabs.create({ url: tabInfo.url, pinned: tabInfo.pinned });
  }

  currentGroupName = groupName;
}

async function deleteGroup(groupName) {
  const tabGroups = (await browser.storage.local.get("tabGroups")).tabGroups;
  if (!tabGroups || !tabGroups[groupName]) {
    console.error("Group does not exist");
    return;
  }
  delete tabGroups[groupName];
  await browser.storage.local.set({ tabGroups });
}

async function renameGroup(oldName, newName) {
  const tabGroups = (await browser.storage.local.get("tabGroups")).tabGroups;
  if (!tabGroups || !tabGroups[oldName]) {
    console.error("Group does not exist");
    return;
  }
  tabGroups[newName] = tabGroups[oldName];
  delete tabGroups[oldName];
  await browser.storage.local.set({ tabGroups });

  if (currentGroupName === oldName) {
    currentGroupName = newName;
  }
}
