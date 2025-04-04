import * as THREE from 'three';
import { WeaponFactory } from './WeaponFactory.js';
import { MountManager } from './MountManager.js';
import { Network } from '../network.js';
import { MobileControlsManager } from '../mobileControls/MobileControlsManager.js'; // Import MobileControlsManager
import { SceneManager } from '../scene.js'; // Import SceneManager

export class WeaponSystem {
  constructor() {
    this.weaponFactory = new WeaponFactory();
    this.mountManager = new MountManager();
    this.activeWeapons = new Map(); // Track all active weapons by ID
    this.weaponTemplates = new Map(); // Track weapon templates by type
    this.turretProjectiles = new Map(); // Track active turret projectiles by server ID

    // Firing state
    this.isFiringPrimary = false;
    this.isFiringSecondary = false;

    // Swap button state tracking for mobile
    this.wasSwapPrimaryPressed = false;
    this.wasSwapSecondaryPressed = false;

    this.setupInputListeners();
  }

  async init(playerModel) {
    // console.log('Initializing weapon system...');

    // Initialize mount points on player model
    const mountsInitialized = this.mountManager.initMounts(playerModel);
    if (!mountsInitialized) {
      console.error('Failed to initialize weapon mounts');
      return false;
    }

    // Preload weapon models
    await this.weaponFactory.preloadWeaponModels();

    // Create weapon templates for all configured weapon types
    await this.createWeaponTemplates();

    // // console.log('Weapon system initialized');
    return true;
  }

  async createWeaponTemplates() {
    const { weaponConfigs } = await import('./configs/weapon-configs.js');

    for (const [weaponType, config] of Object.entries(weaponConfigs)) {
      const weapon = await this.weaponFactory.createWeapon(weaponType);
      if (weapon) {
        this.weaponTemplates.set(weaponType, weapon);
        // console.log(`Created weapon template for ${weaponType}`);
      }
    }
  }

  setupInputListeners() {
    // Track selected weapon indexes
    this.selectedPrimaryIndex = 0;
    this.selectedSecondaryIndex = 0;

    // Mouse controls for primary weapons (arms)
    document.addEventListener('mousedown', (event) => {
      if (event.button === 0) { // Left click
        this.isFiringPrimary = true;
        const weapon = this.getSelectedWeapon('primary');
        if (weapon?.type === 'gatling') {
          weapon.startFiringSequence();
        }
        // Non-gatling firing is now handled in the update loop
      }
    });
    document.addEventListener('mouseup', (event) => {
      if (event.button === 0) { // Left click release
        this.isFiringPrimary = false;
        const weapon = this.getSelectedWeapon('primary');
        if (weapon?.type === 'gatling') {
          weapon.stopFiringSequence();
        }
      }
    });

    // Keyboard controls for secondary weapons (shoulders)
    document.addEventListener('keydown', (event) => {
      // Prevent repeated firing from keydown event itself if held
      if (event.repeat) return;

      switch (event.code) {
        case 'KeyR':
          this.isFiringSecondary = true;
          const weapon = this.getSelectedWeapon('secondary');
          if (weapon?.type === 'gatling') {
            weapon.startFiringSequence();
          }
          // Non-gatling firing is now handled in the update loop
          break;
        case 'Tab':
          event.preventDefault(); // Prevent tab from changing focus
          this.cycleSecondaryWeapon();
          break;
      }
    });
    document.addEventListener('keyup', (event) => {
      switch (event.code) {
        case 'KeyR':
          this.isFiringSecondary = false;
          const weapon = this.getSelectedWeapon('secondary');
          if (weapon?.type === 'gatling') {
            weapon.stopFiringSequence();
          }
          break;
      }
    });

    // Mouse wheel for cycling primary weapons
    document.addEventListener('wheel', (event) => {
      if (event.deltaY < 0) {
        this.cyclePrimaryWeapon('prev');
      } else {
        this.cyclePrimaryWeapon('next');
      }
    });
  }

