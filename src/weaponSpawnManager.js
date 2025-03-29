import * as THREE from 'three';
import { weaponSystem } from './weapons'; // Assuming weaponSystem is accessible

export class WeaponSpawnManager {
  constructor(sceneManager, terrainGenerator) {
    if (!sceneManager) throw new Error("SceneManager is required for WeaponSpawnManager");
    if (!terrainGenerator) throw new Error("TerrainGenerator is required for WeaponSpawnManager");

    this.sceneManager = sceneManager;
    this.terrainGenerator = terrainGenerator;
    this.spawnPoints = {
      cannon: [
        { x: 0, z: -10 },    // Original position
        { x: 50, z: 50 },
        { x: -50, z: 50 },
        { x: 50, z: -50 },
        { x: -50, z: -50 },
        { x: 100, z: 0 },
        { x: -100, z: 0 },
        { x: 0, z: 100 },
        { x: 0, z: -100 },
      ],
      rocketLauncher: [
        { x: 10, z: -10 },   // Original position
        { x: -30, z: 30 },
        { x: 60, z: -20 },
        { x: -60, z: -60 },
        { x: 30, z: -70 },
        { x: -70, z: 80 },
        { x: 80, z: 80 },
        { x: -80, z: -20 },
      ]
      // Add more weapon types and points as needed
    };
    this.activePickups = new Map(); // Map<string, { model: THREE.Object3D, collider: THREE.Sphere, type: string }>
    this.pickupRadius = 2.5; // Standard pickup radius
    this.rotationSpeed = 0.5; // Rotation speed for pickups
  }

  async spawnWeapons() {
    console.log('[WeaponSpawnManager] Spawning weapon pickups...');
    this.clearExistingPickups(); // Clear any previous pickups first

    for (const [weaponType, points] of Object.entries(this.spawnPoints)) {
      console.log(`[WeaponSpawnManager] Spawning ${weaponType} at ${points.length} locations.`);
      for (const point of points) {
        // Use the correct method: getQuantizedHeight
        const terrainY = this.terrainGenerator.getQuantizedHeight(point.x, point.z);
        const spawnPosition = new THREE.Vector3(point.x, terrainY + 1, point.z); // Place slightly above terrain

        try {
          // Use the weapon factory to get the model template
          const weaponTemplate = weaponSystem.weaponTemplates.get(weaponType);
          if (!weaponTemplate || !weaponTemplate.model) {
            console.error(`[WeaponSpawnManager] Failed to get model template for ${weaponType}`);
            continue;
          }

          // Clone the model for the pickup
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

          this.sceneManager.add(pickupModel);

          // Create collider
          const collider = new THREE.Sphere(spawnPosition.clone(), this.pickupRadius);

          // Store the pickup information using a unique ID (e.g., type + position)
          const pickupId = `${weaponType}_${point.x}_${point.z}`;
          this.activePickups.set(pickupId, {
            model: pickupModel,
            collider: collider,
            type: weaponType,
            id: pickupId // Store the ID for easy removal
          });

          console.log(`[WeaponSpawnManager] Spawned ${weaponType} pickup at`, spawnPosition.toArray());

        } catch (error) {
          console.error(`[WeaponSpawnManager] Error spawning ${weaponType} at (${point.x}, ${point.z}):`, error);
        }
      }
    }
    console.log(`[WeaponSpawnManager] Finished spawning. Total pickups: ${this.activePickups.size}`);
  }

  // Method to remove a specific pickup when collected
  removePickup(pickupId) {
    const pickup = this.activePickups.get(pickupId);
    if (pickup) {
      this.sceneManager.remove(pickup.model);
      this.activePickups.delete(pickupId);
      console.log(`[WeaponSpawnManager] Removed pickup: ${pickupId}`);
      // TODO: Implement respawn logic if needed
    }
  }

  // Clear all existing pickups (e.g., on game restart or level change)
  clearExistingPickups() {
    console.log('[WeaponSpawnManager] Clearing existing pickups...');
    this.activePickups.forEach(pickup => {
      this.sceneManager.remove(pickup.model);
    });
    this.activePickups.clear();
    console.log('[WeaponSpawnManager] All pickups cleared.');
  }

  // Update loop for animations (like rotation)
  update(deltaTime) {
    this.activePickups.forEach(pickup => {
      pickup.model.rotation.y += this.rotationSpeed * deltaTime;
      // Update collider position if needed (though static spawns might not require this)
      // pickup.collider.center.copy(pickup.model.position);
    });
  }

  // Check for collisions between player and pickups
  checkCollisions(playerPosition) {
    const playerSphere = new THREE.Sphere(playerPosition, 1.5); // Approximate player radius

    for (const [pickupId, pickup] of this.activePickups.entries()) {
      if (pickup.collider.intersectsSphere(playerSphere)) {
        console.log(`[WeaponSpawnManager] Collision detected with ${pickup.type} pickup: ${pickupId}`);
        return pickup; // Return the collided pickup info
      }
    }
    return null; // No collision
  }

  // Spawn a single weapon pickup at a specific world position (e.g., when dropped by a player)
  // Accepts an optional serverId to use for tracking
  async spawnDroppedWeapon(weaponType, position, serverId = null) {
    console.log(`[WeaponSpawnManager] Spawning dropped weapon: ${weaponType} at`, position.toArray(), `Server ID: ${serverId}`);

    // Adjust Y position slightly to be above the ground/death location
    const spawnPosition = position.clone();
    spawnPosition.y += 1.0; // Adjust height offset as needed

    try {
      // Use the weapon factory to get the model template
      const weaponTemplate = weaponSystem.weaponTemplates.get(weaponType);
      if (!weaponTemplate || !weaponTemplate.model) {
        console.error(`[WeaponSpawnManager] Failed to get model template for dropped ${weaponType}`);
        return null;
      }

      // Clone the model for the pickup
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

      this.sceneManager.add(pickupModel);

      // Create collider
      const collider = new THREE.Sphere(spawnPosition.clone(), this.pickupRadius);

      // Use the server-provided ID if available, otherwise generate a client-side one
      const pickupId = serverId || `${weaponType}_dropped_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      // Check if a pickup with this ID already exists (e.g., duplicate network message)
      if (this.activePickups.has(pickupId)) {
          console.warn(`[WeaponSpawnManager] Pickup with ID ${pickupId} already exists. Ignoring spawn request.`);
          // Potentially remove the old one and replace? Or just ignore.
          this.sceneManager.remove(pickupModel); // Clean up the unused cloned model
          return null; 
      }

      const pickupData = {
        model: pickupModel,
        collider: collider,
        type: weaponType,
        id: pickupId
      };
      this.activePickups.set(pickupId, pickupData);

      console.log(`[WeaponSpawnManager] Spawned dropped ${weaponType} pickup with ID: ${pickupId}`);
      return pickupData; // Return the created pickup data

    } catch (error) {
      console.error(`[WeaponSpawnManager] Error spawning dropped ${weaponType} at`, position.toArray(), error);
      return null;
    }
  }
}
