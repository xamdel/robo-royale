const gameConfig = require('../config/game-config');
const collisionService = require('./collision-service'); // Import CollisionService

class ValidationService {
  constructor() {
    this.lastValidationResult = new Map(); // Store last result per player
  }
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
    // Replace basic distance check with collision service check
    const result = collisionService.checkMovement(oldPos, newPos);
    // Store the result temporarily so PlayerController can access correctedPos
    // Note: This is a bit hacky; a better approach might involve passing results differently.
    // We need a way to associate this result with the specific player/request.
    // Using a simple map for now, assuming validation is called right before update.
    // This might break if requests interleave unexpectedly.
    // A player ID would be needed here for a robust map key.
    // For now, using a generic key 'lastResult' - THIS IS NOT ROBUST FOR MULTIPLE PLAYERS.
    // We'll need to refine this in PlayerController.
    ValidationService.instance.lastValidationResult.set('lastResult', result);
    return result.isValid;
  }

  // Method to retrieve the corrected position after validation
  static getLastCorrectedPosition() {
    const result = ValidationService.instance.lastValidationResult.get('lastResult');
    return result ? result.correctedPos : null;
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
    const mappedType = weaponType === 'rocketLauncher' ? 'rocket' : weaponType;
    return gameConfig.WEAPON_AMMO[mappedType]?.initial || 
           gameConfig.WEAPON_AMMO.default.initial;
  }

  static getMaxAmmo(weaponType) {
    const mappedType = weaponType === 'rocketLauncher' ? 'rocket' : weaponType;
    return gameConfig.WEAPON_AMMO[mappedType]?.max || 
           gameConfig.WEAPON_AMMO.default.max;
  }

  static getPickupAmount(weaponType) {
    const mappedType = weaponType === 'rocketLauncher' ? 'rocket' : weaponType;
    return gameConfig.WEAPON_AMMO[mappedType]?.pickupAmount || 
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

// Create a singleton instance to manage state like lastValidationResult
ValidationService.instance = new ValidationService();

// Export the static methods bound to the instance or the class itself
// For simplicity, we'll export the class and rely on static access modifying the instance state.
// A cleaner design might involve passing the instance around.
module.exports = ValidationService;