  async pickupWeapon(playerModel, weaponObject, weaponType) {
    // Create weapon instance
    const weapon = await this.weaponFactory.createWeapon(weaponType, weaponObject);
    if (!weapon) return false;

    // Get weapon config
    const config = weapon.config;
    if (!config) return false;

    // Find best available mount point
    const mountPoint = this.mountManager.findBestMountPoint(weaponType, config.preferredMounts);
    if (!mountPoint) {
      console.warn('No available mount points for weapon');
      return false;
    }

    // Attach weapon to mount
    const success = mountPoint.attachWeapon(weapon);
    if (success) {
      this.activeWeapons.set(weapon.id, weapon);

      // Apply player color
      const localPlayerColor = window.Game?.playerColor?.primary || '#00ffff'; // Get stored color
      if (typeof weapon.applyColor === 'function') {
        weapon.applyColor(localPlayerColor);
      }

      // Determine mount type for appropriate notification
      const mountType = mountPoint.config.mountType;
      const displayName = weapon.config.displayName || weapon.type;

      // Show weapon pickup message in HUD
      if (window.HUD) {
        window.HUD.showAlert(`${mountType.toUpperCase()}: ${displayName.toUpperCase()} EQUIPPED`, "info");
        window.HUD.addMessage(`${displayName} equipped as ${mountType} weapon. Ammo: ${weapon.ammo}/${weapon.maxAmmo}`);

        // Update HUD display for this weapon type
        if (window.HUD.updateWeaponDisplay) {
          window.HUD.updateWeaponDisplay(mountType);
        }
      }

      // Notify server about weapon pickup (ensure socketName is sent)
      Network.sendWeaponPickup({
        weaponId: weapon.id,
        weaponType: weaponType,
        socketName: mountPoint.socketName // Correctly sending socketName here too
      });
    }

    return success;
  }

  // New method for handling 'E' key press pickup
  async tryPickupAndAttach(pickupInfo) {
    // Use pickupInfo.weaponType for the specific weapon, pickupInfo.type is just 'weapon'
    console.log(`[WEAPON SYSTEM] Attempting pickup & attach for: ${pickupInfo.weaponType} (ID: ${pickupInfo.id})`);
    const weaponType = pickupInfo.weaponType; // Correctly use weaponType
    const pickupId = pickupInfo.id;

    // Define mount priority
    const mountPriority = ['rightArm', 'rightShoulder', 'leftArm', 'leftShoulder'];

    for (const mountId of mountPriority) {
      const mount = this.mountManager.getMountPoint(mountId);

      // Check if mount exists and is available
      if (mount && !mount.hasWeapon()) {
        console.log(`[WEAPON SYSTEM] Found available mount: ${mountId}`);

        // Create a new weapon instance for this pickup
        const weapon = await this.weaponFactory.createWeapon(weaponType);
        if (!weapon) {
          console.error(`[WEAPON SYSTEM] Failed to create weapon instance for type: ${weaponType}`);
          continue; // Try next mount if creation fails
        }

        // Attempt to attach the weapon
        const success = mount.attachWeapon(weapon);
        if (success) {
          console.log(`[WEAPON SYSTEM] Successfully attached ${weaponType} to ${mountId}`);
          this.activeWeapons.set(weapon.id, weapon);

          // Apply player color
          const localPlayerColor = window.Game?.localPlayerPrimaryColor || '#00ffff'; // Use stored local color
          if (typeof weapon.applyColor === 'function') {
            // console.log(`[WEAPON SYSTEM] Applying color ${localPlayerColor} to attached weapon ${weapon.type}`); // Less verbose log
            weapon.applyColor(localPlayerColor);
          }

          // Update HUD
          const mountType = mount.config.mountType;
          const displayName = weapon.config.displayName || weapon.type;
          if (window.HUD) {
            window.HUD.showAlert(`${mountType.toUpperCase()}: ${displayName.toUpperCase()} EQUIPPED`, "info");
            window.HUD.addMessage(`${displayName} equipped to ${mount.config.displayName}. Ammo: ${weapon.ammo}/${weapon.maxAmmo}`);
            if (window.HUD.updateWeaponDisplay) {
              window.HUD.updateWeaponDisplay(mountType);
            }
          }

          // Notify server about the weapon pickup (attaching to specific mount)
          console.log(`[WEAPON SYSTEM] Sending weapon pickup network message: WeaponID=${weapon.id}, Type=${weaponType}, SocketName=${mount.socketName}`);
          Network.sendWeaponPickup({
            weaponId: weapon.id,
            weaponType: weaponType,
            socketName: mount.socketName // Send socketName (bone name)
          });

          // Remove the pickup item from the world via WeaponSpawnManager
          if (window.Game && window.Game.weaponSpawnManager) {
            window.Game.weaponSpawnManager.removePickup(pickupId); // Remove locally regardless
            console.log(`[WEAPON SYSTEM] Removed pickup item ${pickupId} from world.`);

            // Only notify server if it's a dropped item (server tracks these - starts with 'pickup_')
            if (pickupId && pickupId.startsWith('pickup_')) {
                // console.log(`[WEAPON SYSTEM] Sending pickup collected network message for dropped item ID: ${pickupId}`); // Removed log
                Network.sendPickupCollected({ pickupId: pickupId });
            } else {
                // console.log(`[WEAPON SYSTEM] Initial spawn item ${pickupId} collected via quick pickup, no server notification needed.`); // Removed log
            }
          } else {
             console.error("[WEAPON SYSTEM] Cannot remove pickup or notify server: Game.weaponSpawnManager not found!");
          }


          return true; // Attachment successful, exit loop
        } else {
          console.warn(`[WEAPON SYSTEM] Failed to attach ${weaponType} to mount ${mountId}, trying next.`);
          // If attach failed, clean up the created weapon instance? Or let GC handle it?
          // For now, let GC handle it.
        }
      } else {
         // console.log(`[WEAPON SYSTEM] Mount ${mountId} not found or already occupied.`);
      }
    }

    // If loop completes without attaching
    console.log(`[WEAPON SYSTEM] No available mount points found for ${weaponType} according to priority.`);
    if (window.HUD) {
        window.HUD.showAlert("NO SUITABLE MOUNT POINT AVAILABLE", "warning");
    }
    return false;
  }

