// Utility to get all tabs in the current window
function getCurrentTabs() {
    return browser.tabs.query({ currentWindow: true });
}

// Utility to close tabs, but keep at least one tab open
function closeTabs(tabs, newGroupTabs) {
    const tabIds = tabs.map(tab => tab.id);
    // Filter out tabs that are part of the new group, so they don't get closed
    const tabIdsToClose = tabIds.filter((tabId, index) => !newGroupTabs.includes(tabs[index].url));

    if (tabIdsToClose.length > 0) {
        return browser.tabs.remove(tabIdsToClose);
    }
    return Promise.resolve(); // No tabs to close
}

// Utility to open tabs from a list of URLs
function openTabs(urls) {
    const promises = urls.map((url) => browser.tabs.create({ url }));
    return Promise.all(promises); // Returns an array of tab objects
}

// Function to switch container (group)
function switchContainer(newContainerIndex, currentContainerIndex) {
    // Get all current containers from storage
    browser.storage.local.get("tabGroups").then((data) => {
        const groups = data.tabGroups || [];
        const newGroup = groups[newContainerIndex];
        const currentGroup = groups[currentContainerIndex];

        // Open the new group's tabs first
        const newGroupTabs = newGroup.tabs.length > 0 ? newGroup.tabs : ['about:newtab'];
        
        // Open the new group's tabs and ensure they are fully opened before closing the old ones
        openTabs(newGroupTabs).then((newlyOpenedTabs) => {
            // Once the new group's tabs are opened, store and close the current group's tabs
            getCurrentTabs().then((tabs) => {
                const currentTabUrls = tabs.map(tab => tab.url);

                // Store current group's tabs
                currentGroup.tabs = currentTabUrls;
                browser.storage.local.set({ tabGroups: groups }).then(() => {
                    // After storing, close the current group's tabs (except new group tabs)
                    closeTabs(tabs, newGroupTabs);
                });
            });
        });
    });
}


// Function to store the current tabs in the active container
function storeTabsInContainer(containerIndex) {
    getCurrentTabs().then((tabs) => {
        const tabUrls = tabs.map(tab => tab.url);

        browser.storage.local.get("tabGroups").then((data) => {
            const groups = data.tabGroups || [];
            groups[containerIndex].tabs = tabUrls;  // Store current tab URLs in the active group
            browser.storage.local.set({ tabGroups: groups });
        });
    });
}

// Initialize default group with a new tab if empty
function initDefaultGroup() {
    browser.storage.local.get("tabGroups").then((data) => {
        const groups = data.tabGroups || [{ name: "Default", tabs: ['about:newtab'] }];

        // Check if the default group is empty and add a new tab if it is
        if (!groups[0].tabs.length) {
            getCurrentTabs().then((tabs) => {
                const tabUrls = tabs.map(tab => tab.url);
                groups[0].tabs = tabUrls.length ? tabUrls : ['about:newtab'];
                browser.storage.local.set({ tabGroups: groups });
            });
        } else {
            browser.storage.local.set({ tabGroups: groups });
        }
    });
}

// Add new tabs to the active group as they are opened
browser.tabs.onCreated.addListener((tab) => {
    browser.storage.local.get("activeGroupIndex").then((data) => {
        const activeGroupIndex = data.activeGroupIndex || 0; // Default to the first group if not set

        browser.storage.local.get("tabGroups").then((groupData) => {
            const groups = groupData.tabGroups || [];
            groups[activeGroupIndex].tabs.push(tab.url);  // Add the new tab URL to the active group
            browser.storage.local.set({ tabGroups: groups });
        });
    });
});

// Event: Listen for switching containers
browser.runtime.onMessage.addListener((message) => {
    if (message.action === "switchContainer") {
        // Switch to the new container after storing the current container's tabs
        switchContainer(message.newContainerIndex, message.currentContainerIndex);

        // Update the active group index
        browser.storage.local.set({ activeGroupIndex: message.newContainerIndex });
    }
});

// Initialize the default group with current tabs when the add-on loads
initDefaultGroup();
