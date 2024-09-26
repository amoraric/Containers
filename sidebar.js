let currentGroupName = null;

// Update the current group highlighting in the UI
function updateCurrentGroupHighlighting() {
  // Remove 'active' class from all groups
  document.querySelectorAll('.group').forEach(group => {
    group.classList.remove('active');
  });

  // Add 'active' class to the current group
  const activeGroup = document.querySelector(`.group[data-name="${currentGroupName}"]`);
  if (activeGroup) {
    activeGroup.classList.add('active');
  } else {
    console.error("No group element found for currentGroupName:", currentGroupName);
  }
}

// Initialize current group name and sidebar
async function initialize() {
  let result = await browser.storage.local.get("currentGroupName");

  if (!result.currentGroupName) {
    // If no group is set, create and set a default group
    const defaultGroupName = 'Default Group';
    await browser.storage.local.set({ currentGroupName: defaultGroupName });
    currentGroupName = defaultGroupName;
  } else {
    currentGroupName = result.currentGroupName;
  }

  // Fetch and render groups
  const response = await browser.runtime.sendMessage({ action: "getGroups" });
  if (response && response.success) {
    const tabGroups = response.groups;
    for (const groupName in tabGroups) {
      addGroupElement(groupName);
    }
    updateCurrentGroupHighlighting();
  } else {
    console.error("Failed to get groups:", response.error);
  }
}

initialize();

// Listen for messages from the background script
browser.runtime.onMessage.addListener((message) => {
  if (message.action === "currentGroupChanged") {
    console.log("Received currentGroupChanged message:", message);
    currentGroupName = message.currentGroupName;
    updateCurrentGroupHighlighting();

    // Clear any open tabs lists to prevent displaying outdated tabs
    document.querySelectorAll('.tabs-list').forEach(tabsList => {
      tabsList.parentNode.removeChild(tabsList);
    });

    // Reset arrow icons to default state
    document.querySelectorAll('.arrow-icon').forEach(arrowIcon => {
      arrowIcon.textContent = '>';
    });
  }
});

async function switchToGroup(groupName) {
  const response = await browser.runtime.sendMessage({ action: "switchGroup", groupName });
  if (response && response.success) {
    // Update current group highlighting
    currentGroupName = groupName;
    updateCurrentGroupHighlighting();
  } else {
    console.error("Failed to switch group:", response.error);
  }
}

document.getElementById('addGroupButton').addEventListener('click', async function () {
  const groupName = prompt("Enter new group name:");
  if (groupName) {
    const response = await browser.runtime.sendMessage({ action: "createGroup", groupName });
    if (response && response.success) {
      addGroupElement(groupName);
      currentGroupName = groupName;
      updateCurrentGroupHighlighting();
    } else {
      console.error("Failed to create group:", response.error);
    }
  }
});

function addGroupElement(groupName) {
  const groupsDiv = document.getElementById('groups');

  // Check if the group element already exists to prevent duplicates
  if (document.querySelector(`.group[data-name="${groupName}"]`)) {
    return;
  }

  const groupElement = document.createElement('div');
  groupElement.className = 'group';
  groupElement.dataset.name = groupName;
  if (groupName === "Default Group") {
    groupElement.dataset.default = "true";
  }

  // Create the group content
  const groupContent = document.createElement('div');
  groupContent.className = 'group-content';

  // Group Name
  const groupNameSpan = document.createElement('span');
  groupNameSpan.className = 'group-name';
  groupNameSpan.textContent = groupName;

  // Icons Container
  const iconsContainer = document.createElement('div');
  iconsContainer.className = 'icons-container';

  // Arrow Button
  const arrowButton = document.createElement('span');
  arrowButton.className = 'arrow-icon';
  arrowButton.textContent = '>'; // Using '>' as the arrow symbol
  iconsContainer.appendChild(arrowButton);

  // Append elements
  groupContent.appendChild(groupNameSpan);
  groupContent.appendChild(iconsContainer);

  groupElement.appendChild(groupContent);
  groupsDiv.appendChild(groupElement);

  // Attach click listeners
  attachGroupClickListener(groupElement);
  attachArrowClickListener(groupElement);
}