  // Detach weapon from a mount and drop it as a pickup
  async detachAndDropWeapon(mountId) {
    const mount = this.mountManager.getMountPoint(mountId);
    if (!mount || !mount.hasWeapon()) {
      console.warn(`[WEAPON SYSTEM] Cannot detach/drop weapon from mount ${mountId}: Mount not found or empty.`);
      return null; // Return null if no weapon to drop
    }

    const weaponToDrop = mount.getWeapon();
    const weaponType = weaponToDrop.type;
    const weaponId = weaponToDrop.id; // Get ID before detaching

    console.log(`[WEAPON SYSTEM] Detaching and dropping ${weaponType} (ID: ${weaponId}) from mount ${mountId}`);

    // Get position *before* detaching
    const dropPosition = mount.getWorldPosition(); // Use mount's position as drop origin

    // Detach the weapon from the mount
    mount.detachWeapon(); // This also clears weapon.mountPoint

    // Deactivate and remove from active list
    weaponToDrop.deactivate();
    this.activeWeapons.delete(weaponId);
    console.log(`[WEAPON SYSTEM] Weapon ${weaponId} removed from active list.`);

    // Spawn the dropped weapon pickup via WeaponSpawnManager - REMOVED LOCAL SPAWN
    // The server will handle creating the item state and broadcasting 'droppedWeaponCreated'
    // The client's network handler for 'droppedWeaponCreated' will spawn the visual pickup.
    if (window.Game && window.Game.weaponSpawnManager) {
      // Spawn slightly above the mount point position
      dropPosition.y += 0.5; // Adjust offset as needed
      // We don't await this, let it happen in the background
      // window.Game.weaponSpawnManager.spawnDroppedWeapon(weaponType, dropPosition); // REMOVED
      // console.log(`[WEAPON SYSTEM] Instructed WeaponSpawnManager to spawn dropped ${weaponType} at`, dropPosition.toArray()); // REMOVED

      // Notify the server about the weapon drop (server will create the item and broadcast)
      Network.sendWeaponDrop({
        mountId: mountId, // Let server know which mount was cleared
        weaponType: weaponType,
        position: dropPosition
      });
      console.log(`[WEAPON SYSTEM] Sent weapon drop network message for mount ${mountId}.`);

    } else {
      console.error("[WEAPON SYSTEM] Cannot spawn dropped weapon: Game.weaponSpawnManager not found!");
    }

    // Update HUD for the mount type that just became empty
    if (window.HUD && window.HUD.updateWeaponDisplay) {
        window.HUD.updateWeaponDisplay(mount.config.mountType);
    }


    return weaponToDrop; // Return the dropped weapon instance if needed
  }

