document.getElementById('addGroupButton').addEventListener('click', function() {
    var groupsDiv = document.getElementById('groups');
    var newGroup = document.createElement('div');
    newGroup.className = 'group';
    newGroup.textContent = 'New Group';
    groupsDiv.appendChild(newGroup);
  });
  