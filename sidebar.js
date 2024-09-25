let currentGroupName = null;

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

document.getElementById('addGroupButton').addEventListener('click', async function () {
  const groupName = prompt("Enter new group name:");
  if (groupName) {
    await browser.runtime.sendMessage({ action: "createGroup", groupName });
    addGroupElement(groupName);
    await updateCurrentGroupName();
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
    if (groupName === currentGroupName) {
      // Already in this group, do nothing
      console.log("Already in group", groupName);
      return;
    }
    await browser.runtime.sendMessage({ action: "switchGroup", groupName });
    await updateCurrentGroupName();
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
      await browser.runtime.sendMessage({ action: "renameGroup", oldName: groupName, newName: newName });
      groupElement.querySelector('.group-name').textContent = newName;
      groupElement.dataset.name = newName;
      await updateCurrentGroupName();
    }
    closeContextMenu();
  });

  deleteOption.addEventListener('click', async function () {
    if (groupElement.dataset.default === "true") {
      return;
    }
    await browser.runtime.sendMessage({ action: "deleteGroup", groupName });
    groupElement.parentNode.removeChild(groupElement);
    closeContextMenu();
    await updateCurrentGroupName();
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
  const tabGroups = await browser.runtime.sendMessage({ action: "getGroups" });
  for (const groupName in tabGroups) {
    addGroupElement(groupName);
  }
  await updateCurrentGroupName();
}

document.getElementById('saveLogsButton').addEventListener('click', async function () {
    await browser.runtime.sendMessage({ action: "saveLogs" });
  });  

initializeGroups();