  // New method for attaching a weapon to a specific mount (used by context menu)
  async attachToSpecificMount(weaponType, mountId) {
    console.log(`[WEAPON SYSTEM] Attempting to attach ${weaponType} to specific mount: ${mountId}`);
    const mount = this.mountManager.getMountPoint(mountId);

    // Check if mount exists first
    if (!mount) {
        console.warn(`[WEAPON SYSTEM] Specific mount ${mountId} not found.`);
        return false; // Mount doesn't exist
    }

    // Check if the mount is occupied
    if (mount.hasWeapon()) {
        console.log(`[WEAPON SYSTEM] Mount ${mountId} is occupied. Detaching existing weapon first.`);
        // Detach and drop the currently equipped weapon
        // We need detachAndDropWeapon to be async if we want to ensure it finishes before attaching
        // For now, assume it's synchronous or fire-and-forget for simplicity,
        // but ideally, this might need async/await if dropping involves async operations.
        const droppedWeapon = await this.detachAndDropWeapon(mountId); // Use await if detachAndDropWeapon becomes async
        if (!droppedWeapon) {
             console.error(`[WEAPON SYSTEM] Failed to detach existing weapon from mount ${mountId}. Aborting attachment.`);
             return false; // Failed to detach, cannot proceed
        }
        console.log(`[WEAPON SYSTEM] Existing weapon detached from ${mountId}. Proceeding with attachment.`);
    } else {
         console.log(`[WEAPON SYSTEM] Mount ${mountId} is available.`);
    }

    // Now that the mount is guaranteed to be empty (or detachment failed), proceed with attachment
    // Create a new weapon instance
      const weapon = await this.weaponFactory.createWeapon(weaponType);
      if (!weapon) {
        console.error(`[WEAPON SYSTEM] Failed to create weapon instance for type: ${weaponType}`);
        return false; // Weapon creation failed
      }

      // Attempt to attach the weapon
      const success = mount.attachWeapon(weapon);
      if (success) {
        console.log(`[WEAPON SYSTEM] Successfully attached ${weaponType} to specific mount ${mountId}`);
        this.activeWeapons.set(weapon.id, weapon);

        // Apply player color
        const localPlayerColor = window.Game?.localPlayerPrimaryColor || '#00ffff'; // Use stored local color
        if (typeof weapon.applyColor === 'function') {
          // console.log(`[WEAPON SYSTEM] Applying color ${localPlayerColor} to attached weapon ${weapon.type}`); // Less verbose log
          weapon.applyColor(localPlayerColor);
        }

        // Update HUD
        const mountType = mount.config.mountType;
        const displayName = weapon.config.displayName || weapon.type;
        if (window.HUD) {
          window.HUD.showAlert(`${mountType.toUpperCase()}: ${displayName.toUpperCase()} EQUIPPED`, "info");
          window.HUD.addMessage(`${displayName} equipped to ${mount.config.displayName}. Ammo: ${weapon.ammo}/${weapon.maxAmmo}`);
          if (window.HUD.updateWeaponDisplay) {
            window.HUD.updateWeaponDisplay(mountType);
          }
        }

        // Notify server about the weapon pickup (attaching to specific mount)
        console.log(`[WEAPON SYSTEM] Sending weapon pickup network message: WeaponID=${weapon.id}, Type=${weaponType}, SocketName=${mount.socketName}`);
        Network.sendWeaponPickup({
          weaponId: weapon.id,
          weaponType: weaponType,
          socketName: mount.socketName // Send socketName (bone name)
        });

        // Note: The pickup removal and server notification for collection
        // should happen in the calling function (Game.handlePickupKeyUp)
        // after this method returns successfully.

        return true; // Attachment successful
      } else {
        console.warn(`[WEAPON SYSTEM] Failed to attach ${weaponType} to specific mount ${mountId} after ensuring it was empty.`);
        return false; // Attachment failed
      }
    // Removed the 'else' block that checked for occupied mount, as it's handled above now.
  }

  fireWeaponByControl(controlKey) {
    // console.log(`[WEAPON SYSTEM] Fire attempt for control key: ${controlKey}`);

    // Get all mounts for this control key
    const mounts = this.mountManager.getAllMounts().filter(mount => mount.config.controlKey === controlKey);
    if (mounts.length === 0) {
      // console.log(`[WEAPON SYSTEM] No mounts found for control key: ${controlKey}`);
      return false;
    }

    // Debug log all mount points for this control key
    // console.log(`[WEAPON SYSTEM] Found ${mounts.length} mounts for control key ${controlKey}:`,
    //   mounts.map(m => ({
    //     id: m.id,
    //     socketName: m.socketName,
    //     hasWeapon: m.hasWeapon(),
    //     weaponType: m.hasWeapon() ? m.getWeapon().type : 'none'
    //   }))
    // );

    // Filter by mount type
    const mountType = mounts[0].config.mountType; // Get mount type from first mount
    const selectedIndex = mountType === 'primary' ? this.selectedPrimaryIndex : this.selectedSecondaryIndex;

    // Only use mounts that have weapons
    const mountsWithWeapons = mounts.filter(mount => mount.hasWeapon());
    if (mountsWithWeapons.length === 0) {
      // console.log(`[WEAPON SYSTEM] No armed mounts found for control key: ${controlKey}`);
      return false;
    }

    // Select the active mount based on selection index (clamped to valid range)
    const activeIndex = Math.min(selectedIndex, mountsWithWeapons.length - 1);
    const activeMount = mountsWithWeapons[activeIndex];

    // console.log(`[WEAPON SYSTEM] Firing mount ${activeMount.id} for control key: ${controlKey}`);

    // Make sure the weapon is visible before firing
    const weapon = activeMount.getWeapon();
    if (weapon && weapon.model) {
      weapon.model.visible = true;
      weapon.model.traverse(child => {
        if (child.isMesh) {
          child.visible = true;
        }
      });
    }

    const result = activeMount.fire();
    // console.log(`[WEAPON SYSTEM] Fire result for ${activeMount.id}: ${result}`);
    return result;
  }

  getWeaponById(weaponId) {
    return this.activeWeapons.get(weaponId);
  }

