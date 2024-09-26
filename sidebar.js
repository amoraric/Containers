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
browser.runtime.onMessage.addListener((message) => {
    if (message.action === "currentGroupChanged") {
      console.log("Received currentGroupChanged message:", message);
      currentGroupName = message.currentGroupName;
      updateCurrentGroupHighlighting();
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
  groupElement.innerHTML = `
    <div class="group-content">
      <span class="group-name">${groupName}</span>
      <span class="settings-icon">&#9881;</span>
    </div>
  `;
  groupsDiv.appendChild(groupElement);

  attachSettingsListener(groupElement);
  attachGroupClickListener(groupElement);
}

function attachSettingsListener(groupElement) {
  const settingsIcon = groupElement.querySelector('.settings-icon');

  if (settingsIcon) {
    settingsIcon.addEventListener('click', function (event) {
      event.stopPropagation();
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

// Initialize the groups from storage
async function initializeGroups() {
  const response = await browser.runtime.sendMessage({ action: "getGroups" });
  if (response && response.success) {
    const tabGroups = response.groups;
    for (const groupName in tabGroups) {
      addGroupElement(groupName);
    }
    await updateCurrentGroupName();
  } else {
    console.error("Failed to get groups:", response.error);
  }
}

initializeGroups();