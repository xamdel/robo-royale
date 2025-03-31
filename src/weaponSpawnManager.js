import * as THREE from 'three';
import { weaponSystem } from './weapons'; // Assuming weaponSystem is accessible
import { modelManager } from './ModelManager'; // Import modelManager for ammo box

// Constants
const PICKUP_RADIUS = 2.5;
const ROTATION_SPEED = 0.5;
const VERTICAL_OFFSET = 1.0; // How high above terrain to spawn

export class WeaponSpawnManager {
  constructor(sceneManager, terrainGenerator) {
    if (!sceneManager) throw new Error("SceneManager is required for WeaponSpawnManager");
    if (!terrainGenerator) throw new Error("TerrainGenerator is required for WeaponSpawnManager");

    this.sceneManager = sceneManager;
    this.terrainGenerator = terrainGenerator;
    this.activePickups = new Map(); // Map<string, { model: THREE.Object3D, collider: THREE.Sphere, type: string, weaponType?: string, id: string }>
  }

  // Spawns all pickups based on data received from the server
  async spawnAllPickups(pickupDataList) {
    console.log(`[SpawnManager] Spawning ${pickupDataList.length} pickups from server data...`);
    this.clearExistingPickups(); // Clear any previous pickups first

    for (const pickupData of pickupDataList) {
      if (pickupData.type === 'weapon') {
        await this.spawnWeaponPickup(pickupData);
      } else if (pickupData.type === 'ammo') {
        await this.spawnAmmoBox(pickupData);
      } else {
        console.warn(`[SpawnManager] Unknown pickup type received: ${pickupData.type}`);
      }
    }
    console.log(`[SpawnManager] Finished spawning. Total active pickups: ${this.activePickups.size}`);
  }

  // Spawns a single weapon pickup based on server data
  async spawnWeaponPickup(pickupData) {
    const { id, weaponType, position } = pickupData;
    // Calculate Y using client-side TerrainGenerator
    const terrainY = this.terrainGenerator.getQuantizedHeight(position.x, position.z);
    const spawnPosition = new THREE.Vector3(position.x, terrainY + VERTICAL_OFFSET, position.z);

    try {
      const weaponTemplate = weaponSystem.weaponTemplates.get(weaponType);
      if (!weaponTemplate || !weaponTemplate.model) {
        console.error(`[SpawnManager] Failed to get model template for weapon type: ${weaponType}`);
        return;
      }

      const pickupModel = weaponTemplate.model.clone();
      pickupModel.position.copy(spawnPosition);
      pickupModel.castShadow = true;
      pickupModel.visible = true;
      pickupModel.traverse(child => {
        if (child.isMesh) {
          child.visible = true;
          child.castShadow = true;
        }
      });

      // Add userData for interaction identification
      pickupModel.userData = {
        isPickup: true,
        type: 'weapon',
        weaponType: weaponType,
        id: id
      };

      this.sceneManager.add(pickupModel);

      const collider = new THREE.Sphere(spawnPosition.clone(), PICKUP_RADIUS);

      this.activePickups.set(id, {
        model: pickupModel,
        collider: collider,
        type: 'weapon',
        weaponType: weaponType,
        id: id
      });

      // console.log(`[SpawnManager] Spawned WEAPON pickup: ${weaponType} (ID: ${id}) at`, spawnPosition.toArray());

    } catch (error) {
      console.error(`[SpawnManager] Error spawning WEAPON pickup ${weaponType} (ID: ${id}):`, error);
    }
  }

