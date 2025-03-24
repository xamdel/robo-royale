import { WeaponFactory } from './WeaponFactory.js';
import { MountManager } from './MountManager.js';
import { Network } from '../network.js';
import { SceneManager } from '../scene.js';

export class WeaponSystem {
  constructor() {
    this.weaponFactory = new WeaponFactory();
    this.mountManager = new MountManager();
    this.activeWeapons = new Map(); // Track all active weapons by ID
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

    console.log('Weapon system initialized');
    return true;
  }

  setupInputListeners() {
    // Mouse controls
    document.addEventListener('mousedown', (event) => {
      if (event.button === 0) { // Left click
        this.fireWeaponByControl('mouse0');
      } else if (event.button === 2) { // Right click
        this.fireWeaponByControl('mouse2');
      }
    });

    // Keyboard controls
    document.addEventListener('keydown', (event) => {
      switch (event.code) {
        case 'KeyQ':
          this.fireWeaponByControl('keyQ');
          break;
        case 'KeyE':
          this.fireWeaponByControl('keyE');
          break;
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
      
      // Show weapon pickup message in HUD
      if (window.HUD) {
        window.HUD.showAlert(`${weaponType.toUpperCase()} EQUIPPED`, "info");
        window.HUD.addMessage(`${weaponType} equipped. Ammo: ${weapon.ammo}/${weapon.maxAmmo}`);
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
    
    const mount = this.mountManager.getMountByControlKey(controlKey);
    if (!mount) {
      console.log(`[WEAPON SYSTEM] No mount found for control key: ${controlKey}`);
      return false;
    }
    
    console.log(`[WEAPON SYSTEM] Found mount ${mount.id} for control key: ${controlKey}`);
    const result = mount.fire();
    console.log(`[WEAPON SYSTEM] Fire result for ${mount.id}: ${result}`);
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
    const weapon = this.activeWeapons.get(data.weaponId);
    if (weapon) {
      const position = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
      const direction = new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z);
      weapon.createProjectile(position, direction);
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
  }
}
