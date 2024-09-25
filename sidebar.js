document.getElementById('addGroupButton').addEventListener('click', async function () {
    const groupName = prompt("Enter new group name:");
    if (groupName) {
      await browser.runtime.sendMessage({ action: "createGroup", groupName });
      addGroupElement(groupName);
    }
  });
  
  async function addGroupElement(groupName, isDefault = false) {
    const groupsDiv = document.getElementById('groups');
    const groupElement = document.createElement('div');
    groupElement.className = 'group';
    if (isDefault) {
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
    const groupName = groupElement.querySelector('.group-name').textContent;
    groupElement.addEventListener('click', async function () {
      await browser.runtime.sendMessage({ action: "switchGroup", groupName });
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
    const groupName = groupElement.querySelector('.group-name').textContent;
  
    renameOption.addEventListener('click', async function () {
      const newName = prompt('Enter new group name:', groupName);
      if (newName && newName !== groupName) {
        await browser.runtime.sendMessage({ action: "renameGroup", oldName: groupName, newName: newName });
        groupElement.querySelector('.group-name').textContent = newName;
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
      const isDefault = groupName === "Default Group";
      addGroupElement(groupName, isDefault);
    }
  }
  
  initializeGroups();
  