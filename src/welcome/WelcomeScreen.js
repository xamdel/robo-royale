import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'; // Import GLTFLoader directly

const WELCOME_STORAGE_KEY = 'roboRoyaleWelcomeData';

let scene, camera, renderer, controls, mechModel;
let resolvePromise; // To resolve the promise when the user clicks start

// Default colors
const defaultColors = {
    primary: '#00ffff', // Cyan
    secondary: '#ff00ff' // Magenta
};

// Function to get saved colors or defaults
function getSavedColors() {
    try {
        const saved = localStorage.getItem(WELCOME_STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            // Basic validation
            if (data.primary && data.secondary &&
                /^#[0-9A-F]{6}$/i.test(data.primary) &&
                /^#[0-9A-F]{6}$/i.test(data.secondary)) {
                return data;
            }
        }
    } catch (e) {
        console.error("Error reading welcome screen data from localStorage:", e);
    }
    return { ...defaultColors }; // Return a copy of defaults
}

// Function to save colors
function saveColors(primary, secondary) {
    try {
        localStorage.setItem(WELCOME_STORAGE_KEY, JSON.stringify({ primary, secondary }));
    } catch (e) {
        console.error("Error saving welcome screen data to localStorage:", e);
    }
}

// Function to apply colors to the model
function applyColorsToModel(primaryColor, secondaryColor) {
    if (!mechModel) return;

    const primary = new THREE.Color(primaryColor);
    const secondary = new THREE.Color(secondaryColor);

    mechModel.traverse((child) => {
        if (child.isMesh && child.material) {
            // Simple coloring: Assign primary to most materials, secondary to specific ones
            // This needs refinement based on the actual model structure/material names
            if (child.material.name && child.material.name.toLowerCase().includes('secondary')) {
                 // Clone material to avoid modifying shared materials
                child.material = child.material.clone();
                child.material.color.set(secondary);
            } else if (child.material instanceof THREE.MeshStandardMaterial || child.material instanceof THREE.MeshPhongMaterial) {
                 // Clone material
                child.material = child.material.clone();
                child.material.color.set(primary);
            }
            // Ensure materials are updated
            if(child.material.needsUpdate !== undefined) {
                child.material.needsUpdate = true;
            }
        }
    });
}


// Initialize the 3D preview
function initPreview(canvas) {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a); // Dark background for contrast

    // Camera
    const aspect = canvas.clientWidth / canvas.clientHeight;
    camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
    camera.position.set(0, 1.5, 4); // Positioned to view the mech

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace; // Correct color space

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.set(0, 1, 0); // Target the center of the mech
    controls.minDistance = 2;
    controls.maxDistance = 10;
    controls.update();

    // Load Model
    loadMechModel();

    // Start animation loop
    animatePreview();
}

// Load the mech model
function loadMechModel() { // No longer async as GLTFLoader uses callbacks
    const loader = new GLTFLoader();
    const modelPath = 'assets/models/Mech-norootmotion.glb'; // Define path here

    loader.load(
        modelPath,
        (gltf) => {
            // Success callback
            console.log("WelcomeScreen: Mech model loaded successfully.");
            mechModel = gltf.scene;
            mechModel.position.set(0, 0, 0); // Center the model
             // Scale if necessary - adjust based on model size
            mechModel.scale.set(1, 1, 1);
            scene.add(mechModel);

            // Apply initial colors
            const colors = getSavedColors();
            applyColorsToModel(colors.primary, colors.secondary);
        },
        undefined, // onProgress callback (optional)
        (error) => {
            // Error callback
            console.error("WelcomeScreen: Error loading mech model:", error);
        }
    );
}


// Animation loop for the preview
function animatePreview() {
    if (!renderer) return; // Stop if cleaned up
    requestAnimationFrame(animatePreview);
    controls.update();
    renderer.render(scene, camera);
}

// Cleanup function
function cleanup() {
    if (renderer) {
        renderer.dispose();
        renderer.domElement.remove(); // Remove canvas from DOM if needed
        renderer = null;
    }
    if (controls) {
        controls.dispose();
        controls = null;
    }
    if (scene) {
        // Dispose geometries, materials, textures
        scene.traverse(object => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
            // Textures might need specific disposal if loaded separately
        });
        scene = null;
    }
    camera = null;
    mechModel = null; // Remove reference
    resolvePromise = null; // Clear promise resolver
    console.log("WelcomeScreen: Preview cleaned up.");
}

// Main function to show the welcome screen
export const WelcomeScreen = {
    show: () => {
        return new Promise((resolve) => {
            resolvePromise = resolve; // Store the resolver

            const savedColors = getSavedColors();

            // Create welcome screen elements
            const welcomeScreen = document.createElement('div');
            welcomeScreen.id = 'welcome-screen';

            welcomeScreen.innerHTML = `
                <div class="welcome-container">
                    <div class="welcome-info">
                        <h1>Welcome to Robo Royale</h1>
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
                        </ul>
                    </div>
                    <div class="welcome-preview">
                        <h2>Customize Your Mech</h2>
                        <canvas id="mech-preview-canvas"></canvas>
                        <div class="preview-instructions">Click and drag to rotate</div>
                        <div class="color-pickers">
                            <div class="color-picker-group">
                                <label for="primary-color">Primary</label>
                                <input type="color" id="primary-color" value="${savedColors.primary}">
                            </div>
                            <div class="color-picker-group">
                                <label for="secondary-color">Secondary</label>
                                <input type="color" id="secondary-color" value="${savedColors.secondary}">
                            </div>
                        </div>
                         <button id="start-game-button">Enter Battle</button>
                    </div>
                </div>
            `;

            document.body.appendChild(welcomeScreen);

            // Get elements
            const canvas = document.getElementById('mech-preview-canvas');
            const primaryColorPicker = document.getElementById('primary-color');
            const secondaryColorPicker = document.getElementById('secondary-color');
            const startButton = document.getElementById('start-game-button');

            // Initialize 3D preview
            if (canvas) {
                initPreview(canvas);
            } else {
                console.error("WelcomeScreen: Canvas element not found!");
            }

            // Add event listeners for color pickers
            primaryColorPicker.addEventListener('input', (event) => {
                applyColorsToModel(event.target.value, secondaryColorPicker.value);
            });

            secondaryColorPicker.addEventListener('input', (event) => {
                applyColorsToModel(primaryColorPicker.value, event.target.value);
            });

            // Add event listener for start button
            startButton.addEventListener('click', () => {
                const selectedPrimary = primaryColorPicker.value;
                const selectedSecondary = secondaryColorPicker.value;

                // Save the chosen colors
                saveColors(selectedPrimary, selectedSecondary);

                // Hide the welcome screen with transition
                welcomeScreen.classList.add('hidden');

                // Wait for transition to finish before resolving and cleaning up
                setTimeout(() => {
                    if (resolvePromise) {
                        resolvePromise({ primary: selectedPrimary, secondary: selectedSecondary });
                    }
                    cleanup(); // Clean up Three.js resources
                    welcomeScreen.remove(); // Remove from DOM
                }, 500); // Match CSS transition duration
            });
        });
    },
    // Expose a function to check if the welcome screen was shown (optional)
    hasBeenShown: () => {
         try {
            return !!localStorage.getItem(WELCOME_STORAGE_KEY);
        } catch (e) {
            return false; // Assume not shown if localStorage fails
        }
    }
};
