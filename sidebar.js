document.addEventListener("DOMContentLoaded", function () {
    const groupsList = document.getElementById("groupsList");
    const addGroupBtn = document.getElementById("addGroupBtn");

    // Keep track of the current active container index
    let currentContainerIndex = 0;

    // Initialize or load existing groups
    function initGroups() {
        browser.storage.local.get("tabGroups").then((data) => {
            let groups = data.tabGroups;
            if (!groups) {
                groups = [{ name: "Default", tabs: ['about:newtab'] }];
                browser.storage.local.set({ tabGroups: groups });
            }
            displayGroups(groups);
        });
    }

    // Add group event
    addGroupBtn.addEventListener("click", () => {
        const groupName = prompt("Enter a name for the new tab group:");
        if (groupName) {
            addNewContainer(groupName);
        }
    });

    // Add a new container
    function addNewContainer(name) {
        browser.storage.local.get("tabGroups").then((data) => {
            const groups = data.tabGroups || [];
            groups.push({ name: name, tabs: ['about:newtab'] });  // Add an empty tab by default
            browser.storage.local.set({ tabGroups: groups }).then(() => {
                displayGroups(groups); // Refresh the list of groups
            });
        });
    }

    // Display tab groups with hover actions
    function displayGroups(groups) {
        groupsList.innerHTML = '';
        groups.forEach((group, index) => {
            const li = document.createElement("li");
            li.textContent = group.name;

            // Settings button - simple text
            const settingsBtn = document.createElement("span");
            settingsBtn.textContent = "Settings";  // Simple text for settings
            settingsBtn.className = "container-settings";
            settingsBtn.addEventListener("click", (event) => {
                event.stopPropagation();  // Prevents the li click event
                openSettingsMenu(index);
            });

            // Tab list toggle button - simple text
            const toggleTabsBtn = document.createElement("span");
            toggleTabsBtn.textContent = "Show Tabs";  // Simple text to toggle tabs
            toggleTabsBtn.className = "toggle-tabs";
            toggleTabsBtn.addEventListener("click", (event) => {
                event.stopPropagation();  // Prevents the li click event
                toggleTabList(index, group); // Pass the group for the tabs to display
            });

            // Tab list (hidden by default)
            const tabList = document.createElement("ul");
            tabList.className = "tab-list";
            tabList.style.display = "none";  // Initially hidden
            group.tabs.forEach((tabUrl) => {
                const tabLi = document.createElement("li");
                tabLi.textContent = tabUrl;
                tabList.appendChild(tabLi);
            });

            li.appendChild(settingsBtn);
            li.appendChild(toggleTabsBtn);
            li.appendChild(tabList);

            li.addEventListener("click", () => {
                if (index !== currentContainerIndex) {
                    switchContainer(index);
                }
            });

            groupsList.appendChild(li);
        });
    }

    // Switch between tab groups
    function switchContainer(newContainerIndex) {
        // Check if the new container is the same as the current one
        if (currentContainerIndex !== newContainerIndex) {
            browser.runtime.sendMessage({
                action: "switchContainer",
                currentContainerIndex: currentContainerIndex,
                newContainerIndex: newContainerIndex
            });

            // Update the current container index
            currentContainerIndex = newContainerIndex;
        }
    }

    // Toggle the tab list visibility for each group
    function toggleTabList(index, group) {
        const groupItems = groupsList.getElementsByTagName('li')[index].getElementsByClassName('tab-list')[0];
        if (groupItems.style.display === "none") {
            groupItems.style.display = "block"; // Show the tab list
        } else {
            groupItems.style.display = "none"; // Hide the tab list
        }
    }

    initGroups();
});
