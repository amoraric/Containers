// Utility to get all tabs in the current window
function getCurrentTabs() {
    return browser.tabs.query({ currentWindow: true });
}

// Utility to open tabs from a list of URLs
function openTabs(urls) {
    return Promise.all(urls.map(url => browser.tabs.create({ url })));
}

// Switches between tab groups and stores the current group
function switchContainer(newContainerIndex, currentContainerIndex) {
    browser.storage.local.get("tabGroups").then(data => {
        const groups = data.tabGroups || [];
        const newGroup = groups[newContainerIndex] || [];
        const currentGroup = groups[currentContainerIndex] || [];

        // Open the new group's tabs
        openTabs(newGroup.tabs || ['about:newtab']).then(() => {
            getCurrentTabs().then(tabs => {
                currentGroup.tabs = tabs.map(tab => tab.url);
                groups[currentContainerIndex] = currentGroup;
                browser.storage.local.set({ tabGroups: groups });
            });
        });
    });
}

// Initialize the default group with current tabs
function initDefaultGroup() {
    browser.storage.local.get("tabGroups").then(data => {
        const groups = data.tabGroups || [{ name: "Default", tabs: ['about:newtab'] }];
        browser.storage.local.set({ tabGroups: groups });
    });
}

// Toggle the sidebar when the toolbar button is clicked
browser.browserAction.onClicked.addListener(() => {
    browser.sidebarAction.toggle();
});

// Handle switching tab containers
browser.runtime.onMessage.addListener((message) => {
    if (message.action === "switchContainer") {
        switchContainer(message.newContainerIndex, message.currentContainerIndex);
        browser.storage.local.set({ activeGroupIndex: message.newContainerIndex });
    }
});

// Initialize on startup
initDefaultGroup();