  removeWeapon(weaponId) {
    const weapon = this.activeWeapons.get(weaponId);
    if (weapon) {
      // Find the mount point that has this weapon
      const mount = this.mountManager.getAllMounts().find(m => m.getWeapon()?.id === weaponId);
      if (mount) {
        mount.detachWeapon();
      }
      weapon.deactivate();
      this.activeWeapons.delete(weaponId);
    }
  }

  cyclePrimaryWeapon(direction = 'next') {
    const primaryMounts = this.mountManager.getMountsByType('primary');
    const mountsWithWeapons = primaryMounts.filter(mount => mount.hasWeapon());

    if (mountsWithWeapons.length <= 1) return; // Nothing to cycle

    // Stop firing sequence of the current weapon if it's a gatling
    const currentWeapon = this.getSelectedWeapon('primary');
    if (currentWeapon?.type === 'gatling') {
      currentWeapon.stopFiringSequence();
    }

    if (direction === 'next') {
      this.selectedPrimaryIndex = (this.selectedPrimaryIndex + 1) % mountsWithWeapons.length;
    } else {
      this.selectedPrimaryIndex = (this.selectedPrimaryIndex - 1 + mountsWithWeapons.length) % mountsWithWeapons.length;
    }

    // Update HUD to show the newly selected weapon
    if (window.HUD) {
      const weapon = mountsWithWeapons[this.selectedPrimaryIndex].getWeapon();
      const displayName = weapon.config.displayName || weapon.type;
      window.HUD.showAlert(`PRIMARY: ${displayName}`, "info");
      window.HUD.updateWeaponDisplay('primary');
    }
  }

  cycleSecondaryWeapon() {
    const secondaryMounts = this.mountManager.getMountsByType('secondary');
    const mountsWithWeapons = secondaryMounts.filter(mount => mount.hasWeapon());

    if (mountsWithWeapons.length <= 1) return; // Nothing to cycle

    // Stop firing sequence of the current weapon if it's a gatling
    const currentWeapon = this.getSelectedWeapon('secondary');
    if (currentWeapon?.type === 'gatling') {
      currentWeapon.stopFiringSequence();
    }

    this.selectedSecondaryIndex = (this.selectedSecondaryIndex + 1) % mountsWithWeapons.length;

    // Update HUD to show the newly selected weapon
    if (window.HUD) {
      const weapon = mountsWithWeapons[this.selectedSecondaryIndex].getWeapon();
      const displayName = weapon.config.displayName || weapon.type;
      window.HUD.showAlert(`SECONDARY: ${displayName}`, "info");
      window.HUD.updateWeaponDisplay('secondary');
    }
  }

  // Get all weapons currently equipped by the player
  getPlayerEquippedWeapons() {
    const equippedWeapons = [];
    const mounts = this.mountManager.getAllMounts();
    for (const mount of mounts) {
      const weapon = mount.getWeapon();
      if (weapon) {
        // Return weapon type and maybe other relevant info if needed later
        equippedWeapons.push({ type: weapon.type, id: weapon.id });
      }
    }
    // console.log('[WeaponSystem] Player equipped weapons:', equippedWeapons);
    return equippedWeapons;
  }

  // Remove all weapons currently equipped by the player
  removeAllPlayerWeapons() {
    // console.log('[WeaponSystem] Removing all player weapons...');
    const mounts = this.mountManager.getAllMounts();
    let removedCount = 0;
    for (const mount of mounts) {
      const weapon = mount.getWeapon();
      if (weapon) {
        const weaponId = weapon.id;
        mount.detachWeapon(); // Detach from the mount point visually
        weapon.deactivate(); // Perform any weapon-specific cleanup
        this.activeWeapons.delete(weaponId); // Remove from active tracking
        removedCount++;
        // console.log(`[WeaponSystem] Removed weapon ${weaponId} from mount ${mount.id}`);
      }
    }
    // console.log(`[WeaponSystem] Finished removing weapons. Total removed: ${removedCount}`);
    // Optionally update HUD if needed
    if (window.HUD && window.HUD.updateWeaponDisplay) {
        window.HUD.updateWeaponDisplay('primary');
        window.HUD.updateWeaponDisplay('secondary');
    }
  }

  // Refills ammo for all currently equipped weapons to their maximum capacity
  refillAllAmmo() {
    console.log("[WeaponSystem] Refilling ammo for all equipped weapons...");
    const mounts = this.mountManager.getAllMounts();
    let ammoRefilled = false;

    for (const mount of mounts) {
      const weapon = mount.getWeapon();
      if (weapon && weapon.ammo < weapon.maxAmmo) {
        console.log(`[WeaponSystem] Refilling ${weapon.type} (ID: ${weapon.id}) from ${weapon.ammo} to ${weapon.maxAmmo}`);
        weapon.ammo = weapon.maxAmmo;
        ammoRefilled = true;
        // Update HUD for this weapon's mount type
        if (window.HUD && window.HUD.updateWeaponDisplay) {
          window.HUD.updateWeaponDisplay(mount.config.mountType);
        }
      }
    }

    if (ammoRefilled) {
      if (window.HUD) window.HUD.showAlert("AMMO REFILLED", "success");
    } else {
      if (window.HUD) window.HUD.showAlert("ALL WEAPONS FULL AMMO", "info");
    }
  }

