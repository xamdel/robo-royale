export const Leaderboard = {
  elements: {
    container: null,
    list: null,
    // controlsContainer: null, // Removed controls container reference
    headerRow: null, // Add header row element
  },
  isVisible: false,
  clickOutsideHandler: null, // Add handler reference

  init() {
    console.log("[Leaderboard] Initializing...");
    // Create container
    this.elements.container = document.createElement('div');
    this.elements.container.id = 'leaderboard-container';
    console.log("[Leaderboard] Container element created:", this.elements.container); // Add log
    this.elements.container.style.display = 'none'; // Initially hidden

    // Create title
    const title = document.createElement('h2');
    title.textContent = 'Match Kills';
    this.elements.container.appendChild(title);

    // Create close button
    const closeButton = document.createElement('button');
    closeButton.textContent = 'X';
    closeButton.className = 'leaderboard-close-button'; // Add class for styling
    closeButton.style.position = 'absolute'; // Position absolutely within the container
    closeButton.style.top = '10px'; // Adjust as needed
    closeButton.style.left = '10px'; // Adjust as needed
    closeButton.style.cursor = 'pointer'; // Indicate it's clickable
    closeButton.style.background = 'none'; // Optional: remove default button background
    closeButton.style.border = 'none'; // Optional: remove default button border
    closeButton.style.fontSize = '1.5em'; // Make it larger
    closeButton.style.color = 'white'; // Set color (adjust if needed)
    closeButton.style.zIndex = '10'; // Ensure it's above other elements if necessary
    closeButton.addEventListener('click', () => this.hide());
    this.elements.container.appendChild(closeButton);


    // Create and populate header row for the list
    this.elements.headerRow = document.createElement('div');
    this.elements.headerRow.className = 'leaderboard-header';
    this.elements.headerRow.innerHTML = `
      <span class="header-name">Name</span>
      <span class="header-kills">Kills</span>
    `;
    this.elements.container.appendChild(this.elements.headerRow);

    // Create list area
    this.elements.list = document.createElement('ul');
    this.elements.container.appendChild(this.elements.list);
    console.log("[Leaderboard] List element created:", this.elements.list);

    // Add to body
    document.body.appendChild(this.elements.container);
    console.log("[Leaderboard] Container added to body."); // Add log

    console.log("[Leaderboard] Initialization complete."); // Add log
  },

  update(killLog = []) {
    // Ensure list element is valid before updating
    if (!this.elements.list) {
        console.error("Leaderboard list element is missing in update().");
        // Attempt to re-fetch if possible, though this indicates an init issue
        this.elements.list = document.getElementById('leaderboard-container')?.querySelector('ul');
        if (!this.elements.list) return; // Still not found, exit
    }
    
    // Clear previous entries
    this.elements.list.innerHTML = '';

    // Calculate kill counts
    const killCounts = {};
    killLog.forEach(kill => {
      killCounts[kill.killerName] = (killCounts[kill.killerName] || 0) + 1;
    });

    // Convert to array and sort by kills (descending)
    const playerScores = Object.entries(killCounts)
      .map(([name, kills]) => ({ name, kills }))
      .sort((a, b) => b.kills - a.kills);

    if (playerScores.length === 0) {
      const noKillsItem = document.createElement('li');
      noKillsItem.textContent = 'No kills yet.';
      this.elements.list.appendChild(noKillsItem);
      return;
    }

    // Populate with sorted scores using spans for columns
    playerScores.forEach(player => {
      const listItem = document.createElement('li');
      listItem.innerHTML = `
        <span class="player-name">${player.name}</span>
        <span class="player-kills">${player.kills}</span>
      `;
      this.elements.list.appendChild(listItem);
    });
  },

  show(killLog) {
    // Ensure container element is valid before showing
    if (!this.elements.container) {
        console.error("Leaderboard container element is missing in show().");
        // Attempt to re-fetch if possible
        this.elements.container = document.getElementById('leaderboard-container');
        if (!this.elements.container) return; // Still not found, exit
    }
    this.update(killLog); // Update content when showing
    this.elements.container.style.display = 'block';
    this.isVisible = true;

    // Add click outside listener
    // Use setTimeout to avoid capturing the click that opened the leaderboard
    setTimeout(() => {
      this.clickOutsideHandler = (event) => {
        if (this.elements.container && !this.elements.container.contains(event.target)) {
          this.hide();
        }
      };
      document.addEventListener('click', this.clickOutsideHandler, true); // Use capture phase
    }, 0);
  },

  hide() {
     // Ensure container element is valid before hiding
    if (!this.elements.container) {
        console.error("Leaderboard container element is missing in hide().");
         // Attempt to re-fetch if possible
        this.elements.container = document.getElementById('leaderboard-container');
        if (!this.elements.container) return; // Still not found, exit
    }
    this.elements.container.style.display = 'none';
    this.isVisible = false;

    // Remove click outside listener
    if (this.clickOutsideHandler) {
      document.removeEventListener('click', this.clickOutsideHandler, true);
      this.clickOutsideHandler = null;
    }
  },

  toggle(killLog) {
    // Re-fetch elements by ID as a safeguard in case references were lost or init was incomplete
    const container = document.getElementById('leaderboard-container');
    // Ensure list is queried within the container *after* container is confirmed to exist
    const list = container ? container.querySelector('ul') : null; 

    // Log the state of fetched elements for debugging
    console.log("[Leaderboard Toggle] Fetched elements:", container, list);

    // Check if fetched elements exist in the DOM
    if (!container || !list) {
      console.warn("Leaderboard elements not found in DOM during toggle.");
      // Optionally, could try re-initializing, but might cause duplicates. Best to just return.
      // this.init(); // Avoid re-init for now
      return; 
    }

    // Update the stored references just in case they were invalid
    this.elements.container = container;
    this.elements.list = list;

    if (this.isVisible) {
      this.hide();
    } else {
      this.show(killLog);
    }
  },

};
