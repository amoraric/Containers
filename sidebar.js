let currentGroupName = null;

// Helper function to extract domain from a URL
function getDomain(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname;
  } catch (e) {
    console.error(`Invalid URL encountered: ${url}`);
    return null;
  }
}

// Update the current group highlighting in the UI
function updateCurrentGroupHighlighting() {
  // Remove 'active' class from all groups
  document.querySelectorAll('.group').forEach(group => group.classList.remove('active'));

  // Add 'active' class to the current group
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

    // Render the default group separately
    if (tabGroups['Default Group']) {
      updateDefaultGroup(tabGroups['Default Group']);
    }

    // Render other groups under "Other Containers"
    for (const groupName in tabGroups) {
      if (groupName !== 'Default Group') {
        addGroupElement(groupName);
      }
    }

    updateCurrentGroupHighlighting();

    // **Attach Event Listeners to the Default Group**
    const defaultGroupElement = document.getElementById('defaultGroup');
    attachGroupClickListener(defaultGroupElement);
    attachArrowClickListener(defaultGroupElement);
  }
}

initialize();

// Function to update the default group's tab count and list
function updateDefaultGroup(tabs) {
  const defaultTabCountSpan = document.getElementById('defaultGroupName');
  defaultTabCountSpan.textContent = formatTabCount(tabs.length);

  const defaultGroupElement = document.getElementById('defaultGroup');
  const tabsList = defaultGroupElement.querySelector('.tabs-list');

  // Clear existing tabs
  tabsList.innerHTML = '';

  // Add tabs to the default group
  tabs.forEach(tabInfo => {
    const tabElement = createTabElement(tabInfo);
    tabsList.appendChild(tabElement);
  });
}

// Function to format tab count (e.g., "1 Tab" vs. "4 Tabs")
function formatTabCount(count) {
  return `${count} Tab${count !== 1 ? 's' : ''}`;
}

// Listen for messages from the background script
browser.runtime.onMessage.addListener((message) => {
  if (message.action === "currentGroupChanged") {
    currentGroupName = message.currentGroupName;
    updateCurrentGroupHighlighting();
  } else if (message.action === "tabsUpdated") {
    const groupName = message.groupName;
    const tabs = message.tabs;
    if (groupName === 'Default Group') {
      updateDefaultGroup(tabs);
    } else {
      const groupElement = document.querySelector(`.group[data-name="${groupName}"]`);
      if (groupElement) {
        const tabsList = groupElement.querySelector('.tabs-list');
        if (tabsList) {
          // Clear the existing tabs
          tabsList.innerHTML = '';
          // Add the updated tabs
          tabs.forEach(tabInfo => {
            const tabElement = createTabElement(tabInfo);
            tabsList.appendChild(tabElement);
          });
        }
      }
    }
  }
});

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

// Updated addGroupElement Function with Bootstrap Two-Squares Icon
function addGroupElement(groupName) {
  const groupsDiv = document.getElementById('groups');

  if (document.querySelector(`.group[data-name="${groupName}"]`)) return;

  const groupElement = document.createElement('div');
  groupElement.className = 'group';
  groupElement.dataset.name = groupName;

  const groupContent = document.createElement('div');
  groupContent.className = 'group-content';

  // Two-Squares Icon Added using Bootstrap Icons
  const groupIcon = document.createElement('i');
  groupIcon.className = 'bi bi-grid group-icon'; // Using 'bi-grid' for two squares
  groupIcon.setAttribute('aria-hidden', 'true');
  groupIcon.setAttribute('title', groupName);
  groupContent.appendChild(groupIcon);

  const groupNameSpan = document.createElement('span');
  groupNameSpan.className = 'group-name';
  groupNameSpan.textContent = groupName;

  const arrowButton = document.createElement('span');
  arrowButton.className = 'arrow-icon';
  arrowButton.textContent = '>'; // Initial state

  groupContent.appendChild(groupNameSpan);
  groupContent.appendChild(arrowButton);
  groupElement.appendChild(groupContent);
  groupsDiv.appendChild(groupElement);

  attachGroupClickListener(groupElement);
  attachArrowClickListener(groupElement);
}