  // Spawns a single ammo box pickup based on server data
  async spawnAmmoBox(pickupData) {
    const { id, position } = pickupData;
    // Calculate Y using client-side TerrainGenerator
    const terrainY = this.terrainGenerator.getQuantizedHeight(position.x, position.z);
    const spawnPosition = new THREE.Vector3(position.x, terrainY + VERTICAL_OFFSET, position.z);

    try {
      // Use ModelManager to create the ammo box visual
      const ammoBoxModel = await modelManager.createAmmoBox(); // Assuming this method exists
      if (!ammoBoxModel) {
        console.error(`[SpawnManager] Failed to create ammo box model.`);
        return;
      }

      ammoBoxModel.position.copy(spawnPosition);
      ammoBoxModel.castShadow = true;
      ammoBoxModel.visible = true;

      // Add userData for interaction identification
      ammoBoxModel.userData = {
        isPickup: true,
        type: 'ammo',
        id: id
      };

      this.sceneManager.add(ammoBoxModel);

      const collider = new THREE.Sphere(spawnPosition.clone(), PICKUP_RADIUS);

      this.activePickups.set(id, {
        model: ammoBoxModel,
        collider: collider,
        type: 'ammo',
        id: id
      });

      // console.log(`[SpawnManager] Spawned AMMO pickup (ID: ${id}) at`, spawnPosition.toArray());

    } catch (error) {
      console.error(`[SpawnManager] Error spawning AMMO pickup (ID: ${id}):`, error);
    }
  }


  // Method to remove a specific pickup when collected (called locally or via network message)
  removePickup(pickupId) {
    const pickup = this.activePickups.get(pickupId);
    if (pickup) {
      this.sceneManager.remove(pickup.model);
      // Dispose geometry/material if necessary
      if (pickup.model.geometry) pickup.model.geometry.dispose();
      if (pickup.model.material) {
          if (Array.isArray(pickup.model.material)) {
              pickup.model.material.forEach(m => m.dispose());
          } else {
              pickup.model.material.dispose();
          }
      }
      this.activePickups.delete(pickupId);
      console.log(`[SpawnManager] Removed pickup: ${pickupId}`);
    } else {
      // console.warn(`[SpawnManager] Attempted to remove non-existent pickup: ${pickupId}`);
    }
  }

  // Clear all existing pickups (e.g., on game restart or receiving new server list)
  clearExistingPickups() {
    console.log('[SpawnManager] Clearing existing pickups...');
    this.activePickups.forEach(pickup => {
      this.sceneManager.remove(pickup.model);
      // Dispose geometry/material
      if (pickup.model.geometry) pickup.model.geometry.dispose();
      if (pickup.model.material) {
          if (Array.isArray(pickup.model.material)) {
              pickup.model.material.forEach(m => m.dispose());
          } else {
              pickup.model.material.dispose();
          }
      }
    });
    this.activePickups.clear();
    console.log('[SpawnManager] All pickups cleared.');
  }

  // Update loop for animations (like rotation)
  update(deltaTime) {
    this.activePickups.forEach(pickup => {
      pickup.model.rotation.y += ROTATION_SPEED * deltaTime;
      // Collider position is static based on spawn data, no need to update
    });
  }

  // Find the nearest pickup (weapon or ammo) within a certain distance
  findNearestPickup(position, maxDistance) {
    let nearestPickup = null;
    let minDistanceSq = maxDistance * maxDistance;

    for (const [pickupId, pickup] of this.activePickups.entries()) {
      const distanceSq = position.distanceToSquared(pickup.collider.center);
      if (distanceSq < minDistanceSq) {
        minDistanceSq = distanceSq;
        nearestPickup = {
          id: pickupId,
          type: pickup.type, // 'weapon' or 'ammo'
          weaponType: pickup.weaponType, // Only present for weapons
          model: pickup.model,
          distance: Math.sqrt(distanceSq)
        };
      }
    }
    return nearestPickup;
  }

  // Helper to get all pickup models for raycasting
  getAllPickupModels() {
    return Array.from(this.activePickups.values()).map(pickup => pickup.model);
  }

  // Helper to get pickup data by ID
  getPickupById(pickupId) {
    const pickup = this.activePickups.get(pickupId);
    if (pickup) {
      // Return a copy or relevant data to avoid direct modification
      return {
        id: pickup.id,
        type: pickup.type,
        weaponType: pickup.weaponType,
        model: pickup.model, // Pass the model reference for position checks
        // Attempt to get config from weaponSystem templates
        config: pickup.weaponType ? (weaponSystem.weaponTemplates.get(pickup.weaponType)?.config || {}) : {}
      };
    }
    return null;
  }

  // Note: Spawning dropped weapons is now handled by receiving 'droppedWeaponCreated' from server
  // and calling spawnWeaponPickup with the server-provided data (which includes only X, Z initially).
  // spawnWeaponPickup will calculate the correct Y.
}
