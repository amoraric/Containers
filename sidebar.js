document.getElementById('addGroupButton').addEventListener('click', function () {
    const groupsDiv = document.getElementById('groups');
    const newGroup = document.createElement('div');
    newGroup.className = 'group';
    newGroup.innerHTML = `
      <div class="group-content">
        <span class="group-name">New Group</span>
        <span class="settings-icon">&#9881;</span>
      </div>
    `;
    groupsDiv.appendChild(newGroup);
  
    // Attach event listeners to the new group's settings icon
    attachSettingsListener(newGroup);
  });
  
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
  
    renameOption.addEventListener('click', function () {
      const groupNameElement = groupElement.querySelector('.group-name');
      const newName = prompt('Enter new group name:', groupNameElement.textContent);
      if (newName) {
        groupNameElement.textContent = newName;
      }
      closeContextMenu();
    });
  
    deleteOption.addEventListener('click', function () {
      if (groupElement.dataset.default === "true") {
        return;
      }
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
  
  document.querySelectorAll('.group').forEach(function (groupElement) {
    attachSettingsListener(groupElement);
  });
  