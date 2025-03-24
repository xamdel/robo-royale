import { WeaponSystem } from './WeaponSystem.js';
import { WeaponFactory } from './WeaponFactory.js';
import { MountManager } from './MountManager.js';
import { Weapon } from './models/Weapon.js';
import { MountPoint } from './models/MountPoint.js';
import { weaponConfigs, getWeaponConfig } from './configs/weapon-configs.js';
import { mountConfigs } from './configs/mount-configs.js';

// Create and export a singleton instance of WeaponSystem
export const weaponSystem = new WeaponSystem();

// Export classes for potential extension/customization
export {
  WeaponSystem,
  WeaponFactory,
  MountManager,
  Weapon,
  MountPoint,
  weaponConfigs,
  getWeaponConfig,
  mountConfigs
};
