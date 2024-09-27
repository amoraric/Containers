let currentGroupName = null;

// Helper function to extract domain from a URL
function getDomain(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname;
  } catch (e) {
    return null;
  }
}

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
  } else if (message.action === "tabsUpdated") {
    const groupName = message.groupName;
    const tabs = message.tabs;
    const groupElement = document.querySelector(`.group[data-name="${groupName}"]`);
    if (groupElement) {
      const tabsList = groupElement.querySelector('.tabs-list');
      if (tabsList) {
        // Clear the existing tabs
        tabsList.innerHTML = '';
        // Add the updated tabs
        tabs.forEach(tabInfo => {
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

          // Create a span for the tab title
          const tabTitle = document.createElement('span');
          tabTitle.textContent = tabInfo.title || 'Untitled'; // Handle empty titles

          // Append the favicon and title to the tab element
          tabElement.appendChild(faviconImg);
          tabElement.appendChild(tabTitle);

          tabElement.dataset.tabId = tabInfo.id;
          attachTabClickListener(tabElement, tabInfo);
          tabsList.appendChild(tabElement);
        });
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
  arrowButton.textContent = '>'; // Initial state

  iconsContainer.appendChild(arrowButton);

  groupContent.appendChild(groupNameSpan);
  groupContent.appendChild(iconsContainer);
  groupElement.appendChild(groupContent);
  groupsDiv.appendChild(groupElement);

  attachGroupClickListener(groupElement);
  attachArrowClickListener(groupElement);

  // Automatically Open Dropdown
  arrowButton.click();
}

function attachArrowClickListener(groupElement) {
  const arrowIcon = groupElement.querySelector('.arrow-icon');
  const groupName = groupElement.dataset.name;

  arrowIcon.addEventListener('click', async (event) => {
    event.stopPropagation();
    let tabsList = groupElement.querySelector('.tabs-list');

    if (tabsList) {
      const isVisible = tabsList.style.display !== 'none';
      tabsList.style.display = isVisible ? 'none' : 'block'; // Toggle display
      arrowIcon.classList.toggle('open', !isVisible); // Toggle 'open' class for CSS
      arrowIcon.textContent = isVisible ? '>' : 'v'; // Toggle arrow icon
      return;
    }

    // Fetch tabs for the group
    const tabs = await getTabsForGroup(groupName);
    if (tabs.length === 0) return;

    tabsList = document.createElement('div');
    tabsList.className = 'tabs-list';

    // Render each tab and ensure favicon is added
    tabs.forEach(tabInfo => {
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

      // Create a span for the tab title
      const tabTitle = document.createElement('span');
      tabTitle.textContent = tabInfo.title || 'Untitled'; // Handle empty titles

      // Append the favicon and title to the tab element
      tabElement.appendChild(faviconImg);
      tabElement.appendChild(tabTitle);

      tabElement.dataset.tabId = tabInfo.id;
      attachTabClickListener(tabElement, tabInfo);
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
