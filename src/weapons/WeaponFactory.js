import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Weapon } from './models/Weapon.js';
import { getWeaponConfig, weaponConfigs } from './configs/weapon-configs.js';

export class WeaponFactory {
  constructor() {
    this.loader = new GLTFLoader();
    this.loadedModels = new Map();
  }

  async loadWeaponModel(type) {
    const config = getWeaponConfig(type);
    if (!config) return null;

    // Check if we already have this model loaded
    if (this.loadedModels.has(type)) {
      return this.loadedModels.get(type).clone();
    }

    try {
      const gltf = await this.loadModel(config.modelPath);
      const model = gltf.scene;

      // Capture original transforms
      const originalPosition = new THREE.Vector3();
      const originalRotation = new THREE.Euler();
      const originalScale = new THREE.Vector3();

      originalPosition.copy(model.position);
      originalRotation.copy(model.rotation);
      originalScale.copy(model.scale);

      // Set up model properties
      const hierarchyLog = [];
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.material = child.material.clone(); // Clone materials to allow independent modifications
        }

        // Log detailed hierarchy information
        hierarchyLog.push({
          name: child.name,
          type: child.type,
          position: child.position.toArray(),
          rotation: child.rotation.toArray(),
          scale: child.scale.toArray()
        });
      });

      // Detailed logging of model transforms
      console.log(`[MODEL PROCESSING] Weapon Model ${type} Details:`, {
        originalPosition: originalPosition.toArray(),
        originalRotation: originalRotation.toArray(),
        originalScale: originalScale.toArray(),
        finalPosition: model.position.toArray(),
        finalRotation: model.rotation.toArray(),
        finalScale: model.scale.toArray(),
        hierarchy: hierarchyLog
      });

      // Store the original model for future cloning
      this.loadedModels.set(type, model);

      // Return a clone for this instance
      return model.clone();
    } catch (error) {
      console.error(`Error loading weapon model for type ${type}:`, error);
      return null;
    }
  }

  loadModel(path) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        path,
        (gltf) => resolve(gltf),
        undefined,
        (error) => reject(error)
      );
    });
  }

  async createWeapon(type, existingModel = null) {
    const config = getWeaponConfig(type);
    if (!config) {
      console.error(`Invalid weapon type: ${type}`);
      return null;
    }

    let model;
    if (existingModel) {
      // If we're given an existing model (e.g., from scene pickup), use it
      model = existingModel;
    } else {
      // Load a new model
      model = await this.loadWeaponModel(type);
      if (!model) {
        console.error(`Failed to load model for weapon type: ${type}`);
        return null;
      }
    }

    // Create and return the weapon instance
    return new Weapon(type, model, config);
  }

  // Utility method to preload all weapon models
  async preloadWeaponModels() {
    const loadPromises = [];
    
    // Get types from weaponConfigs object
    for (const type of Object.keys(weaponConfigs)) {
      if (!this.loadedModels.has(type)) {
        loadPromises.push(
          this.loadWeaponModel(type)
            .then(() => console.log(`Preloaded weapon model: ${type}`))
            .catch(error => console.error(`Failed to preload weapon model ${type}:`, error))
        );
      }
    }

    await Promise.all(loadPromises);
    console.log('All weapon models preloaded');
  }
}
