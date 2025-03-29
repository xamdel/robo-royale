export const Leaderboard = {
  elements: {
    container: null,
    list: null,
  },
  isVisible: false,

  init() {
    console.log("[Leaderboard] Initializing..."); // Add log
    // Create container
    this.elements.container = document.createElement('div');
    this.elements.container.id = 'leaderboard-container';
    console.log("[Leaderboard] Container element created:", this.elements.container); // Add log
    this.elements.container.style.display = 'none'; // Initially hidden

    // Create title
    const title = document.createElement('h2');
    title.textContent = 'Match Kills';
    this.elements.container.appendChild(title);

    // Create list area
    this.elements.list = document.createElement('ul');
    this.elements.container.appendChild(this.elements.list);
    console.log("[Leaderboard] List element created:", this.elements.list); // Add log

    // Add to body
    document.body.appendChild(this.elements.container);
    console.log("[Leaderboard] Container added to body."); // Add log

    // Add styles
    this.addStyles();
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

    // Populate with sorted scores
    playerScores.forEach(player => {
      const listItem = document.createElement('li');
      listItem.textContent = `${player.name}: ${player.kills}`;
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
    // Optional: Pause game or capture input focus here if needed
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
    // Optional: Resume game or release input focus here
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

  addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #leaderboard-container {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 80%;
        max-width: 500px;
        max-height: 70vh;
        background-color: rgba(10, 30, 50, 0.85);
        border: 2px solid #00aaff;
        border-radius: 10px;
        color: #e0e0e0;
        padding: 20px;
        box-shadow: 0 0 15px rgba(0, 170, 255, 0.5);
        z-index: 2000; /* Ensure it's above the HUD */
        font-family: 'Orbitron', 'Roboto Mono', monospace;
        overflow-y: auto; /* Add scrollbar if content overflows */
      }

      #leaderboard-container h2 {
        text-align: center;
        color: #00aaff;
        margin-top: 0;
        margin-bottom: 15px;
        text-shadow: 0 0 5px rgba(0, 170, 255, 0.7);
        border-bottom: 1px solid rgba(0, 170, 255, 0.5);
        padding-bottom: 10px;
      }

      #leaderboard-container ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      #leaderboard-container li {
        background-color: rgba(0, 20, 40, 0.6);
        padding: 8px 12px;
        margin-bottom: 8px;
        border-radius: 4px;
        border-left: 3px solid #00aaff;
        font-size: 14px;
      }
      
      #leaderboard-container li:last-child {
        margin-bottom: 0;
      }
    `;
    document.head.appendChild(style);
  }
};
