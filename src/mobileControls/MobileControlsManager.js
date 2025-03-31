import { Joystick } from './Joystick.js';
import { TouchButton } from './TouchButton.js';
import { TouchLookArea } from './TouchLookArea.js';
import * as THREE from 'three'; // For Vector2

export const MobileControlsManager = {
    joystick: null,
    lookArea: null,
    buttons: {}, // Store buttons by action name
    controlsContainer: null,
    isVisible: false,
    isTouchDevice: false,

    // State variables
    moveVector: new THREE.Vector2(0, 0),
    lookDelta: { deltaX: 0, deltaY: 0 }, // Store cumulative delta for a frame
    buttonStates: {}, // e.g., { firePrimary: true, jump: false }

    init() {
        this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        if (!this.isTouchDevice) {
            console.log("[MobileControls] Not a touch device, skipping initialization.");
            return;
        }

        console.log("[MobileControls] Initializing for touch device...");
        this.createDOM();
        this.setupControls();
        this.addStyles(); // Add basic styles
        this.show(); // Show controls by default on touch devices
    },

    createDOM() {
        this.controlsContainer = document.createElement('div');
        this.controlsContainer.id = 'mobile-controls-container';
        this.controlsContainer.style.position = 'fixed';
        this.controlsContainer.style.bottom = '0';
        this.controlsContainer.style.left = '0';
        this.controlsContainer.style.width = '100%';
        this.controlsContainer.style.height = '100%'; // Cover screen for look area
        this.controlsContainer.style.pointerEvents = 'none'; // Container doesn't block clicks
        this.controlsContainer.style.zIndex = '1100'; // Above HUD background, below HUD elements

        // --- Joystick Area (Bottom Left) ---
        const joystickZone = document.createElement('div');
        joystickZone.id = 'joystick-zone';
        joystickZone.className = 'mobile-control-zone joystick-zone';
        joystickZone.style.pointerEvents = 'auto'; // Enable touch events

        const joystickStick = document.createElement('div');
        joystickStick.id = 'joystick-stick';
        joystickStick.className = 'joystick-stick';
        joystickZone.appendChild(joystickStick); // Stick inside zone

        // --- Look Area (Right Half) ---
        const lookZone = document.createElement('div');
        lookZone.id = 'look-area-zone';
        lookZone.className = 'mobile-control-zone look-area-zone';
        lookZone.style.pointerEvents = 'auto';

        // --- Button Area (Bottom Right) ---
        const buttonArea = document.createElement('div');
        buttonArea.id = 'button-area';
        buttonArea.className = 'mobile-control-zone button-area';
        buttonArea.style.pointerEvents = 'auto';

        // Define buttons (add more as needed)
        const buttonsToCreate = [
            { action: 'firePrimary', text: 'FIRE P', id: 'fire-primary-button' },
            { action: 'fireSecondary', text: 'FIRE S', id: 'fire-secondary-button' },
            { action: 'swapPrimary', text: 'SWAP P', id: 'swap-primary-button' },
            { action: 'swapSecondary', text: 'SWAP S', id: 'swap-secondary-button' },
            // { action: 'jump', text: 'JUMP', id: 'jump-button' },
            // { action: 'interact', text: 'E', id: 'interact-button' }, // Interact might be contextual
        ];

        buttonsToCreate.forEach(btnData => {
            const buttonElement = document.createElement('button');
            buttonElement.id = btnData.id;
            buttonElement.className = 'mobile-touch-button';
            buttonElement.textContent = btnData.text;
            buttonElement.dataset.action = btnData.action; // Store action
            buttonArea.appendChild(buttonElement);
            this.buttonStates[btnData.action] = false; // Initialize state
        });

        // Append zones to container
        this.controlsContainer.appendChild(joystickZone);
        this.controlsContainer.appendChild(lookZone);
        this.controlsContainer.appendChild(buttonArea);

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

        // --- Buttons ---
        const buttonElements = this.controlsContainer.querySelectorAll('.mobile-touch-button');
        buttonElements.forEach(element => {
            const action = element.dataset.action;
            if (action) {
                this.buttons[action] = new TouchButton({
                    element: element,
                    action: action,
                    onPress: (act) => {
                        this.buttonStates[act] = true;
                        // console.log(`Button ${act} State: true`); // Debug
                    },
                    onRelease: (act) => {
                        this.buttonStates[act] = false;
                        // console.log(`Button ${act} State: false`); // Debug
                    }
                });
            }
        });
    },

    // Method to be called in the game loop to get current input state
    getInputState() {
        if (!this.isTouchDevice || !this.isVisible) {
            return {
                moveVector: new THREE.Vector2(0, 0),
                lookDelta: { deltaX: 0, deltaY: 0 },
                buttonStates: {}
            };
        }

        // Get current joystick value
        const currentMoveVector = this.joystick ? this.joystick.value.clone() : new THREE.Vector2(0, 0);

        // Get accumulated look delta and reset for next frame
        const currentLookDelta = { ...this.lookDelta };
        this.lookDelta.deltaX = 0;
        this.lookDelta.deltaY = 0;

        // Get current button states
        const currentButtonStates = { ...this.buttonStates };

        return {
            moveVector: currentMoveVector,
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
                /* background-color: rgba(255, 0, 0, 0.1); */ /* Debug background */
                border-radius: 10px;
                box-sizing: border-box;
            }

            .joystick-zone {
                bottom: 20px;
                left: 20px;
                width: 150px;
                height: 150px;
                background-color: rgba(100, 100, 100, 0.3);
                border-radius: 50%;
                border: 2px solid rgba(255, 255, 255, 0.4);
            }

            .joystick-stick {
                width: 60px;
                height: 60px;
                background-color: rgba(200, 200, 200, 0.6);
                border-radius: 50%;
                border: 1px solid rgba(255, 255, 255, 0.8);
                position: absolute; /* Positioned by JS */
                transform: translate(-50%, -50%); /* Center based on top/left */
            }

            .look-area-zone {
                bottom: 0;
                right: 0;
                width: 50%; /* Right half */
                height: 70%; /* Avoid overlapping top HUD elements */
                /* background-color: rgba(0, 0, 255, 0.05); */ /* Debug background */
            }

            .button-area {
                bottom: 20px;
                right: 20px;
                display: grid;
                grid-template-columns: repeat(2, 1fr); /* 2 columns */
                gap: 15px;
                width: 180px; /* Adjust as needed */
                /* background-color: rgba(0, 255, 0, 0.1); */ /* Debug background */
            }

            .mobile-touch-button {
                width: 70px;
                height: 70px;
                background-color: rgba(0, 170, 255, 0.4); /* HUD primary color */
                border: 2px solid rgba(0, 170, 255, 0.8);
                border-radius: 50%; /* Circular buttons */
                color: white;
                font-size: 10px;
                font-weight: bold;
                text-align: center;
                display: flex;
                justify-content: center;
                align-items: center;
                pointer-events: auto; /* Buttons are interactive */
                user-select: none; /* Prevent text selection */
                -webkit-user-select: none;
                touch-action: manipulation; /* Improve responsiveness */
                transition: background-color 0.1s ease;
            }

            .mobile-touch-button.active {
                background-color: rgba(0, 170, 255, 0.8); /* Darker when pressed */
            }

            /* Specific button placement if needed using grid-area or order */
            #fire-primary-button { /* Example */
               /* grid-column: 2;
               grid-row: 2; */
            }
        `;
        document.head.appendChild(style);
    },

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
    }
};
