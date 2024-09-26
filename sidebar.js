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

// Initialize current group name
async function initializeCurrentGroupName() {
    const result = await browser.storage.local.get("currentGroupName");
    currentGroupName = result.currentGroupName;
    updateCurrentGroupHighlighting();
}

initializeCurrentGroupName();

// Listen for messages from the background script
// Listen for messages from the background script
browser.runtime.onMessage.addListener((message) => {
    if (message.action === "currentGroupChanged") {
      console.log("Received currentGroupChanged message:", message);
      currentGroupName = message.currentGroupName;
      updateCurrentGroupHighlighting();
  
      // **Clear any open tabs lists to prevent displaying outdated tabs**
      document.querySelectorAll('.tabs-list').forEach(tabsList => {
        tabsList.parentNode.removeChild(tabsList);
      });
  
      // **Optionally, update the arrow icons to default state**
      document.querySelectorAll('.arrow-icon').forEach(arrowIcon => {
        arrowIcon.textContent = '>';
      });
    }
  });  

// Update the current group name and highlight it
async function updateCurrentGroupName() {
  const result = await browser.storage.local.get("currentGroupName");
  currentGroupName = result.currentGroupName;

  // Remove 'active' class from all groups
  document.querySelectorAll('.group').forEach(group => {
    group.classList.remove('active');
  });

  // Add 'active' class to the current group
  const activeGroup = document.querySelector(`.group[data-name="${currentGroupName}"]`);
  if (activeGroup) {
    activeGroup.classList.add('active');
  }
}

async function switchToGroup(groupName) {
    const response = await browser.runtime.sendMessage({ action: "switchGroup", groupName });
    if (response && response.success) {
      // No need to call updateCurrentGroupName here
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
      await updateCurrentGroupName();
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
  
      // **Always remove existing tabsList to prevent stale data**
      let tabsList = groupElement.querySelector('.tabs-list');
      if (tabsList) {
        groupElement.removeChild(tabsList);
      }
  
      // Fetch tabs and display them
      const tabs = await getTabsForGroup(groupName);
      if (tabs.length === 0) {
        // No tabs to display
        // Update arrow icon
        arrowIcon.textContent = '>';
        return;
      }
      tabsList = document.createElement('div');
      tabsList.className = 'tabs-list';
      tabs.forEach(tabInfo => {
        const tabElement = document.createElement('div');
        tabElement.className = 'tab-item';
        tabElement.textContent = tabInfo.title || tabInfo.url;
        tabElement.dataset.tabId = tabInfo.id; // Store tab ID for later
        attachTabClickListener(tabElement, tabInfo);
        tabsList.appendChild(tabElement);
      });
      groupElement.appendChild(tabsList);
      // Update arrow icon
      arrowIcon.textContent = 'v';
    });
  }
  
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

  function attachSettingsListener(groupElement) {
    const settingsIcon = groupElement.querySelector('.settings-icon');
  
    if (settingsIcon) {
      settingsIcon.addEventListener('click', function (event) {
        event.stopPropagation(); // Prevent group click listener from firing
        toggleContextMenu(groupElement);
      });
    } else {
      console.error('Settings icon not found in group element:', groupElement);
    }
  }  

function attachGroupClickListener(groupElement) {
    const groupName = groupElement.dataset.name;
    groupElement.addEventListener('click', async function () {
      await switchToGroup(groupName);
      // Update current group highlighting
      currentGroupName = groupName;
      updateCurrentGroupHighlighting();
    });
}

function toggleContextMenu(groupElement) {
  const existingMenu = groupElement.querySelector('.context-menu');

  if (existingMenu) {
    existingMenu.parentNode.removeChild(existingMenu);
  } else {
    closeContextMenu();

    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.innerHTML = `
      <ul>
        <li class="rename-option">Rename</li>
        <li class="delete-option">Delete</li>
      </ul>
    `;

    attachContextMenuListeners(contextMenu, groupElement);

    if (groupElement.dataset.default === "true") {
      contextMenu.querySelector('.delete-option').classList.add('disabled');
    }

    groupElement.appendChild(contextMenu);
  }
}

function attachContextMenuListeners(contextMenu, groupElement) {
  const renameOption = contextMenu.querySelector('.rename-option');
  const deleteOption = contextMenu.querySelector('.delete-option');
  const groupName = groupElement.dataset.name;

  renameOption.addEventListener('click', async function () {
    const newName = prompt('Enter new group name:', groupName);
    if (newName && newName !== groupName) {
      const response = await browser.runtime.sendMessage({ action: "renameGroup", oldName: groupName, newName: newName });
      if (response && response.success) {
        groupElement.querySelector('.group-name').textContent = newName;
        groupElement.dataset.name = newName;
        await updateCurrentGroupName();
      } else {
        console.error("Failed to rename group:", response.error);
      }
    }
    closeContextMenu();
  });

  deleteOption.addEventListener('click', async function () {
    if (groupElement.dataset.default === "true") {
      return;
    }
    const response = await browser.runtime.sendMessage({ action: "deleteGroup", groupName });
    if (response && response.success) {
      groupElement.parentNode.removeChild(groupElement);
      await updateCurrentGroupName();
    } else {
      console.error("Failed to delete group:", response.error);
    }
    closeContextMenu();
  });
}

function closeContextMenu() {
  document.querySelectorAll('.context-menu').forEach((menu) => {
    if (menu.parentNode) {
      menu.parentNode.removeChild(menu);
    }
  });
}

document.addEventListener('click', function (event) {
  if (!event.target.closest('.context-menu') && !event.target.closest('.settings-icon')) {
    closeContextMenu();
  }
});

async function getTabsForGroup(groupName) {
    const response = await browser.runtime.sendMessage({ action: "getTabsForGroup", groupName });
    if (response && response.success) {
      return response.tabs;
    } else {
      console.error("Failed to get tabs for group:", response.error);
      return [];
    }
  }  
  

  async function initializeGroups() {
    const response = await browser.runtime.sendMessage({ action: "getGroups" });
    if (response && response.success) {
      const tabGroups = response.groups;
      for (const groupName in tabGroups) {
        addGroupElement(groupName);
      }
      // Move the initialization of currentGroupName after groups are added
      await initializeCurrentGroupName();
    } else {
      console.error("Failed to get groups:", response.error);
    }
  }
  
  initializeGroups();  