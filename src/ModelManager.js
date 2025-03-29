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
}

export const modelManager = new ModelManager();
