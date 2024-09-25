async function initialize() {
const { currentGroupName } = await browser.storage.local.get("currentGroupName");
if (!currentGroupName) {
    await browser.storage.local.set({ currentGroupName: "Default Group" });
}

await initializeDefaultGroup();
}

async function initializeDefaultGroup() {
const groups = await browser.storage.local.get("tabGroups");
if (!groups.tabGroups || !groups.tabGroups["Default Group"]) {
    // No default group exists yet, create it
    const tabs = await browser.tabs.query({ currentWindow: true });
    const tabData = tabs.map(tab => ({ url: tab.url, pinned: tab.pinned }));
    const tabGroups = {
    "Default Group": tabData
    };
    await browser.storage.local.set({ tabGroups });
}
}

initialize();

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
const { tabGroups, currentGroupName } = await browser.storage.local.get(["tabGroups", "currentGroupName"]);
if (!tabGroups || !tabGroups[groupName]) {
    console.error("Group does not exist");
    return;
}

const currentWindow = await browser.windows.getCurrent();

// Save current tabs to current group
const currentTabs = await browser.tabs.query({ windowId: currentWindow.id, pinned: false });
const currentTabData = currentTabs.map(tab => ({ url: tab.url, pinned: tab.pinned }));
tabGroups[currentGroupName] = currentTabData;

// Update storage
await browser.storage.local.set({ tabGroups });

// Open a temporary tab to prevent window from closing
const tempTab = await browser.tabs.create({ url: "about:blank", windowId: currentWindow.id });

// Close all current tabs except the temporary one and pinned tabs
const tabIdsToClose = currentTabs.map(tab => tab.id);
await browser.tabs.remove(tabIdsToClose);

// Open tabs from the new group
const newGroupTabs = tabGroups[groupName];
for (const tabInfo of newGroupTabs) {
    await browser.tabs.create({ url: tabInfo.url, pinned: tabInfo.pinned, windowId: currentWindow.id });
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