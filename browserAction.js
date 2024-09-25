// This file handles the browser action (toolbar button) to toggle the sidebar
browser.browserAction.onClicked.addListener(() => {
    // Toggle the sidebar when the button is clicked
    browser.sidebarAction.toggle();
});
