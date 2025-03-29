import * as THREE from 'three';

export const weaponConfigs = {
  cannon: {
    modelPath: 'assets/models/Cannon.glb',
    preferredMounts: ['leftArm', 'rightArm'], // Preference, not restriction
    naturalSide: 'left',  // The side the model is naturally oriented for
    projectileType: 'cannonball',
    fireRate: 2,
    damage: 20,
    projectileConfig: {
      radius: 0.15,
      speed: 300,
      maxDistance: 100,
      color: 0xdae640
    },
    effects: {
      muzzleFlash: true,
      sound: 'cannon-shot.mp3'
    },
    ammo: 20, // Initial ammo
    maxAmmo: 20 // Max ammo capacity
  },
  rocketLauncher: {
    modelPath: 'assets/models/RocketLauncher.glb',
    preferredMounts: ['rightShoulder', 'rightArm'],
    naturalSide: 'right',
    projectileType: 'rocket',
    fireRate: 2,
    damage: 50,
    projectileConfig: {
      radius: 0.3,
      speed: 200, // Matched with server for consistent fast rockets
      maxDistance: 80,
      color: 0xff4400
    },
    effects: {
      muzzleFlash: true,
      smoke: true,
      sound: 'rocket-launch.mp3'
    },
    ammo: 4, // Initial ammo
    maxAmmo: 8 // Max ammo capacity
  },
  gatling: {
    modelPath: 'assets/models/Gatling.glb',
    preferredMounts: ['leftArm', 'leftShoulder'],
    naturalSide: 'left', // Assuming left-handed model orientation
    projectileType: 'bullet', // Standard bullet type
    fireRate: 50, // High rate of fire
    damage: 2, // Low damage per bullet
    projectileConfig: {
      radius: 0.1,
      speed: 400, // Fast bullets
      maxDistance: 120,
      color: 0xffff00 // Yellow bullets
    },
    fireDelay: 0.85, // Time in seconds for spin-up before firing starts
    effects: {
      muzzleFlash: true,
      sound: 'gatling-fire.wav', // Main firing sound (looping)
      spinUpSound: 'gatling-spinup.wav',
      spinDownSound: 'gatling-spindown.wav'
    },
    ammo: 500, // Initial ammo
    maxAmmo: 1000 // Max ammo capacity
  }
};

// Utility function to get weapon config
export function getWeaponConfig(type) {
  const config = weaponConfigs[type];
  if (!config) {
    console.warn(`No configuration found for weapon type: ${type}`);
    return null;
  }
  return config;
}
