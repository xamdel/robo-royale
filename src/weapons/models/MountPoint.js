import * as THREE from 'three';
import { audioManager } from '../../audio/AudioManager.js'; // Import AudioManager
import { SceneManager } from '../../scene.js'; // Import SceneManager

export class MountPoint {
  constructor(config, bone) {
    this.config = config;
    this.bone = bone;
    this.weapon = null;
    this.id = config.id;
    this.side = config.side;
    this.controlKey = config.controlKey;
    this.socketName = config.boneName; // Add socketName based on bone name
    this.lastFireTime = 0;
  }

  attachWeapon(weapon) {
    if (this.weapon) {
      console.warn(`Mount point ${this.id} already has a weapon attached`);
      return false;
    }

    console.log(`[ATTACHMENT START] Weapon: ${weapon.type}, Mount: ${this.id}, Bone: ${this.bone.name}`);
    console.log('  Initial Bone World Matrix:', this.bone.matrixWorld.toArray());
    console.log('  Initial Weapon World Matrix (before parenting):', weapon.model.matrixWorld.toArray());

    // Store the weapon
    this.weapon = weapon;
    // Set the back-reference from the weapon to this mount point
    weapon.mountPoint = this;

    // Get parent object info for debugging
    const parentInfo = this.bone.parent ? {
      name: this.bone.parent.name,
      type: this.bone.parent.type,
      isScene: this.bone.parent.type === 'Scene',
      isPlayerModel: this.bone.parent.isPlayerModel || false,
      uuid: this.bone.parent.uuid
    } : 'No parent';
    
    // Find player info if available
    let playerInfo = 'Unknown';
    let currentObj = this.bone;
    while (currentObj) {
      if (currentObj.isPlayerModel || currentObj.playerId) {
        playerInfo = {
          isPlayerModel: currentObj.isPlayerModel || false,
          isRemotePlayer: currentObj.isRemotePlayer || false,
          playerId: currentObj.playerId || 'unknown',
          name: currentObj.name || 'unknown'
        };
        break;
      }
      currentObj = currentObj.parent;
    }

    console.log(`[MOUNT] Attaching weapon ${weapon.type} to mount ${this.id} on bone ${this.bone.name}`, {
      parentInfo,
      playerInfo,
      boneMatrixWorld: this.bone.matrixWorld ? this.bone.matrixWorld.toArray() : 'No matrix'
    });

    // Remove from current parent if any
    if (weapon.model.parent) {
      weapon.model.parent.remove(weapon.model);
    }

    // Add to bone
    this.bone.add(weapon.model);
    // Force matrix updates after parenting
    this.bone.updateMatrixWorld(true); 
    weapon.model.updateMatrixWorld(true);

    console.log('  Weapon World Matrix (after parenting to bone):', weapon.model.matrixWorld.toArray());
    console.log('  Weapon Local Matrix (relative to bone):', weapon.model.matrix.toArray());

    // Initial setup for position, rotation, and scale
    let position = this.config.defaultPosition.clone();
    let baseRotation = this.config.defaultRotation.clone(); // Base Euler rotation from config
    let scale = this.config.defaultScale;

    console.log(`  Applying Mount Config Defaults: Pos=${position.toArray()}, Rot=${baseRotation.toArray()}, Scale=${scale}`);

    // Capture pre-attachment state (using Euler for simplicity in logging)
    const preAttachmentState = {
      weaponPosition: weapon.model.position.clone(),
      weaponRotation: weapon.model.rotation.clone(), // Log Euler before quaternion changes
      weaponScale: weapon.model.scale.clone(),
      mountPosition: this.bone.position.clone(),
      mountRotation: this.bone.rotation.clone(),
      mountWorldMatrix: this.bone.matrixWorld.clone()
    };

    // --- Direct Quaternion Rotation Logic ---
    // Reset rotation and scale first
    weapon.model.quaternion.identity();
    weapon.model.scale.set(scale, scale, scale);

    let finalPositionX = position.x; // Default X position
    
    // 1. Start with the default mount rotation
    const finalQuat = new THREE.Quaternion().setFromEuler(baseRotation); // Use mount's defaultRotation

    // 2. Apply weapon-specific mirror rotation if needed
    if (this.side !== weapon.config.naturalSide) {
        console.log(`  Mirroring for opposite side. Applying weapon's mirrorRotation.`);
        finalPositionX = -position.x; // Mirror X position
        
        // Get the mirror rotation from the weapon config (ensure it exists)
        const mirrorRotationEuler = weapon.config.mirrorRotation || new THREE.Euler(0, 0, 0); 
        const mirrorQuat = new THREE.Quaternion().setFromEuler(mirrorRotationEuler);
        
        // Apply the mirror rotation on top of the default mount rotation
        finalQuat.multiply(mirrorQuat); 
    } else {
        console.log('  No mirroring needed (same side or no natural side specified).');
    }

    // Apply the final calculated rotation and position
    weapon.model.quaternion.copy(finalQuat);
    weapon.model.position.copy(position); // Use original Y, Z
    weapon.model.position.setX(finalPositionX); // Set potentially mirrored X

    // Final matrix update after all transformations
    weapon.model.updateMatrixWorld(true);

    console.log('  Final Weapon Local Matrix (Direct Quat):', weapon.model.matrix.toArray());
    console.log('  Final Weapon World Matrix:', weapon.model.matrixWorld.toArray());

    // Ensure the model is visible
    weapon.model.visible = true;
    
    // Make sure all materials are visible
    weapon.model.traverse(child => {
      if (child.isMesh) {
        child.visible = true;
        child.castShadow = true;
        // Clone material to avoid sharing issues
        child.material = child.material.clone();
      }
    });

    // Add coordinate system visualization for debugging
    const addAxesHelper = (obj, name) => {
      // Remove previous helper if exists
      const existingHelper = obj.children.find(c => c.isAxesHelper);
      if (existingHelper) obj.remove(existingHelper);
      
      // Add new helper
      const axesHelper = new THREE.AxesHelper(0.5);
      axesHelper.name = `${name}_axes`;
      axesHelper.isAxesHelper = true;
      obj.add(axesHelper);
    };

    // Add axes helpers to both weapon and mount (helpful for debugging)
    // addAxesHelper(weapon.model, `${weapon.type}_weapon`);
    // addAxesHelper(this.bone, `${this.id}_mount`);

    // Detailed logging of attachment process
    console.log(`[WEAPON ATTACHMENT] Mounted ${weapon.type} to ${this.id}`, {
      preAttachmentState: {
        weaponPosition: preAttachmentState.weaponPosition.toArray(),
        weaponRotation: preAttachmentState.weaponRotation.toArray(),
        weaponScale: preAttachmentState.weaponScale.toArray(),
        mountPosition: preAttachmentState.mountPosition.toArray(),
        mountRotation: preAttachmentState.mountRotation.toArray()
      },
      postAttachmentState: {
        position: weapon.model.position.toArray(),
        rotation: weapon.model.rotation.toArray(),
        scale: weapon.model.scale.toArray(),
        worldPosition: new THREE.Vector3().setFromMatrixPosition(weapon.model.matrixWorld).toArray(),
        worldRotation: new THREE.Euler().setFromRotationMatrix(weapon.model.matrixWorld).toArray()
      },
      mountConfig: {
        defaultPosition: this.config.defaultPosition.toArray(),
        defaultRotation: this.config.defaultRotation.toArray(),
        defaultScale: this.config.defaultScale
      },
      weaponConfig: {
        naturalSide: weapon.config.naturalSide
      }
    });

    return true;
  }