function attachArrowClickListener(groupElement) {
  const arrowIcon = groupElement.querySelector('.arrow-icon');
  const groupName = groupElement.dataset.name;

  arrowIcon.addEventListener('click', async (event) => {
    event.stopPropagation(); // Prevent the click from bubbling up to the group

    let tabsList = groupElement.querySelector('.tabs-list');

    if (tabsList) {
      const isVisible = tabsList.style.display !== 'none';
      tabsList.style.display = isVisible ? 'none' : 'block'; // Toggle display
      arrowIcon.classList.toggle('open', !isVisible); // Toggle 'open' class for CSS
      arrowIcon.textContent = isVisible ? '>' : 'v'; // Toggle arrow icon
      return;
    }

    // Fetch tabs for the group if tabsList doesn't exist
    const tabs = await getTabsForGroup(groupName);
    if (tabs.length === 0) return;

    tabsList = document.createElement('div');
    tabsList.className = 'tabs-list';

    // Render each tab
    tabs.forEach(tabInfo => {
      const tabElement = createTabElement(tabInfo);
      tabsList.appendChild(tabElement);
    });

    groupElement.appendChild(tabsList);
    tabsList.style.display = 'block'; // Ensure the dropdown stays open by default
    arrowIcon.textContent = 'v';  // Indicate the dropdown is open
    arrowIcon.classList.add('open'); // Add 'open' class for CSS
  });
}

function attachGroupClickListener(groupElement) {
  const groupName = groupElement.dataset.name;

  groupElement.addEventListener('click', async () => {
    await switchToGroup(groupName);
    // Ensure tabsList remains open after switching groups
    const tabsList = groupElement.querySelector('.tabs-list');
    if (tabsList) {
      tabsList.style.display = 'block';  // Keep it open
      const arrowIcon = groupElement.querySelector('.arrow-icon');
      if (arrowIcon) {
        arrowIcon.textContent = 'v'; // Ensure arrow indicates open state
        arrowIcon.classList.add('open'); // Add 'open' class for CSS
      }
    }
  });
}

async function switchToGroup(groupName) {
  const response = await browser.runtime.sendMessage({ action: "switchGroup", groupName });
  if (response && response.success) {
    currentGroupName = groupName;
    updateCurrentGroupHighlighting();
  }

  // Prevent dropdown from closing after switching groups
  const activeGroupElement = document.querySelector(`.group[data-name="${groupName}"]`);
  const tabsList = activeGroupElement?.querySelector('.tabs-list');
  if (tabsList) {
    tabsList.style.display = 'block'; // Keep the dropdown open when switching groups
    const arrowIcon = activeGroupElement.querySelector('.arrow-icon');
    if (arrowIcon) {
      arrowIcon.textContent = 'v'; // Indicate the dropdown is open
      arrowIcon.classList.add('open'); // Add 'open' class for CSS
    }
  }
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

// Helper function to create a tab element
function createTabElement(tabInfo) {
  const tabElement = document.createElement('div');
  tabElement.className = 'tab-item';

  // Create a favicon img element
  const faviconImg = document.createElement('img');
  faviconImg.className = 'tab-favicon';
  faviconImg.src = 'icons/loading-placeholder.png'; // Placeholder while loading

  // Set favicon based on tab URL after placeholder is set
  if (tabInfo.url.startsWith('about:') || !tabInfo.url) {
    faviconImg.src = 'icons/default-icon.png'; // Fallback to default icon
  } else {
    const domain = getDomain(tabInfo.url);
    if (domain) {
      faviconImg.src = `https://www.google.com/s2/favicons?sz=16&domain=${encodeURIComponent(domain)}`;
    } else {
      faviconImg.src = 'icons/default-icon.png'; // Fallback if domain extraction fails
    }
  }

  faviconImg.onerror = function() {
    this.src = 'icons/default-icon.png'; // Fallback to default icon if favicon fails to load
  };

  // Create a span for the tab title and assign 'tab-title' class
  const tabTitle = document.createElement('span');
  tabTitle.className = 'tab-title'; // **Added Class**
  tabTitle.textContent = tabInfo.title || 'Untitled'; // Handle empty titles

  // Append the favicon and title to the tab element
  tabElement.appendChild(faviconImg);
  tabElement.appendChild(tabTitle);

  tabElement.dataset.tabId = tabInfo.id;
  attachTabClickListener(tabElement, tabInfo);
  return tabElement;
}
