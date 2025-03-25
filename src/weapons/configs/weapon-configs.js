import * as THREE from 'three';

export const weaponConfigs = {
  cannon: {
    modelPath: 'assets/models/Cannon.glb',
    preferredMounts: ['leftArm', 'rightArm'], // Preference, not restriction
    naturalSide: 'left',  // The side the model is naturally oriented for
    projectileType: 'cannonball',
    fireRate: 1.5,
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
    }
  },
  rocketLauncher: {
    modelPath: 'assets/models/RocketLauncher.glb',
    preferredMounts: ['rightShoulder', 'rightArm'],
    naturalSide: 'right',
    projectileType: 'rocket',
    fireRate: 0.5,
    damage: 50,
    projectileConfig: {
      radius: 0.3,
      speed: 150, // Significantly increased max speed
      maxDistance: 80,
      color: 0xff4400
    },
    effects: {
      muzzleFlash: true,
      smoke: true,
      sound: 'rocket-launch.mp3'
    }
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
