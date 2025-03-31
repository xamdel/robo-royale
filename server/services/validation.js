const gameConfig = require('../config/game-config');

class ValidationService {
  // Keep all the validation methods for various data types
  static isValidMoveData(data) {
    return data && 
           typeof data.position === 'object' &&
           typeof data.position.x === 'number' &&
           typeof data.position.y === 'number' &&
           typeof data.position.z === 'number' &&
           typeof data.rotation === 'object' &&
           typeof data.inputId === 'number' &&
           typeof data.input === 'object' &&
           typeof data.input.moveForward === 'boolean' &&
           typeof data.input.moveBackward === 'boolean' &&
           typeof data.input.moveLeft === 'boolean' &&
           typeof data.input.moveRight === 'boolean' &&
           typeof data.input.isRunning === 'boolean';
  }

  static isValidMovement(oldPos, newPos, maxDistance = 1.0) {
    // Basic distance check to prevent teleporting
    const dx = newPos.x - oldPos.x;
    const dy = newPos.y - oldPos.y;
    const dz = newPos.z - oldPos.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return distance <= maxDistance;
  }

  static isValidShootData(data) {
    return data &&
           typeof data.weaponId === 'string' &&
           typeof data.position === 'object' &&
           typeof data.direction === 'object' &&
           typeof data.position.x === 'number' &&
           typeof data.position.y === 'number' &&
           typeof data.position.z === 'number' &&
           typeof data.direction.x === 'number' &&
           typeof data.direction.y === 'number' &&
           typeof data.direction.z === 'number';
  }

  static isValidAmmoData(data) {
    return data &&
           typeof data.weaponId === 'string' &&
           typeof data.ammo === 'number' &&
           data.ammo >= 0;
  }

  static isValidInitialAmmo(weaponType) {
    // Map rocketLauncher to rocket for server-side validation
    const mappedType = weaponType === 'rocketLauncher' ? 'rocket' : weaponType;
    return gameConfig.WEAPON_AMMO.hasOwnProperty(mappedType);
  }

  static getInitialAmmo(weaponType) {
    // Removed mapping: const mappedType = weaponType === 'rocketLauncher' ? 'rocket' : weaponType;
    return gameConfig.WEAPON_AMMO[weaponType]?.initial || // Use weaponType directly
           gameConfig.WEAPON_AMMO.default.initial;
  }

  static getMaxAmmo(weaponType) {
    // Removed mapping: const mappedType = weaponType === 'rocketLauncher' ? 'rocket' : weaponType;
    return gameConfig.WEAPON_AMMO[weaponType]?.max || // Use weaponType directly
           gameConfig.WEAPON_AMMO.default.max;
  }

  static getPickupAmount(weaponType) {
    // Removed mapping: const mappedType = weaponType === 'rocketLauncher' ? 'rocket' : weaponType;
    return gameConfig.WEAPON_AMMO[weaponType]?.pickupAmount || // Use weaponType directly
           gameConfig.WEAPON_AMMO.default.pickupAmount;
  }

  static isValidWeaponPickupData(data) {
    return data &&
           typeof data.weaponId === 'string' &&
           typeof data.weaponType === 'string' &&
           typeof data.socketName === 'string';
  }

  // Remove hit validation methods as they're now handled in ProjectileController
}

module.exports = ValidationService;