  detachWeapon() {
    if (!this.weapon) {
      return null;
    }

    const weapon = this.weapon;
    this.bone.remove(weapon.model);
    // Clear the back-reference when detaching
    if (weapon) {
        weapon.mountPoint = null;
    }
    this.weapon = null;
    
    // No need to "revert" mirroring here because the attachWeapon method handles it independently based on the mount point's side when it's attached again.
    
    weapon.model.position.set(0, 0, 0);
    weapon.model.rotation.set(0, 0, 0);
    weapon.model.scale.set(1, 1, 1);
    
    return weapon;
  }

  hasWeapon() {
    return this.weapon !== null;
  }

  getWeapon() {
    return this.weapon;
  }

  getWorldPosition() {
    const worldPos = new THREE.Vector3();
    this.bone.getWorldPosition(worldPos);
    return worldPos;
  }

  getWorldDirection() {
    const worldDir = new THREE.Vector3(0, 0, -1);
    this.bone.getWorldDirection(worldDir);
    return worldDir;
  }

  canFire() {
    if (!this.weapon) return false;

    const now = Date.now();
    const timeSinceLastFire = now - this.lastFireTime;
    const cooldownTime = (1000 / this.weapon.config.fireRate); // Convert fire rate to milliseconds

    return timeSinceLastFire >= cooldownTime;
  }

  fire() {
    console.log(`[WEAPON] Mount point ${this.id} fire attempt`);
    
    if (!this.canFire()) {
      console.log(`[WEAPON] Mount point ${this.id} cannot fire - cooldown not ready`);
      return false;
    }

    if (!this.weapon) {
      console.log(`[WEAPON] Mount point ${this.id} has no weapon attached`);
      return false;
    }
    
    const worldPosition = this.getWorldPosition();
    // Use the camera's direction for aiming, not the mount's direction
    const aimDirection = SceneManager.getCameraDirection(); 
    
    console.log(`[WEAPON] Firing weapon ${this.weapon.type} from position`, 
                worldPosition.toArray(), 
                "in direction (camera aim)", 
                aimDirection.toArray());
    
    // Pass the aimDirection to the weapon's fire method
    const success = this.weapon.fire(worldPosition, aimDirection); 
    if (success) {
      console.log(`[WEAPON] Fire successful for ${this.weapon.type}`);
      this.lastFireTime = Date.now();

      // Update HUD display for this mount type
      if (window.HUD && window.HUD.updateWeaponDisplay) {
        window.HUD.updateWeaponDisplay(this.config.mountType);
      } else {
        console.warn(`[MountPoint] Could not update HUD for mount ${this.id}. HUD or updateWeaponDisplay function missing.`);
      }

      // Play fire sound effect
      let soundPath = null;
      switch (this.weapon.type) {
        case 'cannon':
          soundPath = 'cannon.wav';
          break;
        case 'rocketLauncher': // Corrected type to match config
          soundPath = 'rocket.wav';
          break;
        // Add cases for other weapons if needed
      }

      if (soundPath && this.weapon.model) {
        console.log(`[AUDIO] Playing fire sound ${soundPath} for weapon ${this.weapon.type}`);
        audioManager.playEffect(soundPath, this.weapon.model);
      } else if (soundPath) {
          console.warn(`[AUDIO] Cannot play sound for ${this.weapon.type}: Weapon model not found.`);
      }
    } else {
      console.log(`[WEAPON] Fire failed for ${this.weapon.type}`);
    }
    
    return success;
  }

  update(deltaTime) {
    if (this.weapon) {
      this.weapon.update(deltaTime);
    }
  }
}
