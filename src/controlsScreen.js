export const ControlsScreen = {
  elements: {
    container: null,
  },
  isVisible: false,
  clickOutsideHandler: null, // Handler reference for click outside

  init() {
    console.log("[ControlsScreen] Initializing...");
    // Create container
    this.elements.container = document.createElement('div');
    this.elements.container.id = 'controls-screen-container';
    this.elements.container.style.display = 'none'; // Initially hidden

    // Add content (title and controls list)
    this.elements.container.innerHTML = `
      <h2>Controls</h2>
      <ul class="controls-list">
        <li><span class="key">WASD</span> Move</li>
        <li><span class="key">Mouse</span> Look</li>
        <li><span class="key">Left Click</span> Fire Primary</li>
        <li><span class="key">Scroll Wheel</span> Change Primary</li>
        <li><span class="key">R</span> Fire Secondary</li>
        <li><span class="key">Tab</span> Change Secondary</li>
        <li><span class="key">E</span> Pickup Weapon</li>
        <li><span class="key">Hold E</span> Select Slot / Swap</li>
        <li><span class="key">L</span> Toggle Leaderboard</li>
        <li><span class="key">Esc</span> Toggle Controls</li>
      </ul>
      <button class="close-button">Close</button>
    `; // Added Esc key and Close button

    // Add to body
    document.body.appendChild(this.elements.container);
    console.log("[ControlsScreen] Container added to body.");

    // Add styles
    this.addStyles();

    // Add event listener for the close button
    const closeButton = this.elements.container.querySelector('.close-button');
    if (closeButton) {
      closeButton.addEventListener('click', () => this.hide());
    }

    console.log("[ControlsScreen] Initialization complete.");
  },

  show() {
    if (!this.elements.container) {
      console.error("ControlsScreen container element is missing in show().");
      this.elements.container = document.getElementById('controls-screen-container');
      if (!this.elements.container) return;
    }
    this.elements.container.style.display = 'block';
    this.isVisible = true;

    // Add click outside listener
    setTimeout(() => {
      this.clickOutsideHandler = (event) => {
        // Close if click is outside container and not on the close button itself
        if (this.elements.container &&
            !this.elements.container.contains(event.target) &&
            !event.target.matches('.close-button')) {
          this.hide();
        }
      };
      // Use capture phase to catch clicks on elements that might stop propagation
      document.addEventListener('click', this.clickOutsideHandler, true);
    }, 0);
  },

  hide() {
    if (!this.elements.container) {
      console.error("ControlsScreen container element is missing in hide().");
      this.elements.container = document.getElementById('controls-screen-container');
      if (!this.elements.container) return;
    }
    this.elements.container.style.display = 'none';
    this.isVisible = false;

    // Remove click outside listener
    if (this.clickOutsideHandler) {
      document.removeEventListener('click', this.clickOutsideHandler, true);
      this.clickOutsideHandler = null;
    }
  },

  toggle() {
    // Re-fetch container just in case
    const container = document.getElementById('controls-screen-container');
     if (!container) {
      console.warn("ControlsScreen container not found in DOM during toggle.");
      return;
    }
    this.elements.container = container; // Update reference

    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  },

  addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #controls-screen-container {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 80%;
        max-width: 450px; /* Slightly smaller max-width */
        background-color: rgba(10, 30, 50, 0.9); /* More opaque */
        border: 2px solid #00aaff;
        border-radius: 10px;
        color: #e0e0e0;
        padding: 25px; /* More padding */
        box-shadow: 0 0 20px rgba(0, 170, 255, 0.6);
        z-index: 2500; /* Higher z-index */
        font-family: 'Orbitron', 'Roboto Mono', monospace;
        display: none; /* Ensure it starts hidden */
      }

      #controls-screen-container h2 {
        text-align: center;
        color: #00aaff;
        margin-top: 0;
        margin-bottom: 20px; /* More space below title */
        text-shadow: 0 0 5px rgba(0, 170, 255, 0.7);
        border-bottom: 1px solid rgba(0, 170, 255, 0.5);
        padding-bottom: 15px;
        font-size: 1.4em; /* Larger title */
      }

      #controls-screen-container .controls-list {
        list-style: none;
        padding: 0;
        margin: 0 auto 20px auto; /* Center list and add bottom margin */
        max-width: 350px; /* Wider list */
        font-size: 14px; /* Standard font size */
      }

      #controls-screen-container .controls-list li {
        display: flex;
        justify-content: space-between;
        align-items: center; /* Vertically align items */
        margin-bottom: 10px; /* More space between items */
        padding: 5px 0;
      }

      #controls-screen-container .controls-list .key {
        font-weight: bold;
        color: #00ffff; /* Cyan key color */
        background-color: rgba(0, 50, 80, 0.8); /* Darker key background */
        padding: 4px 8px; /* More padding */
        border-radius: 4px;
        margin-right: 15px; /* More space after key */
        min-width: 50px; /* Wider key box */
        text-align: center;
        box-shadow: 0 0 3px rgba(0, 255, 255, 0.5); /* Subtle glow */
      }

      #controls-screen-container .close-button {
        display: block; /* Make it a block element */
        margin: 20px auto 0 auto; /* Center button */
        padding: 10px 25px;
        background-color: #0077aa;
        color: #ffffff;
        border: 1px solid #00aaff;
        border-radius: 5px;
        font-family: inherit;
        font-size: 1em;
        cursor: pointer;
        transition: background-color 0.2s ease, box-shadow 0.2s ease;
        box-shadow: 0 0 8px rgba(0, 170, 255, 0.4);
      }

      #controls-screen-container .close-button:hover {
        background-color: #0099cc;
        box-shadow: 0 0 12px rgba(0, 170, 255, 0.7);
      }
    `;
    document.head.appendChild(style);
  }
};
