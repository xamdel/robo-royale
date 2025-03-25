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
    console.log(`[WEAPON FACTORY] Loading weapon model for type: ${type}`);
    const config = getWeaponConfig(type);
    if (!config) {
      console.error(`[WEAPON FACTORY] No config found for type: ${type}`);
      return null;
    }

    // Check if we already have this model loaded
    if (this.loadedModels.has(type)) {
      console.log(`[WEAPON FACTORY] Using cached model for type: ${type}`);
      const cachedModel = this.loadedModels.get(type);
      const clonedModel = cachedModel.clone();
      
      // Ensure model clone is set up correctly
      console.log(`[WEAPON FACTORY] Cloned model from cache:`, {
        originalVisible: cachedModel.visible,
        cloneVisible: clonedModel.visible
      });
      
      // Make sure the clone is visible
      clonedModel.visible = true;
      
      return clonedModel;
    }

    try {
      console.log(`[WEAPON FACTORY] Loading new model from path: ${config.modelPath}`);
      const gltf = await this.loadModel(config.modelPath);
      if (!gltf || !gltf.scene) {
        console.error(`[WEAPON FACTORY] Failed to load GLTF for ${type} from ${config.modelPath}`);
        return null;
      }
      
      const model = gltf.scene;
      console.log(`[WEAPON FACTORY] Loaded GLTF scene for ${type}:`, {
        childCount: model.children.length,
        visible: model.visible
      });

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
          child.receiveShadow = true;
          child.visible = true; // Ensure all meshes are visible
          child.material = child.material.clone(); // Clone materials to allow independent modifications
        }

        // Log detailed hierarchy information
        hierarchyLog.push({
          name: child.name,
          type: child.type,
          visible: child.visible,
          position: child.position.toArray(),
          rotation: child.rotation.toArray(),
          scale: child.scale.toArray()
        });
      });

      // Ensure the model is visible
      model.visible = true;

      // Detailed logging of model transforms
      console.log(`[WEAPON FACTORY] Weapon Model ${type} Details:`, {
        originalPosition: originalPosition.toArray(),
        originalRotation: originalRotation.toArray(),
        originalScale: originalScale.toArray(),
        finalPosition: model.position.toArray(),
        finalRotation: model.rotation.toArray(),
        finalScale: model.scale.toArray(),
        modelVisible: model.visible,
        childrenCount: model.children.length,
        hierarchy: hierarchyLog
      });

      // Store the original model for future cloning
      this.loadedModels.set(type, model);

      // Return a clone for this instance
      const clonedModel = model.clone();
      
      // Ensure the clone has visibility set properly
      clonedModel.visible = true;
      clonedModel.traverse(child => {
        if (child.isMesh) {
          child.visible = true;
        }
      });
      
      console.log(`[WEAPON FACTORY] Returning cloned model for ${type}:`, {
        visible: clonedModel.visible,
        childCount: clonedModel.children.length
      });
      
      return clonedModel;
    } catch (error) {
      console.error(`[WEAPON FACTORY] Error loading weapon model for type ${type}:`, error);
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
    console.log(`[WEAPON FACTORY] Creating weapon of type: ${type}, existingModel:`, !!existingModel);
    
    const config = getWeaponConfig(type);
    if (!config) {
      console.error(`[WEAPON FACTORY] Invalid weapon type: ${type}`);
      return null;
    }

    let model;
    if (existingModel) {
      // If we're given an existing model (e.g., from scene pickup), use it
      console.log(`[WEAPON FACTORY] Using existing model for ${type}`);
      model = existingModel;
    } else {
      // Load a new model
      console.log(`[WEAPON FACTORY] Loading new model for ${type}`);
      model = await this.loadWeaponModel(type);
      if (!model) {
        console.error(`[WEAPON FACTORY] Failed to load model for weapon type: ${type}`);
        return null;
      }
      console.log(`[WEAPON FACTORY] Successfully loaded model for ${type}:`, model);
    }

    // Create the weapon instance
    const weapon = new Weapon(type, model, config);
    console.log(`[WEAPON FACTORY] Created weapon instance:`, {
      id: weapon.id,
      type: weapon.type,
      hasModel: !!weapon.model,
      modelVisible: weapon.model ? weapon.model.visible : false,
      modelPosition: weapon.model ? weapon.model.position.toArray() : null
    });
    
    return weapon;
  }

  // Utility method to preload all weapon models
  async preloadWeaponModels() {
    console.log(`[WEAPON FACTORY] Starting preload of all weapon models...`);
    const loadPromises = [];
    
    // Get types from weaponConfigs object
    const weaponTypes = Object.keys(weaponConfigs);
    console.log(`[WEAPON FACTORY] Found ${weaponTypes.length} weapon types to preload:`, weaponTypes);
    
    for (const type of weaponTypes) {
      if (!this.loadedModels.has(type)) {
        console.log(`[WEAPON FACTORY] Scheduling preload of weapon model: ${type}`);
        loadPromises.push(
          this.loadWeaponModel(type)
            .then(model => {
              if (model) {
                console.log(`[WEAPON FACTORY] Successfully preloaded weapon model: ${type}`);
                // Verify model is visible
                console.log(`[WEAPON FACTORY] Preloaded model visibility:`, {
                  type: type,
                  visible: model.visible,
                  childrenCount: model.children.length
                });
                return model;
              } else {
                throw new Error(`Model is null for ${type}`);
              }
            })
            .catch(error => console.error(`[WEAPON FACTORY] Failed to preload weapon model ${type}:`, error))
        );
      } else {
        console.log(`[WEAPON FACTORY] Model for ${type} already loaded, skipping preload`);
      }
    }

    const results = await Promise.all(loadPromises);
    console.log(`[WEAPON FACTORY] All weapon models preloaded:`, {
      requestedModels: loadPromises.length,
      successfullyLoaded: results.filter(Boolean).length
    });
    
    // Log the cached models
    console.log(`[WEAPON FACTORY] Cached models after preload:`, 
      Array.from(this.loadedModels.entries()).map(([type, model]) => ({
        type,
        hasModel: !!model,
        isVisible: model ? model.visible : false
      }))
    );
    
    return results;
  }
}
