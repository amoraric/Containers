let currentGroupName = null;

// Update the current group highlighting in the UI
function updateCurrentGroupHighlighting() {
  document.querySelectorAll('.group').forEach(group => group.classList.remove('active'));
  const activeGroup = document.querySelector(`.group[data-name="${currentGroupName}"]`);
  if (activeGroup) {
    activeGroup.classList.add('active');
  }
}

// Initialize current group name and sidebar
async function initialize() {
  const result = await browser.storage.local.get("currentGroupName");
  currentGroupName = result.currentGroupName || 'Default Group';
  await browser.storage.local.set({ currentGroupName });

  // Fetch and render groups
  const response = await browser.runtime.sendMessage({ action: "getGroups" });
  if (response && response.success) {
    const tabGroups = response.groups;
    for (const groupName in tabGroups) {
      addGroupElement(groupName);
    }
    updateCurrentGroupHighlighting();
  }
}

initialize();

// Listen for messages from the background script
browser.runtime.onMessage.addListener((message) => {
  if (message.action === "currentGroupChanged") {
    currentGroupName = message.currentGroupName;
    updateCurrentGroupHighlighting();
    document.querySelectorAll('.tabs-list').forEach(tabsList => tabsList.remove());
    document.querySelectorAll('.arrow-icon').forEach(arrowIcon => {
      arrowIcon.textContent = '>';
    });
  }
});

async function switchToGroup(groupName) {
  const response = await browser.runtime.sendMessage({ action: "switchGroup", groupName });
  if (response && response.success) {
    currentGroupName = groupName;
    updateCurrentGroupHighlighting();
  }
}

document.getElementById('addGroupButton').addEventListener('click', async () => {
  const groupName = prompt("Enter new group name:");
  if (groupName) {
    const response = await browser.runtime.sendMessage({ action: "createGroup", groupName });
    if (response && response.success) {
      addGroupElement(groupName);
      currentGroupName = groupName;
      updateCurrentGroupHighlighting();
    }
  }
});

function addGroupElement(groupName) {
  const groupsDiv = document.getElementById('groups');

  if (document.querySelector(`.group[data-name="${groupName}"]`)) return;

  const groupElement = document.createElement('div');
  groupElement.className = 'group';
  groupElement.dataset.name = groupName;

  const groupContent = document.createElement('div');
  groupContent.className = 'group-content';

  const groupNameSpan = document.createElement('span');
  groupNameSpan.className = 'group-name';
  groupNameSpan.textContent = groupName;

  const iconsContainer = document.createElement('div');
  iconsContainer.className = 'icons-container';

  const arrowButton = document.createElement('span');
  arrowButton.className = 'arrow-icon';
  arrowButton.textContent = '>';
  iconsContainer.appendChild(arrowButton);

  groupContent.appendChild(groupNameSpan);
  groupContent.appendChild(iconsContainer);
  groupElement.appendChild(groupContent);
  groupsDiv.appendChild(groupElement);

  attachGroupClickListener(groupElement);
  attachArrowClickListener(groupElement);
}

function attachArrowClickListener(groupElement) {
  const arrowIcon = groupElement.querySelector('.arrow-icon');
  const groupName = groupElement.dataset.name;

  arrowIcon.addEventListener('click', async (event) => {
    event.stopPropagation();
    let tabsList = groupElement.querySelector('.tabs-list');

    if (tabsList) {
      const isVisible = tabsList.style.display !== 'none';
      tabsList.style.display = isVisible ? 'none' : 'block';
      arrowIcon.textContent = isVisible ? '>' : 'v';
      return;
    }

    const tabs = await getTabsForGroup(groupName);
    if (tabs.length === 0) return;

    tabsList = document.createElement('div');
    tabsList.className = 'tabs-list';

    tabs.forEach(tabInfo => {
      const tabElement = document.createElement('div');
      tabElement.className = 'tab-item';
      tabElement.textContent = tabInfo.title || tabInfo.url;
      tabElement.dataset.tabId = tabInfo.id;
      attachTabClickListener(tabElement, tabInfo);
      tabsList.appendChild(tabElement);
    });

    groupElement.appendChild(tabsList);
    tabsList.style.display = 'block';
    arrowIcon.textContent = 'v';
  });
}

function attachTabClickListener(tabElement, tabInfo) {
  tabElement.addEventListener('click', async (event) => {
    event.stopPropagation();
    await browser.runtime.sendMessage({
      action: 'focusTab',
      tabId: tabInfo.id,
      windowId: tabInfo.windowId,
    });
  });
}

async function getTabsForGroup(groupName) {
  const response = await browser.runtime.sendMessage({ action: "getTabsForGroup", groupName });
  return response && response.success ? response.tabs : [];
}

function attachGroupClickListener(groupElement) {
  const groupName = groupElement.dataset.name;
  groupElement.addEventListener('click', () => switchToGroup(groupName));
}
