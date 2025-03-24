import * as THREE from 'three';
import { mountConfigs } from './configs/mount-configs.js';
import { MountPoint } from './models/MountPoint.js';

export class MountManager {
  constructor() {
    this.mounts = new Map();
    this.mountsByControl = new Map();
  }

  initMounts(playerModel) {
    // Clear existing mounts
    this.mounts.clear();
    this.mountsByControl.clear();

    // Log critical player model info
    console.log('[PLAYER MODEL] Details:', {
      name: playerModel.name,
      type: playerModel.type,
      hasUserData: !!playerModel.userData,
      childCount: playerModel.children.length,
      isGamePlayer: window.Game && playerModel === window.Game.player
    });

    // Create mount points based on configuration
    for (const config of mountConfigs) {
      const bone = this.findBoneByName(playerModel, config.boneName);
      
      if (bone) {
        const mountPoint = new MountPoint(config, bone);
        this.mounts.set(config.id, mountPoint);
        this.mountsByControl.set(config.controlKey, mountPoint);
        
        // Get detailed bone hierarchy information
        let currentBone = bone;
        const hierarchy = [];
        
        // First log the mount point bone itself
        const bonePos = new THREE.Vector3();
        const boneRot = new THREE.Euler();
        const boneScale = new THREE.Vector3();
        bone.matrix.decompose(bonePos, new THREE.Quaternion().setFromEuler(boneRot), boneScale);
        
        console.log(`[Mount ${config.id}] Mount point bone details:`, {
          name: bone.name,
          type: bone.type,
          localPosition: bonePos.toArray(),
          localRotation: boneRot.toArray(),
          matrixWorld: bone.matrixWorld.toArray(),
          isPartOfPlayer: this.isPartOfPlayer(bone, playerModel)
        });
        
        // Then get the full hierarchy
        while (currentBone && currentBone.type !== 'Scene') {
          const pos = new THREE.Vector3();
          const rot = new THREE.Euler();
          const scale = new THREE.Vector3();
          currentBone.matrix.decompose(pos, new THREE.Quaternion().setFromEuler(rot), scale);
          
          hierarchy.unshift({
            name: currentBone.name,
            type: currentBone.type,
            localPosition: pos.toArray(),
            localRotation: rot.toArray(),
            matrixWorld: currentBone.matrixWorld.toArray()
          });
          
          currentBone = currentBone.parent;
        }
        
        console.log(`[Mount ${config.id}] Full bone hierarchy:`, {
          boneName: config.boneName,
          fullPath: hierarchy.map(b => b.name).join(' -> '),
          transforms: hierarchy
        });
      } else {
        console.warn(`Could not find bone ${config.boneName} for mount ${config.id}`);
      }
    }

    return this.mounts.size > 0;
  }
  
  // Helper to check if a bone is part of the player model
  isPartOfPlayer(bone, playerModel) {
    let current = bone;
    let depth = 0;
    const maxDepth = 10;
    
    while (current && depth < maxDepth) {
      if (current === playerModel) {
        return true;
      }
      current = current.parent;
      depth++;
    }
    return false;
  }

  findBoneByName(model, boneName) {
    let result = null;
    let allObjects = new Map(); // Store all objects for debugging

    // Helper function to log object hierarchy
    const logHierarchy = (object, depth = 0) => {
      const prefix = '  '.repeat(depth);
      const type = object.type;
      const name = object.name;
      console.log(`${prefix}- ${name} (${type})`);
      object.children.forEach(child => {
        logHierarchy(child, depth + 1);
      });
    };

    // First find the Cabin bone to parent mount points to
    let cabinBone = null;
    model.traverse((object) => {
      allObjects.set(object.name, object);
      if (object.isBone && object.name === 'Cabin') {
        cabinBone = object;
      }
    });

    if (!cabinBone) {
      console.warn('[Bone Search] Could not find Cabin bone to parent mount points');
      return null;
    }

    // Look for mount points under Cabin_1 group
    model.traverse((object) => {
      if (object.name === 'Cabin_1') {
        object.traverse((child) => {
          if (!result && child.name === boneName) {
            // Get world position of the original mount point
            const worldPos = new THREE.Vector3();
            const worldRot = new THREE.Euler();
            const worldQuat = new THREE.Quaternion();
            const worldScale = new THREE.Vector3();

            child.updateWorldMatrix(true, false);
            child.getWorldPosition(worldPos);
            child.getWorldQuaternion(worldQuat);
            worldRot.setFromQuaternion(worldQuat);
            child.getWorldScale(worldScale);

            console.log(`[Mount Point Details] ${child.name}:`, {
              localPosition: child.position.toArray(),
              localRotation: child.rotation.toArray(),
              localScale: child.scale.toArray(),
              worldPosition: worldPos.toArray(),
              worldRotation: worldRot.toArray(),
              worldScale: worldScale.toArray(),
              matrix: child.matrix.toArray(),
              matrixWorld: child.matrixWorld.toArray()
            });

            // Create a new Object3D to serve as the mount point
            const mountPoint = new THREE.Object3D();
            mountPoint.name = child.name;
            
            // Copy the transform from the original object
            mountPoint.position.copy(child.position);
            mountPoint.rotation.copy(child.rotation);
            mountPoint.scale.copy(child.scale);
            
            // Parent to the Cabin bone for proper transformations
            cabinBone.add(mountPoint);
            
            result = mountPoint;
            console.log(`[Bone Search] Created mount point: ${mountPoint.name} parented to Cabin bone`);
          }
        });
      }
    });

    // If not found, try bones as fallback
    if (!result) {
      model.traverse((object) => {
        if (!result && object.isBone && object.name === boneName) {
          result = object;
          console.log(`[Bone Search] Found bone match: ${object.name}`);
        }
      });
    }

    // If still no match, log detailed hierarchy for debugging
    if (!result) {
      console.warn(`[Bone Search] Failed to find "${boneName}". Full object hierarchy:`);
      logHierarchy(model);
      
      // Log all object names for easier searching
      console.warn('All object names:', 
        Array.from(allObjects.keys()).sort().join('\n - ')
      );
    }

    return result;
  }

  getMountPoint(mountId) {
    return this.mounts.get(mountId);
  }

  getMountByControlKey(controlKey) {
    return this.mountsByControl.get(controlKey);
  }

  findBestMountPoint(weaponType, preferredMounts = []) {
    // Try preferred mounts first
    for (const mountId of preferredMounts) {
      const mount = this.mounts.get(mountId);
      if (mount && !mount.hasWeapon()) {
        return mount;
      }
    }

    // Then try any available mount
    for (const mount of this.mounts.values()) {
      if (!mount.hasWeapon()) {
        return mount;
      }
    }

    return null;
  }

  getAllMounts() {
    return Array.from(this.mounts.values());
  }

  getOccupiedMounts() {
    return this.getAllMounts().filter(mount => mount.hasWeapon());
  }

  getAvailableMounts() {
    return this.getAllMounts().filter(mount => !mount.hasWeapon());
  }

  detachAllWeapons() {
    const detachedWeapons = [];
    for (const mount of this.mounts.values()) {
      const weapon = mount.detachWeapon();
      if (weapon) {
        detachedWeapons.push(weapon);
      }
    }
    return detachedWeapons;
  }

  update(deltaTime) {
    for (const mount of this.mounts.values()) {
      mount.update(deltaTime);
    }
  }
}
