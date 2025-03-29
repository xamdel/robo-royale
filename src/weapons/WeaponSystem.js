import * as THREE from 'three';
import { WeaponFactory } from './WeaponFactory.js';
import { MountManager } from './MountManager.js';
import { Network } from '../network.js';

export class WeaponSystem {
  constructor() {
    this.weaponFactory = new WeaponFactory();
    this.mountManager = new MountManager();
    this.activeWeapons = new Map(); // Track all active weapons by ID
    this.weaponTemplates = new Map(); // Track weapon templates by type
    this.setupInputListeners();
  }

  async init(playerModel) {
    console.log('Initializing weapon system...');

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

    console.log('Weapon system initialized');
    return true;
  }

  async createWeaponTemplates() {
    const { weaponConfigs } = await import('./configs/weapon-configs.js');
    
    for (const [weaponType, config] of Object.entries(weaponConfigs)) {
      const weapon = await this.weaponFactory.createWeapon(weaponType);
      if (weapon) {
        this.weaponTemplates.set(weaponType, weapon);
        console.log(`Created weapon template for ${weaponType}`);
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
        this.fireWeaponByControl('mouse0');
      }
    });

    // Keyboard controls for secondary weapons (shoulders)
    document.addEventListener('keydown', (event) => {
      switch (event.code) {
        case 'KeyR':
          this.fireWeaponByControl('keyR');
          break;
        case 'Tab':
          event.preventDefault(); // Prevent tab from changing focus
          this.cycleSecondaryWeapon();
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

      // Notify other players about weapon pickup
      Network.sendWeaponPickup({
        weaponId: weapon.id,
        weaponType: weaponType,
        socketName: mountPoint.socketName
      });
    }

    return success;
  }

  fireWeaponByControl(controlKey) {
    console.log(`[WEAPON SYSTEM] Fire attempt for control key: ${controlKey}`);
    
    // Get all mounts for this control key
    const mounts = this.mountManager.getAllMounts().filter(mount => mount.config.controlKey === controlKey);
    if (mounts.length === 0) {
      console.log(`[WEAPON SYSTEM] No mounts found for control key: ${controlKey}`);
      return false;
    }
    
    // Debug log all mount points for this control key
    console.log(`[WEAPON SYSTEM] Found ${mounts.length} mounts for control key ${controlKey}:`, 
      mounts.map(m => ({
        id: m.id,
        socketName: m.socketName,
        hasWeapon: m.hasWeapon(),
        weaponType: m.hasWeapon() ? m.getWeapon().type : 'none'
      }))
    );
    
    // Filter by mount type
    const mountType = mounts[0].config.mountType; // Get mount type from first mount
    const selectedIndex = mountType === 'primary' ? this.selectedPrimaryIndex : this.selectedSecondaryIndex;
    
    // Only use mounts that have weapons
    const mountsWithWeapons = mounts.filter(mount => mount.hasWeapon());
    if (mountsWithWeapons.length === 0) {
      console.log(`[WEAPON SYSTEM] No armed mounts found for control key: ${controlKey}`);
      return false;
    }
    
    // Select the active mount based on selection index (clamped to valid range)
    const activeIndex = Math.min(selectedIndex, mountsWithWeapons.length - 1);
    const activeMount = mountsWithWeapons[activeIndex];
    
    console.log(`[WEAPON SYSTEM] Firing mount ${activeMount.id} for control key: ${controlKey}`);
    
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
    console.log(`[WEAPON SYSTEM] Fire result for ${activeMount.id}: ${result}`);
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
    console.log('[WeaponSystem] Player equipped weapons:', equippedWeapons);
    return equippedWeapons;
  }

  // Remove all weapons currently equipped by the player
  removeAllPlayerWeapons() {
    console.log('[WeaponSystem] Removing all player weapons...');
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
        console.log(`[WeaponSystem] Removed weapon ${weaponId} from mount ${mount.id}`);
      }
    }
    console.log(`[WeaponSystem] Finished removing weapons. Total removed: ${removedCount}`);
    // Optionally update HUD if needed
    if (window.HUD && window.HUD.updateWeaponDisplay) {
        window.HUD.updateWeaponDisplay('primary');
        window.HUD.updateWeaponDisplay('secondary');
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
    console.log(`[WeaponSystem] Handling remote shot for weapon type: ${data.weaponType}`);
    
    // Try to find weapon template for this type
    const weapon = this.weaponTemplates.get(data.weaponType);
    
    if (weapon) {
      const position = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
      const direction = new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z);
      console.log(`[WeaponSystem] Creating projectile at`, position, 'direction', direction);
      const projectile = weapon.createProjectile(position, direction);
      return projectile;
    } else {
      console.error(`[WeaponSystem] Could not find weapon template for type: ${data.weaponType}`);
      return null;
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
    
    // Also update weapon templates to handle remote projectiles
    for (const weapon of this.weaponTemplates.values()) {
      weapon.update(deltaTime);
    }
  }
}
