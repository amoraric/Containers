// sidebar.js

document.getElementById('addGroupButton').addEventListener('click', function() {
    const groupsDiv = document.getElementById('groups');
    const newGroup = document.createElement('div');
    newGroup.className = 'group';
    newGroup.innerHTML = `
      <span class="group-name">New Group</span>
      <span class="settings-icon">&#9881;</span>
    `;
    groupsDiv.appendChild(newGroup);
  
    // Attach event listeners to the new group's settings icon
    attachSettingsListener(newGroup);
  });
  
  function attachSettingsListener(groupElement) {
    const settingsIcon = groupElement.querySelector('.settings-icon');
  
    settingsIcon.addEventListener('click', function(event) {
      event.stopPropagation();
      showContextMenu(event, groupElement);
    });
  }
  
  function showContextMenu(event, groupElement) {
    const contextMenu = document.getElementById('context-menu');
  
    // Position the context menu near the settings icon
    contextMenu.style.top = event.pageY + 'px';
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.display = 'block';
  
    // Set current group
    contextMenu.currentGroup = groupElement;
  
    // Adjust "Delete" option availability
    const deleteOption = contextMenu.querySelector('.delete-option');
    if (groupElement.dataset.default === "true") {
      deleteOption.classList.add('disabled');
    } else {
      deleteOption.classList.remove('disabled');
    }
  }
  
  // Hide context menu when clicking outside
  document.addEventListener('click', function(event) {
    const contextMenu = document.getElementById('context-menu');
    if (!contextMenu.contains(event.target)) {
      contextMenu.style.display = 'none';
    }
  });
  
  // Context menu options
  const contextMenu = document.getElementById('context-menu');
  
  contextMenu.querySelector('.rename-option').addEventListener('click', function() {
    const groupElement = contextMenu.currentGroup;
    const groupNameElement = groupElement.querySelector('.group-name');
    const newName = prompt('Enter new group name:', groupNameElement.textContent);
    if (newName) {
      groupNameElement.textContent = newName;
    }
    contextMenu.style.display = 'none';
  });
  
  contextMenu.querySelector('.delete-option').addEventListener('click', function() {
    const groupElement = contextMenu.currentGroup;
    if (groupElement.dataset.default === "true") {
      // Do nothing if it's the default group
      return;
    }
    groupElement.parentNode.removeChild(groupElement);
    contextMenu.style.display = 'none';
  });
  
  // Attach event listeners to existing groups
  document.querySelectorAll('.group').forEach(function(groupElement) {
    attachSettingsListener(groupElement);
  });
  