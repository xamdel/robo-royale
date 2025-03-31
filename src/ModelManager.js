import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MODEL_PATH = 'assets/models/city/';
const MODEL_FILES = [
    'Large Building-2.glb',
    'Large Building-3.glb',
    'Large Building-4.glb',
    'Large Building-5.glb',
    'Large Building-6.glb',
    'Large Building-7.glb',
    'Large Building.glb',
    'Skyscraper-2.glb',
    'Skyscraper.glb',
    'Small Building-2.glb',
    'Small Building-3.glb',
    'Small Building-4.glb',
    'Small Building-5.glb',
    'Small Building-6.glb',
    'Small Building.glb'
];

class ModelManager {
    constructor() {
        this.loader = new GLTFLoader();
        this.models = {
            small: [],
            large: [],
            skyscraper: []
        };
        this.isLoaded = false;
    }

    _categorizeModel(filename, gltf) {
        const modelData = {
            scene: gltf.scene, // We might need the whole scene if models have complex structure
            animations: gltf.animations, // Though unlikely for buildings
            // We'll extract geometry and material later if needed for InstancedMesh
        };

        if (filename.toLowerCase().startsWith('small')) {
            this.models.small.push(modelData);
        } else if (filename.toLowerCase().startsWith('large')) {
            this.models.large.push(modelData);
        } else if (filename.toLowerCase().startsWith('skyscraper')) {
            this.models.skyscraper.push(modelData);
        } else {
            console.warn(`[ModelManager] Could not categorize model: ${filename}`);
            // Optionally add to a default category or ignore
        }
    }

    async loadModels() {
        if (this.isLoaded) {
            console.log("[ModelManager] Models already loaded.");
            return;
        }
        console.log("[ModelManager] Loading building models...");

        const loadPromises = MODEL_FILES.map(filename => {
            return new Promise((resolve, reject) => {
                this.loader.load(
                    `${MODEL_PATH}${filename}`,
                    (gltf) => {
                        console.log(`[ModelManager] Loaded: ${filename}`);
                        this._categorizeModel(filename, gltf);
                        resolve();
                    },
                    undefined, // onProgress callback (optional)
                    (error) => {
                        console.error(`[ModelManager] Error loading ${filename}:`, error);
                        reject(error);
                    }
                );
            });
        });

        try {
            await Promise.all(loadPromises);
            this.isLoaded = true;
            console.log("[ModelManager] All building models loaded and categorized.");
            console.log(`[ModelManager] Counts - Small: ${this.models.small.length}, Large: ${this.models.large.length}, Skyscraper: ${this.models.skyscraper.length}`);
        } catch (error) {
            console.error("[ModelManager] Failed to load one or more models.", error);
            // Handle potential partial loading or failure state
        }
    }

    getRandomModel(category) {
        if (!this.isLoaded) {
            console.error("[ModelManager] Models not loaded yet.");
            return null;
        }
        const categoryModels = this.models[category];
        if (!categoryModels || categoryModels.length === 0) {
            console.warn(`[ModelManager] No models found for category: ${category}`);
            // Fallback logic: maybe return a model from another category or null
            if (this.models.small.length > 0) return this.models.small[Math.floor(Math.random() * this.models.small.length)];
            return null;
        }
        const randomIndex = Math.floor(Math.random() * categoryModels.length);
        return categoryModels[randomIndex];
    }

    // extractInstanceData removed as it's no longer needed for individual model placement.

    // Creates a visual representation for an ammo box pickup with text
    async createAmmoBox() {
        const boxSize = 0.8;
        const geometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);

        // Create canvas for texture
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const canvasSize = 128; // Texture resolution
        canvas.width = canvasSize;
        canvas.height = canvasSize;

        // Background color (darker green)
        const backgroundColor = '#006400'; // Dark Green
        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Text properties
        const textColor = '#FFFFFF'; // White text
        const fontSize = 30;
        context.font = `Bold ${fontSize}px Arial`;
        context.fillStyle = textColor;
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        // Draw text
        context.fillText('AMMO', canvas.width / 2, canvas.height / 2);

        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true; // Ensure texture updates

        // Material using the texture
        const material = new THREE.MeshStandardMaterial({
            map: texture, // Apply the canvas texture
            metalness: 0.5, // Slightly less metallic
            roughness: 0.5, // Slightly rougher
        });

        const ammoBoxMesh = new THREE.Mesh(geometry, material);
        ammoBoxMesh.name = "AmmoBoxPickup"; // For debugging

        return ammoBoxMesh;
    }
}

export const modelManager = new ModelManager();