  // Get the currently selected weapon of a specific type (primary/secondary)
  getSelectedWeapon(mountType) {
    const mounts = this.mountManager.getMountsByType(mountType);
    const mountsWithWeapons = mounts.filter(mount => mount.hasWeapon());

    if (mountsWithWeapons.length === 0) return null;

    const selectedIndex = mountType === 'primary' ? this.selectedPrimaryIndex : this.selectedSecondaryIndex;
    const activeIndex = Math.min(selectedIndex, mountsWithWeapons.length - 1);

    return mountsWithWeapons[activeIndex].getWeapon();
  }

  // Get the next weapon in cycle (for HUD display)
  getNextWeapon(mountType) {
    const mounts = this.mountManager.getMountsByType(mountType);
    const mountsWithWeapons = mounts.filter(mount => mount.hasWeapon());

    if (mountsWithWeapons.length <= 1) return null;

    const selectedIndex = mountType === 'primary' ? this.selectedPrimaryIndex : this.selectedSecondaryIndex;
    const nextIndex = (selectedIndex + 1) % mountsWithWeapons.length;

    return mountsWithWeapons[nextIndex].getWeapon();
  }

  handleRemoteWeaponPickup(data) {
    const { weaponId, weaponType, mountId } = data;

    // Find the mount point
    const mountPoint = this.mountManager.getMountPoint(mountId);
    if (!mountPoint) return;

    // Create the weapon
    this.weaponFactory.createWeapon(weaponType).then(weapon => {
      if (weapon) {
        weapon.id = weaponId; // Use the server-assigned ID
        mountPoint.attachWeapon(weapon);
        this.activeWeapons.set(weaponId, weapon);
      }
    });
  }

