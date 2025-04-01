import { Joystick } from './Joystick.js';
import { TouchButton } from './TouchButton.js';
import { TouchLookArea } from './TouchLookArea.js';
import * as THREE from 'three'; // For Vector2
import { weaponSystem } from '../weapons/index.js'; // Import weaponSystem
// Removed unused import for updateContextMenuHighlight

export const MobileControlsManager = {
    joystick: null,
    lookArea: null,
    buttons: {}, // Store buttons by action name
    controlsContainer: null,
    isVisible: false,
    isTouchDevice: false,
    initialized: false, // Track initialization

    // State variables
    moveVector: new THREE.Vector2(0, 0),
    lookDelta: { deltaX: 0, deltaY: 0 },
    buttonStates: {}, // e.g., { firePrimary: true, jump: false }
    pickupButtonHoldTimeout: null,
    pickupButtonHoldDuration: 500, // ms hold time for context menu trigger - Increased slightly
    isPickupButtonDown: false, // Track if pickup button is physically down

    // Removed obsolete context menu touch handling properties

    init() {
        if (this.initialized) return; // Prevent double init

        this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        // Add class to body for CSS targeting
        if (this.isTouchDevice) {
            document.body.classList.add('touch-device');
            document.body.classList.remove('desktop-device');
            console.log("[MobileControls] Added body class: touch-device"); // Added log
            console.log("[MobileControls] Touch device detected. Initializing controls...");
            this.createDOM();
            this.setupControls();
            this.addStyles(); // Add basic styles
            this.checkAndSuggestOrientation(); // Suggest landscape/fullscreen
            this.show(); // Show controls by default on touch devices
        } else {
            document.body.classList.add('desktop-device');
            document.body.classList.remove('touch-device');
            console.log("[MobileControls] Added body class: desktop-device"); // Added log
            console.log("[MobileControls] Not a touch device, skipping full initialization.");
            // Optionally hide container explicitly if it exists from previous runs
            const existingContainer = document.getElementById('mobile-controls-container');
            if (existingContainer) existingContainer.style.display = 'none';
        }
        this.initialized = true;
    },

    createDOM() {
        this.controlsContainer = document.createElement('div');
        this.controlsContainer.id = 'mobile-controls-container';
        this.controlsContainer.style.position = 'fixed';
        this.controlsContainer.style.bottom = '0';
        this.controlsContainer.style.left = '0';
        this.controlsContainer.style.width = '100%';
        this.controlsContainer.style.height = '100%'; // Cover screen
        this.controlsContainer.style.pointerEvents = 'none'; // Container doesn't block clicks by default
        this.controlsContainer.style.zIndex = '1100'; // Above HUD background, below HUD elements

        // --- Movement Joystick (Bottom Left) ---
        const joystickZone = document.createElement('div');
        joystickZone.id = 'joystick-zone';
        joystickZone.className = 'mobile-control-zone joystick-zone';
        joystickZone.style.pointerEvents = 'auto'; // Enable touch events

        const joystickStick = document.createElement('div');
        joystickStick.id = 'joystick-stick';
        joystickStick.className = 'joystick-stick';
        joystickZone.appendChild(joystickStick);

        // --- Aiming Joystick (Bottom Right) ---
        const lookZone = document.createElement('div');
        lookZone.id = 'look-area-zone'; // Keep ID for TouchLookArea compatibility
        lookZone.className = 'mobile-control-zone look-area-zone'; // Use for styling as joystick base
        lookZone.style.pointerEvents = 'auto';

        // --- Fire Buttons (Above Movement Joystick) ---
        const firePrimaryLeft = document.createElement('button');
        firePrimaryLeft.id = 'fire-primary-left-button';
        firePrimaryLeft.className = 'mobile-touch-button fire-button'; // Use common class
        firePrimaryLeft.textContent = 'FIRE P';
        firePrimaryLeft.dataset.action = 'firePrimary'; // Use standard action name
        this.buttonStates['firePrimary'] = false;

        const fireSecondaryLeft = document.createElement('button');
        fireSecondaryLeft.id = 'fire-secondary-left-button';
        fireSecondaryLeft.className = 'mobile-touch-button fire-button'; // Use common class
        fireSecondaryLeft.textContent = 'FIRE S';
        fireSecondaryLeft.dataset.action = 'fireSecondary'; // Use standard action name
        this.buttonStates['fireSecondary'] = false;

        // --- Weapon Widgets (Above Aiming Joystick) ---
        const createWeaponWidget = (type) => {
            const widget = document.createElement('div');
            widget.id = `${type}-swap-widget`;
            widget.className = 'mobile-weapon-widget';
            widget.style.pointerEvents = 'auto'; // Allow swap button interaction

            const infoDiv = document.createElement('div');
            infoDiv.className = 'widget-info';
            infoDiv.innerHTML = `
                <div class="widget-name">NO WEAPON</div>
                <div class="widget-ammo">-/-</div>
                <div class="widget-cooldown"><div class="widget-cooldown-bar"></div></div>
            `;
            widget.appendChild(infoDiv);

            const swapButton = document.createElement('button');
            swapButton.id = `swap-${type}-widget-button`;
            swapButton.className = 'mobile-touch-button swap-widget-button';
            swapButton.innerHTML = '&#x21BB;'; // Reload/Swap icon
            swapButton.dataset.action = `swap${type.charAt(0).toUpperCase() + type.slice(1)}`; // e.g., swapPrimary
            this.buttonStates[swapButton.dataset.action] = false; // For single press detection
            widget.appendChild(swapButton);

            return widget;
        };

        const primaryWidget = createWeaponWidget('primary');
        const secondaryWidget = createWeaponWidget('secondary');

        // --- Pickup Button (Lower Left of Aiming Joystick) ---
        const pickupButton = document.createElement('button');
        pickupButton.id = 'pickup-button';
        pickupButton.className = 'mobile-touch-button pickup-button';
        pickupButton.textContent = 'PICK UP';
        pickupButton.dataset.action = 'pickup'; // Action for tap/hold logic
        this.buttonStates['pickup'] = false; // State for tap detection
        this.buttonStates['pickupHold'] = false; // State for hold detection

        // --- Leaderboard Toggle Button (Under Radar - Top Right) ---
        const leaderboardButton = document.createElement('button');
        leaderboardButton.id = 'leaderboard-toggle-button';
        leaderboardButton.className = 'mobile-touch-button leaderboard-toggle';
        leaderboardButton.textContent = 'LB';
        leaderboardButton.dataset.action = 'toggleLeaderboard';
        this.buttonStates['toggleLeaderboard'] = false; // For single press detection

        // --- Fullscreen Toggle Button (Near Leaderboard - Top Right) ---
        const fullscreenButton = document.createElement('button');
        fullscreenButton.id = 'fullscreen-toggle-button';
        fullscreenButton.className = 'mobile-touch-button fullscreen-toggle';
        fullscreenButton.innerHTML = '&#x26F6;'; // Fullscreen symbol (may need adjustment)
        fullscreenButton.title = 'Toggle Fullscreen'; // Tooltip for clarity
        fullscreenButton.dataset.action = 'toggleFullscreen';
        this.buttonStates['toggleFullscreen'] = false; // For single press detection


        // Append elements to container
        this.controlsContainer.appendChild(joystickZone);
        this.controlsContainer.appendChild(lookZone); // Aiming joystick base
        this.controlsContainer.appendChild(firePrimaryLeft);
        this.controlsContainer.appendChild(fireSecondaryLeft);
        this.controlsContainer.appendChild(primaryWidget);
        this.controlsContainer.appendChild(secondaryWidget);
        this.controlsContainer.appendChild(pickupButton);
        this.controlsContainer.appendChild(leaderboardButton);
        this.controlsContainer.appendChild(fullscreenButton); // Add fullscreen button

        document.body.appendChild(this.controlsContainer);
    },

    setupControls() {
        // --- Joystick ---
        const joystickZone = document.getElementById('joystick-zone');
        const joystickStick = document.getElementById('joystick-stick');
        if (joystickZone && joystickStick) {
            this.joystick = new Joystick({
                zone: joystickZone,
                stick: joystickStick,
                maxDistance: 60, // Adjust size as needed
                deadzone: 10,
                onMove: (vector) => {
                    this.moveVector.copy(vector);
                    // console.log("Joystick Move:", vector.x, vector.y); // Debug
                },
                onEnd: () => {
                    this.moveVector.set(0, 0);
                    // console.log("Joystick End"); // Debug
                }
            });
        } else {
            console.error("[MobileControls] Joystick elements not found!");
        }

        // --- Look Area ---
        const lookZone = document.getElementById('look-area-zone');
        if (lookZone) {
            this.lookArea = new TouchLookArea({
                zone: lookZone,
                onLook: ({ deltaX, deltaY }) => {
                    // Accumulate delta for processing in the game loop
                    this.lookDelta.deltaX += deltaX;
                    this.lookDelta.deltaY += deltaY;
                    // console.log("Look Move:", deltaX, deltaY); // Debug
                },
                // onTouchStart: () => console.log("Look Start"), // Debug
                // onTouchEnd: () => console.log("Look End") // Debug
            });
        } else {
            console.error("[MobileControls] Look area element not found!");
        }

        // --- Setup Buttons (Fire, Swap, Leaderboard, Pickup) ---
        const buttonElements = this.controlsContainer.querySelectorAll('.mobile-touch-button');
        buttonElements.forEach(element => {
            const action = element.dataset.action;
            if (!action) return;

            if (action === 'pickup') {
                // Special handling for pickup button (tap/hold)
                this.buttons[action] = new TouchButton({
                    element: element,
                    action: action,
                    onPress: (act) => {
                        this.isPickupButtonDown = true;
                        this.buttonStates[act] = true; // Indicate potential tap start
                        clearTimeout(this.pickupButtonHoldTimeout); // Clear previous timer

                        this.pickupButtonHoldTimeout = setTimeout(() => {
                            if (this.isPickupButtonDown) { // Check if still held
                                console.log("[MobileControls] Pickup button hold detected.");
                                this.buttonStates['pickupHold'] = true; // Set hold state
                                this.triggerPickupContextMenu();
                                this.buttonStates[act] = false; // Reset tap state after hold triggers
                                // Optionally add visual feedback for hold activation
                            }
                        }, this.pickupButtonHoldDuration);
                    },
                    onRelease: (act) => {
                        this.isPickupButtonDown = false;
                        clearTimeout(this.pickupButtonHoldTimeout); // Clear timer on release
                        // Tap state (this.buttonStates['pickup']) is reset in getInputState
                        // Hold state (this.buttonStates['pickupHold']) is reset in getInputState
                        // console.log("[MobileControls] Pickup button released.");
                    }
                });
            } else if (action === 'toggleLeaderboard' || action === 'swapPrimary' || action === 'swapSecondary') {
                // Buttons that trigger once on press (like toggles or swaps)
                this.buttons[action] = new TouchButton({
                    element: element,
                    action: action,
                    onPress: (act) => {
                        this.buttonStates[act] = true; // Set state for one frame detection
                        if (act === 'toggleLeaderboard') {
                            this.handleLeaderboardToggle();
                        }
                        // Swap actions are handled in Game.js by checking the state
                    },
                    onRelease: (act) => {
                        // State is reset in getInputState
                    }
                });
            } else if (action === 'toggleFullscreen') {
                 // Fullscreen toggle button
                 this.buttons[action] = new TouchButton({
                     element: element,
                     action: action,
                     onPress: (act) => {
                         this.buttonStates[act] = true; // Set state for one frame detection
                         this.toggleFullscreen(); // Call the fullscreen handler
                     },
                     onRelease: (act) => {
                         // State is reset in getInputState
                     }
                 });
            }
             else {
                // Standard press/hold buttons (like fire)
                this.buttons[action] = new TouchButton({
                    element: element,
                    action: action,
                    onPress: (act) => { this.buttonStates[act] = true; },
                    onRelease: (act) => { this.buttonStates[act] = false; }
                });
            }
        });
    },

    // --- Action Handlers ---
    handleLeaderboardToggle() {
        if (window.Leaderboard && typeof window.Leaderboard.toggle === 'function') {
            if (window.Game && window.Game.killLog) {
                window.Leaderboard.toggle(window.Game.killLog);
            } else {
                console.warn("[MobileControls] Cannot toggle leaderboard: Game or killLog not found.");
            }
        } else {
            console.warn("[MobileControls] Leaderboard or toggle function not found.");
        }
    },

    async handleQuickPickup() { // Ensure async keyword is present
        // Logic for quick pickup (tap action) - Replicates basic desktop pickup
        console.log("[MobileControls] Quick Pickup triggered (Tap).");
        if (!window.Game || !window.Game.player || !window.Game.weaponSpawnManager || !weaponSystem) {
             console.warn("[MobileControls] Cannot perform quick pickup, Game state or systems not available.");
             return;
        }
        try {
            const playerWorldPos = new THREE.Vector3();
            window.Game.player.getWorldPosition(playerWorldPos);
            const pickupRange = 4.0; // Use game's pickup range
            const nearestPickup = window.Game.weaponSpawnManager.findNearestPickup(playerWorldPos, pickupRange);

            if (nearestPickup && nearestPickup.type === 'weapon') {
                 // Find the first available mount point (primary preferred, then secondary)
                 const primaryMounts = weaponSystem.mountManager.getMountsByType('primary');
                 const secondaryMounts = weaponSystem.mountManager.getMountsByType('secondary');
                 let targetMount = primaryMounts.find(m => !m.getWeapon()) || secondaryMounts.find(m => !m.getWeapon());

                 // If no empty mounts, maybe replace the currently *selected* weapon's mount?
                 // For simplicity now, let's just equip if a slot is free.
                 // Use weaponSystem.tryPickupAndAttach which handles finding a slot
                 console.log(`[MobileControls] Attempting quick attach for ${nearestPickup.config?.displayName || nearestPickup.type}`);
                 const success = await weaponSystem.tryPickupAndAttach(nearestPickup); // Use await if it's async
                 if (success) {
                     console.log(`[MobileControls] Quick attach successful.`);
                     // Hide item badge if shown
                     if (window.HUD?.hideItemBadge) window.HUD.hideItemBadge();
                 } else {
                     console.log("[MobileControls] Quick pickup failed: No available mount points.");
                     // Optionally provide feedback like "All slots full"
                 }
            } else {
                 console.log("[MobileControls] Quick pickup failed: No weapon in range.");
            }
        } catch (error) {
            console.error("[MobileControls] Error during quick pickup:", error);
        }
    },

    // Method to be called in the game loop to get current input state
    getInputState() {
        if (!this.isTouchDevice || !this.isVisible) {
            return {
                moveVector: new THREE.Vector2(0, 0),
                lookDelta: { deltaX: 0, deltaY: 0 },
                buttonStates: {} // Return empty if not active
            };
        }

        // Get current joystick value
        const currentMoveVector = this.joystick ? this.joystick.value.clone() : new THREE.Vector2(0, 0);

        // Get accumulated look delta and reset for next frame
        const currentLookDelta = { ...this.lookDelta };
        this.lookDelta.deltaX = 0;
        this.lookDelta.deltaY = 0;

        // Get current button states, combining left/right fire if needed
        const currentButtonStates = { ...this.buttonStates };

        // Combine fire states if separate buttons exist (adjust if needed)
        // currentButtonStates['firePrimary'] = this.buttonStates['firePrimary'] || this.buttonStates['firePrimaryLeft'];
        // currentButtonStates['fireSecondary'] = this.buttonStates['fireSecondary'] || this.buttonStates['fireSecondaryLeft'];

        // --- Reset single-frame states ---
        // Reset tap state for pickup button after it's been read once, ONLY if hold didn't trigger
        if (this.buttonStates['pickup'] && !this.buttonStates['pickupHold']) {
             // If tap state was true AND hold state is false, trigger the quick pickup action
             this.handleQuickPickup(); // This is now async, but we don't need to await it here
             this.buttonStates['pickup'] = false; // Reset tap state after handling
        } else if (this.buttonStates['pickup']) {
             // If tap was true but hold was also true (or became true), just reset tap state without action
             this.buttonStates['pickup'] = false;
        }

        // Reset hold state for pickup button after it's been read
        if (this.buttonStates['pickupHold']) {
            this.buttonStates['pickupHold'] = false;
        }
        // Reset toggle/swap states
        if (this.buttonStates['toggleLeaderboard']) {
            this.buttonStates['toggleLeaderboard'] = false;
        }
        if (this.buttonStates['swapPrimary']) {
            this.buttonStates['swapPrimary'] = false;
        }
        if (this.buttonStates['swapSecondary']) {
            this.buttonStates['swapSecondary'] = false;
        }
        if (this.buttonStates['toggleFullscreen']) {
             this.buttonStates['toggleFullscreen'] = false; // Reset after read
        }
        // --- End Reset ---

        return {
            moveVector: currentMoveVector, // Use the vector directly
            lookDelta: currentLookDelta,
            buttonStates: currentButtonStates
        };
    },

    show() {
        if (this.isTouchDevice && this.controlsContainer) {
            this.controlsContainer.style.display = 'block';
            this.isVisible = true;
        }
    },

    hide() {
        if (this.controlsContainer) {
            this.controlsContainer.style.display = 'none';
            this.isVisible = false;
        }
    },

    addStyles() {
        // Add basic CSS for layout and appearance
        const style = document.createElement('style');
        style.textContent = `
            .mobile-control-zone {
                position: absolute;
                /* background-color: rgba(255, 0, 0, 0.1); */ /* Debug: Shows zone */
                box-sizing: border-box;
                pointer-events: none; /* Zones don't capture events unless styled otherwise */
            }

            /* --- Joysticks --- */
            .joystick-zone, .look-area-zone {
                bottom: 30px; /* Consistent bottom margin */
                width: 160px; /* Slightly larger */
                height: 160px;
                background-color: rgba(0, 20, 40, 0.3);
                border: 2px solid var(--hud-primary-color);
                border-radius: 50%;
                box-shadow: var(--hud-glow);
                pointer-events: auto; /* Allow touch */
            }
            .joystick-zone { left: 30px; }
            .look-area-zone { right: 30px; }

            .joystick-stick {
                width: 70px; /* Larger stick */
                height: 70px;
                background-color: rgba(0, 170, 255, 0.5);
                border: 2px solid rgba(0, 170, 255, 0.8);
                border-radius: 50%;
                box-shadow: 0 0 10px rgba(0, 170, 255, 0.4);
                position: absolute; /* Positioned by JS */
                transform: translate(-50%, -50%); /* Center based on top/left */
                pointer-events: none; /* Stick itself doesn't capture events */
            }
            /* No separate stick needed for look area, it's the whole zone */

            /* --- Buttons --- */
            .mobile-touch-button {
                position: absolute;
                background-color: rgba(0, 40, 80, 0.6);
                border: 2px solid var(--hud-primary-color);
                border-radius: 50%; /* Default to circular */
                color: var(--hud-primary-color);
                font-family: 'Orbitron', 'Roboto Mono', monospace;
                font-weight: bold;
                display: flex;
                justify-content: center;
                align-items: center;
                box-shadow: var(--hud-glow);
                text-transform: uppercase;
                pointer-events: auto; /* Buttons are interactive */
                user-select: none;
                -webkit-user-select: none;
                touch-action: manipulation;
                transition: background-color 0.1s ease, transform 0.05s ease;
            }
            .mobile-touch-button:active { /* Visual feedback on press */
                background-color: rgba(0, 170, 255, 0.7);
                transform: scale(0.95);
            }

            /* Fire Buttons (Above Movement Joystick) */
            .fire-button {
                width: 75px;
                height: 75px;
                font-size: 12px;
                left: 72.5px; /* Centered above joystick */
                transform: translateX(-50%);
            }
            #fire-primary-left-button { bottom: 210px; }
            #fire-secondary-left-button { bottom: 125px; } /* Spaced out */

            /* Pickup Button (Lower Left of Aiming Joystick) */
            .pickup-button {
                width: 70px;
                height: 70px;
                font-size: 11px;
                bottom: 30px; /* Align with joystick bottom */
                right: 200px; /* Left of aiming joystick */
                background-color: rgba(0, 80, 40, 0.6); /* Greenish tint */
                border-color: rgba(0, 200, 100, 0.8);
            }
            .pickup-button:active {
                 background-color: rgba(0, 200, 100, 0.8);
            }

            /* Leaderboard Button (Under Radar - Top Right) */
            .leaderboard-toggle {
                top: 100px; /* Position below typical radar */
                right: 30px;
                width: 60px;
                height: 40px;
                font-size: 14px;
                border-radius: 5px; /* Rectangular */
            }

            /* --- Weapon Widgets (Above Aiming Joystick) --- */
            .mobile-weapon-widget {
                position: absolute;
                right: 30px; /* Align with aiming joystick */
                width: 180px; /* Wider */
                height: 55px;
                background-color: rgba(0, 20, 40, 0.5);
                border: 2px solid var(--hud-primary-color);
                border-radius: 8px;
                padding: 5px 8px;
                box-shadow: var(--hud-glow);
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
            }
            #primary-swap-widget { bottom: 260px; } /* Positioned higher */
            #secondary-swap-widget { bottom: 195px; }

            .widget-info {
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                justify-content: center;
                color: #eee;
                overflow: hidden;
                pointer-events: none;
            }
            .widget-name {
                font-size: 13px;
                color: var(--hud-primary-color);
                margin-bottom: 2px;
                font-weight: bold;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .widget-ammo {
                font-size: 11px;
                font-family: 'Roboto Mono', monospace;
            }
            .widget-cooldown {
                height: 5px;
                background-color: rgba(0, 0, 0, 0.5);
                margin-top: 3px;
                border-radius: 2px;
                overflow: hidden;
            }
            .widget-cooldown-bar {
                height: 100%;
                width: 0%; /* Updated dynamically */
                background-color: var(--hud-primary-color);
                transition: width 0.1s linear, background-color 0.1s linear;
            }

            .swap-widget-button {
                width: 45px;
                height: 45px;
                flex-shrink: 0;
                font-size: 22px; /* Larger icon */
                padding: 0;
                border-radius: 5px; /* Match widget */
            }

            /* --- Orientation Suggestion Overlay --- */
            .orientation-suggestion {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%; /* Cover screen initially */
                background-color: rgba(0, 10, 20, 0.95); /* Darker, more opaque */
                color: #eee;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                text-align: center;
                z-index: 1500; /* Above everything else */
                font-family: 'Roboto', sans-serif;
                font-size: 18px; /* Slightly larger */
                padding: 30px;
                box-sizing: border-box;
                pointer-events: auto; /* Allow interaction */
                backdrop-filter: blur(5px); /* Optional blur effect */
            }
            .orientation-suggestion p {
                margin: 0 0 25px 0;
                line-height: 1.5;
                max-width: 400px;
            }
            .orientation-suggestion b {
                color: var(--hud-primary-color);
                font-weight: bold;
            }
            .orientation-suggestion button {
                background-color: var(--hud-primary-color);
                color: #000;
                border: none;
                padding: 12px 25px;
                font-size: 16px;
                font-weight: bold;
                border-radius: 5px;
                cursor: pointer;
                transition: background-color 0.2s ease;
            }
            .orientation-suggestion button:hover {
                background-color: #aef; /* Lighter shade on hover */
            }

            /* Fullscreen Button (Near Leaderboard) */
            .fullscreen-toggle {
                top: 100px; /* Align with leaderboard */
                right: 100px; /* Position left of leaderboard */
                width: 50px; /* Slightly smaller */
                height: 40px;
                font-size: 20px; /* Icon size */
                border-radius: 5px; /* Rectangular */
                padding: 0; /* Remove padding for icon */
            }
        `;
        document.head.appendChild(style);
    },

    // --- Orientation/Fullscreen Suggestion ---
    createOrientationSuggestionOverlay() {
        const overlayId = 'orientation-suggestion-overlay';
        if (document.getElementById(overlayId)) return; // Already exists

        const overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.className = 'orientation-suggestion'; // For styling

        const message = document.createElement('p');
        message.innerHTML = 'For the best experience, please rotate your device to <b>landscape</b> and use the <b>fullscreen button</b> (near the top right).'; // Updated text
        overlay.appendChild(message);

        const dismissButton = document.createElement('button');
        dismissButton.textContent = 'Got it!';
        dismissButton.onclick = () => {
            overlay.remove();
            // Optional: Store preference in localStorage
            // localStorage.setItem('hideOrientationSuggestion', 'true');
        };
        overlay.appendChild(dismissButton);

        document.body.appendChild(overlay);

        // Add listeners to auto-hide if conditions change
        const hideOverlay = () => {
            const currentOverlay = document.getElementById(overlayId); // Re-fetch in case it was removed
            if (currentOverlay) {
                 // Check if now landscape OR fullscreen
                 const isLandscape = window.matchMedia("(orientation: landscape)").matches;
                 const isFullscreen = !!document.fullscreenElement;
                 if (isLandscape || isFullscreen) {
                     currentOverlay.remove();
                     window.removeEventListener('orientationchange', hideOverlay);
                     document.removeEventListener('fullscreenchange', hideOverlay);
                 }
            } else {
                 // Overlay already removed, clean up listeners
                 window.removeEventListener('orientationchange', hideOverlay);
                 document.removeEventListener('fullscreenchange', hideOverlay);
            }
        };

        window.addEventListener('orientationchange', hideOverlay);
        document.addEventListener('fullscreenchange', hideOverlay);
    },

    checkAndSuggestOrientation() {
        // Optional: Check localStorage preference
        // if (localStorage.getItem('hideOrientationSuggestion') === 'true') return;

        if (!this.isTouchDevice) return;

        const isPortrait = window.matchMedia("(orientation: portrait)").matches;
        const isFullscreen = !!document.fullscreenElement;

        // Only show if in portrait AND not fullscreen
        if (isPortrait && !isFullscreen) {
            console.log("[MobileControls] Suggesting landscape and fullscreen.");
            this.createOrientationSuggestionOverlay();
        }
    },

    // --- Fullscreen Toggle Handler ---
    toggleFullscreen() {
        console.log("[MobileControls] Toggling fullscreen...");
        if (!document.fullscreenElement &&    // Standard
            !document.mozFullScreenElement && // Firefox
            !document.webkitFullscreenElement && // Chrome, Safari, Opera
            !document.msFullscreenElement) {  // IE/Edge
            // Enter fullscreen
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            } else if (document.documentElement.mozRequestFullScreen) { /* Firefox */
                document.documentElement.mozRequestFullScreen();
            } else if (document.documentElement.webkitRequestFullscreen) { /* Chrome, Safari & Opera */
                document.documentElement.webkitRequestFullscreen();
            } else if (document.documentElement.msRequestFullscreen) { /* IE/Edge */
                document.documentElement.msRequestFullscreen();
            }
        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) { /* Firefox */
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) { /* Chrome, Safari and Opera */
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { /* IE/Edge */
                document.msExitFullscreen();
            }
        }
    },


    // Helper function to trigger context menu (called by hold timer)
    triggerPickupContextMenu() {
        // This function needs access to Game state and weaponSystem
        if (!window.Game || !window.Game.player || !window.Game.weaponSpawnManager || !weaponSystem) {
            console.warn("[MobileControls] Cannot trigger context menu, Game state or weaponSystem not available.");
            return;
        }

        // Find nearest weapon pickup
        const playerWorldPos = new THREE.Vector3();
        window.Game.player.getWorldPosition(playerWorldPos);
        const pickupRange = 4.0; // Use game's pickup range
        const nearestPickup = window.Game.weaponSpawnManager.findNearestPickup(playerWorldPos, pickupRange);

        if (nearestPickup && nearestPickup.type === 'weapon') {
            console.log("[MobileControls] Triggering weapon context menu via pickup button hold.");
            window.Game.isContextMenuActive = true; // Disable camera controls in Game

            // Hide item badge if it was shown
            if (window.HUD?.hideItemBadge) window.HUD.hideItemBadge();

            const allMounts = weaponSystem.mountManager.getAllMounts();
            // Show context menu centered on screen for mobile
            // Pass 'mobile' flag or check isTouchDevice within showWeaponContextMenu
            window.HUD.showWeaponContextMenu(null, allMounts, nearestPickup, true); // Pass true for isMobile
            // Grid interaction is handled by click listeners within contextMenu.js now

        } else {
            console.log("[MobileControls] Pickup button hold did not target a weapon pickup.");
            // Optionally provide feedback if hold didn't do anything
        }
    },

    // Removed obsolete context menu touch handling functions
    // addContextMenuTouchListeners, removeContextMenuTouchListeners,
    // handleContextMenuTouchStart, handleContextMenuTouchMove, handleContextMenuTouchEnd,
    // updateContextMenuHighlightFromTouch

    destroy() {
        if (this.joystick) this.joystick.destroy();
        if (this.lookArea) this.lookArea.destroy();
        Object.values(this.buttons).forEach(btn => btn.destroy());

        if (this.controlsContainer) {
            this.controlsContainer.remove();
        }
        this.joystick = null;
        this.lookArea = null;
        this.buttons = {};
        this.controlsContainer = null;
        this.isVisible = false;
    },

    // Function to update the content of a specific weapon widget
    updateWeaponWidget(widgetType, weaponData) { // widgetType: 'primary' or 'secondary'
        if (!this.isTouchDevice || !this.isVisible) return;

        const widgetElement = document.getElementById(`${widgetType}-swap-widget`);
        if (!widgetElement) return;

        const infoDiv = widgetElement.querySelector('.widget-info');
        if (!infoDiv) return;

        const nameElement = infoDiv.querySelector('.widget-name');
        const ammoElement = infoDiv.querySelector('.widget-ammo');
        const cooldownBar = infoDiv.querySelector('.widget-cooldown-bar');

        if (!nameElement || !ammoElement || !cooldownBar) {
            console.warn(`[MobileControls] Missing elements in ${widgetType} widget's info div.`);
            return;
        }

        if (weaponData) {
            // Update with weapon data
            nameElement.textContent = weaponData.name.toUpperCase();
            ammoElement.textContent = `${weaponData.ammo}/${weaponData.maxAmmo}`;
            const cooldownPercent = weaponData.cooldownPercent || 0;
            cooldownBar.style.width = `${cooldownPercent}%`;
            cooldownBar.style.backgroundColor = cooldownPercent < 100 ? 'var(--hud-warning-color)' : 'var(--hud-primary-color)'; // Charging/Ready color
            widgetElement.style.opacity = '1';
        } else {
            // No weapon equipped
            nameElement.textContent = 'NO WEAPON';
            ammoElement.textContent = '-/-';
            cooldownBar.style.width = '0%';
            widgetElement.style.opacity = '0.6'; // Dim if empty
        }
    }
};