function attachArrowClickListener(groupElement) {
  const arrowIcon = groupElement.querySelector('.arrow-icon');
  const groupName = groupElement.dataset.name;

  arrowIcon.addEventListener('click', async function (event) {
    event.stopPropagation(); // Prevent group click listener from firing

    // Check if the tabsList already exists
    let tabsList = groupElement.querySelector('.tabs-list');

    if (tabsList) {
      // Toggle visibility
      if (tabsList.style.display === 'block' || !tabsList.style.display) {
        tabsList.style.display = 'none'; // Hide the tabs
        arrowIcon.textContent = '>'; // Reset to collapsed icon
      } else {
        tabsList.style.display = 'block'; // Show the tabs
        arrowIcon.textContent = 'v'; // Set to expanded icon
      }
      return;
    }

    // Fetch tabs and display them if tabsList doesn't exist
    const tabs = await getTabsForGroup(groupName);
    if (tabs.length === 0) {
      // No tabs to display, reset the arrow
      arrowIcon.textContent = '>';
      return;
    }

    // Create a new tabsList element
    tabsList = document.createElement('div');
    tabsList.className = 'tabs-list';

    tabs.forEach(tabInfo => {
      const tabElement = document.createElement('div');
      tabElement.className = 'tab-item';

      tabElement.textContent = tabInfo.title || tabInfo.url;
      tabElement.dataset.tabId = tabInfo.id; // Store tab ID for later
      attachTabClickListener(tabElement, tabInfo); // Attach tab click listener
      tabsList.appendChild(tabElement);
    });

    // Append the new tabsList to the group element and set it to visible
    groupElement.appendChild(tabsList);
    tabsList.style.display = 'block';
    arrowIcon.textContent = 'v'; // Set to expanded icon
  });
}

browser.tabs.onCreated.addListener(async function (tab) {
  const groupName = currentGroupName; // Fetch the current group
  const tabsList = document.querySelector(`.group[data-name="${groupName}"] .tabs-list`);

  // Only update the tabs list if it is visible for the current group
  if (tabsList) {
    // Re-fetch the updated tabs for the group
    const tabs = await getTabsForGroup(groupName);

    // Clear the old list and render the updated list
    tabsList.innerHTML = ''; // Clear the old list
    tabs.forEach(tabInfo => {
      const tabElement = document.createElement('div');
      tabElement.className = 'tab-item';
      tabElement.textContent = tabInfo.title || tabInfo.url;
      tabElement.dataset.tabId = tabInfo.id;
      attachTabClickListener(tabElement, tabInfo); // Attach tab click listener
      tabsList.appendChild(tabElement);
    });
  }
});

function attachTabClickListener(tabElement, tabInfo) {
  tabElement.addEventListener('click', async function (event) {
    event.stopPropagation(); // Prevent group click listener
    try {
      // Send message to background script to focus on the tab
      const response = await browser.runtime.sendMessage({
        action: 'focusTab',
        tabId: tabInfo.id,
        windowId: tabInfo.windowId,
      });
      if (!response || !response.success) {
        console.error('Failed to focus on tab:', response ? response.error : 'Unknown error');
      }
    } catch (error) {
      console.error('Error focusing on tab:', error);
    }
  });
}

async function getTabsForGroup(groupName) {
  const response = await browser.runtime.sendMessage({ action: "getTabsForGroup", groupName });
  if (response && response.success) {
    return response.tabs;
  } else {
    console.error("Failed to get tabs for group:", response.error);
    return [];
  }
}

function attachGroupClickListener(groupElement) {
  const groupName = groupElement.dataset.name;
  groupElement.addEventListener('click', async function () {
    await switchToGroup(groupName);
  });
}