  handleRemoteShot(data) {
    // console.log(`[WeaponSystem] Handling remote shot for weapon type: ${data.weaponType}`);

    // Try to find weapon template for this type
    const weapon = this.weaponTemplates.get(data.weaponType);

    if (weapon) {
      const position = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
      const direction = new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z);
      // console.log(`[WeaponSystem] Creating projectile at`, position, 'direction', direction);
      const projectile = weapon.createProjectile(position, direction);
      return projectile;
    } else {
      console.error(`[WeaponSystem] Could not find weapon template for type: ${data.weaponType}`);
      return null;
    }
  }

  // Creates the visual representation for a turret projectile
  handleTurretShot(data) {
    console.log(`[WeaponSystem] Handling turret shot visual creation: ID=${data.id}`);
    const { id, position, direction, radius = 2, speed = 250 } = data; // Use defaults matching server config

    // Create the capsule geometry
    // CapsuleGeometry(radius, length, capSegments, radialSegments)
    // Let's make the length proportional to the radius, e.g., 4 times the radius
    const length = radius * 4;
    const geometry = new THREE.CapsuleGeometry(radius, length, 4, 8); // Low poly capsule

    // Create a simple material (e.g., bright yellow)
    const material = new THREE.MeshBasicMaterial({ color: '#555555' })

    // Create the mesh
    const projectileMesh = new THREE.Mesh(geometry, material);

    // Set initial position
    projectileMesh.position.set(position.x, position.y, position.z);

    // Orient the capsule to face the direction of travel
    // Create a quaternion representing the rotation from default (Y-up) to the direction vector
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0); // Default capsule orientation axis
    const dirVec = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    quaternion.setFromUnitVectors(up, dirVec);
    projectileMesh.quaternion.copy(quaternion);

    // Add to scene using imported SceneManager
    if (SceneManager) {
      SceneManager.add(projectileMesh);
    } else {
      // This case should ideally not happen if imports are correct
      console.error("[WeaponSystem] SceneManager import failed, cannot add turret projectile mesh.");
      return; // Don't track if we can't add it
    }

    // Store projectile data for update loop
    const projectileData = {
      mesh: projectileMesh,
      direction: dirVec,
      speed: speed,
      startTime: Date.now(),
      maxLifetime: 10000, // Match server config
      serverId: id // Store the server ID for removal later
    };
    this.turretProjectiles.set(id, projectileData);
    console.log(`[WeaponSystem] Added turret projectile ${id} to scene and tracking.`);

    // Start following the projectile if the shooter is the local player
    if (data.ownerId === Network.socket?.id && SceneManager?.startFollowingProjectile) {
      SceneManager.startFollowingProjectile(projectileData);
    }
  }

  handleHit(data) {
    const weapon = this.activeWeapons.get(data.weaponId);
    if (weapon) {
      const position = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
      weapon.handleHit(position);
    }
  }

  update(deltaTime) {
    // Update all mount points (which in turn update their weapons)
    this.mountManager.update(deltaTime);

    // Handle continuous firing for non-gatling weapons
    if (this.isFiringPrimary) {
      const primaryWeapon = this.getSelectedWeapon('primary');
      if (primaryWeapon && primaryWeapon.type !== 'gatling') {
        this.fireWeaponByControl('mouse0'); // Attempt to fire primary
      }
    }
    if (this.isFiringSecondary) {
      const secondaryWeapon = this.getSelectedWeapon('secondary');
      if (secondaryWeapon && secondaryWeapon.type !== 'gatling') {
        this.fireWeaponByControl('keyR'); // Attempt to fire secondary
      }
    }

    // Update weapon templates to handle remote projectiles
    for (const weapon of this.weaponTemplates.values()) {
      weapon.update(deltaTime);
    }

    // Update turret projectiles
    const now = Date.now();
    for (const [id, projectileData] of this.turretProjectiles.entries()) {
      const { mesh, direction, speed, startTime, maxLifetime } = projectileData;

      // Check lifetime
      if (now - startTime > maxLifetime) {
        console.log(`[WeaponSystem] Turret projectile ${id} lifetime expired.`);
        // Use imported SceneManager
        if (SceneManager) SceneManager.remove(mesh);
        this.turretProjectiles.delete(id);
        continue; // Move to next projectile
      }

      // Update position
      const moveDistance = speed * deltaTime;
      mesh.position.addScaledVector(direction, moveDistance);

      // --- Client-side Collision Checks ---
      let hitDetected = false; // Flag to track if any hit occurred this frame

      // 1. Terrain Collision Check (Primarily for Follow-Cam Teleport)
      if (SceneManager?.isFollowingProjectile && SceneManager.followingProjectileData?.serverId === id) {
        if (SceneManager.terrainMesh) {
          const raycaster = new THREE.Raycaster(mesh.position, new THREE.Vector3(0, -1, 0)); // Raycast down
          const intersects = raycaster.intersectObject(SceneManager.terrainMesh);

          // Check if hit is close enough (e.g., within projectile radius + small buffer)
            const hitThreshold = (mesh.geometry.parameters.radius || 0.5) + 0.2; // Use radius or default
            if (intersects.length > 0 && intersects[0].distance < hitThreshold) {
              const hitPoint = intersects[0].point;
              console.log(`[WeaponSystem] Turret projectile ${id} hit terrain at ${hitPoint.toArray().join(',')} (client-side). Stopping follow cam.`);

              // --- Trigger Dirt Impact Effect ---
              if (window.particleEffectSystem?.createDirtImpact) {
                window.particleEffectSystem.createDirtImpact(hitPoint);
              }
              // --- End Trigger Dirt Impact Effect ---

              hitDetected = true; // Mark terrain hit

              // Stop following immediately
              SceneManager.stopFollowingProjectile();

              // Send teleport request to server
              if (Network?.sendTurretTeleportRequest) {
                 console.log(`[WeaponSystem] Sending turret teleport request to: ${hitPoint.toArray().join(',')}`);
                 Network.sendTurretTeleportRequest({ x: hitPoint.x, y: hitPoint.y, z: hitPoint.z });
              } else {
                 console.warn("[WeaponSystem] Network.sendTurretTeleportRequest not available.");
              }

              // Note: We don't remove the projectile mesh here, let the server's 'projectileDestroyed' handle that
              // to keep things synchronized. The camera just stops following.
            }
        }
      }

      // 2. Player Collision Prediction (Only if no terrain hit and not already predicted)
      if (!hitDetected && !projectileData.predictedHit && window.Game?.players) {
          const projectileRadius = projectileData.mesh.geometry.parameters.radius || 2.0; // Use actual or default
          const projectilePosition = projectileData.mesh.position;

          for (const [playerId, playerData] of window.Game.players.entries()) {
              // Skip self (owner), dead players, or players without a visible model
              // Note: Turret projectiles don't have an ownerId stored in projectileData currently,
              // so we can't easily skip the shooter unless we add ownerId to handleTurretShot storage.
              // For now, we'll check against all players including potentially self if close enough.
              if (!playerData.model || !playerData.model.visible || !playerData.isAlive) { // Check isAlive status
                  continue;
              }

              // Simple Bounding Sphere Check
              // Ensure the player model has a bounding sphere computed
              if (!playerData.model.geometry.boundingSphere) {
                  playerData.model.geometry.computeBoundingSphere();
              }
              const playerBoundingSphere = playerData.model.geometry.boundingSphere;
              if (!playerBoundingSphere) continue; // Skip if still no bounding sphere

              const playerWorldPosition = new THREE.Vector3();
              playerData.model.getWorldPosition(playerWorldPosition); // Get world position of player model

              // Adjust player radius based on model scale (assuming uniform scale)
              const playerRadius = playerBoundingSphere.radius * playerData.model.scale.x;
              const combinedRadius = projectileRadius + playerRadius;
              const distanceSq = projectilePosition.distanceToSquared(playerWorldPosition);

              // Check for intersection
              if (distanceSq <= combinedRadius * combinedRadius) {
                  console.log(`[WeaponSystem] Client predicted hit: Turret projectile ${id} hit player ${playerId}`);
                  projectileData.predictedHit = true; // Mark as hit predicted to prevent repeated effects
                  hitDetected = true; // Mark hit for this frame

                  // Trigger visual effect at hit location (projectile's current position)
                  // Use a specific player impact effect if available, otherwise fallback
                  if (window.particleEffectSystem?.createPlayerImpact) {
                       window.particleEffectSystem.createPlayerImpact(projectilePosition);
                  } else if (window.particleEffectSystem?.createDefaultImpact) {
                       window.particleEffectSystem.createDefaultImpact(projectilePosition);
                       console.warn("[WeaponSystem] createPlayerImpact not found, using createDefaultImpact for predicted hit.");
                  } else {
                       console.warn("[WeaponSystem] No suitable particle effect found for predicted player hit.");
                  }

                  // IMPORTANT: Do NOT remove the mesh here. Wait for server confirmation ('projectileDestroyed').
                  // This ensures synchronization and correct damage application based on server state.
                  break; // Stop checking other players for this projectile this frame
              }
          }
      }
      // --- End Client-side Collision Checks ---
    }


    // --- Handle Mobile Controls Input ---
    if (MobileControlsManager.isTouchDevice && MobileControlsManager.isVisible) {
        const mobileInput = MobileControlsManager.getInputState(); // Get fresh state

        // --- Firing ---
        // Determine combined firing state from keyboard/mouse AND mobile buttons
        const firePrimaryPressed = this.isFiringPrimary || mobileInput.buttonStates.firePrimary || mobileInput.buttonStates.firePrimaryLeft;
        const fireSecondaryPressed = this.isFiringSecondary || mobileInput.buttonStates.fireSecondary || mobileInput.buttonStates.fireSecondaryLeft;

        // Handle gatling spin-up/down based on combined state
        const primaryWeapon = this.getSelectedWeapon('primary');
        if (primaryWeapon?.type === 'gatling') {
            if (firePrimaryPressed && !primaryWeapon.isFiringSequenceActive) {
                primaryWeapon.startFiringSequence();
            } else if (!firePrimaryPressed && primaryWeapon.isFiringSequenceActive) {
                 primaryWeapon.stopFiringSequence();
            }
        }
        const secondaryWeapon = this.getSelectedWeapon('secondary');
         if (secondaryWeapon?.type === 'gatling') {
            if (fireSecondaryPressed && !secondaryWeapon.isFiringSequenceActive) {
                secondaryWeapon.startFiringSequence();
            } else if (!fireSecondaryPressed && secondaryWeapon.isFiringSequenceActive) {
                 secondaryWeapon.stopFiringSequence();
            }
        }

        // Handle continuous firing for non-gatling based on combined state
        if (firePrimaryPressed && primaryWeapon && primaryWeapon.type !== 'gatling') {
            this.fireWeaponByControl('mouse0'); // Use existing control key logic
        }
        if (fireSecondaryPressed && secondaryWeapon && secondaryWeapon.type !== 'gatling') {
             this.fireWeaponByControl('keyR'); // Use existing control key logic
        }


        // --- Swapping (Using Widget Buttons) ---
        // Trigger swap only on the frame the button becomes pressed
        if (mobileInput.buttonStates.swapPrimary && !this.wasSwapPrimaryPressed) { // Check state from manager
            this.cyclePrimaryWeapon('next');
        }
        if (mobileInput.buttonStates.swapSecondary && !this.wasSwapSecondaryPressed) { // Check state from manager
            this.cycleSecondaryWeapon();
        }

        // Update previous swap button states for next frame's edge detection
        this.wasSwapPrimaryPressed = mobileInput.buttonStates.swapPrimary;
        this.wasSwapSecondaryPressed = mobileInput.buttonStates.swapSecondary;

        // Reset the swap button states in the manager immediately after processing tap
        // (Ensures it only triggers once per press)
        if (MobileControlsManager.buttonStates.swapPrimary) {
             MobileControlsManager.buttonStates.swapPrimary = false;
        }
         if (MobileControlsManager.buttonStates.swapSecondary) {
             MobileControlsManager.buttonStates.swapSecondary = false;
        }

        // TODO: Handle other mobile buttons like interact, jump if added
    }
     // --- End Handle Mobile Controls Input ---

  }
}
