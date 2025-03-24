import * as THREE from 'three';

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

    // Store the weapon
    this.weapon = weapon;

    // Remove from current parent if any
    if (weapon.model.parent) {
      weapon.model.parent.remove(weapon.model);
    }

    // Add to bone
    this.bone.add(weapon.model);

    // Initial setup for position, rotation, and scale
    let position = this.config.defaultPosition.clone();
    let rotation = this.config.defaultRotation.clone();
    let scale = this.config.defaultScale;

    // Capture pre-attachment state
    const preAttachmentState = {
      weaponPosition: weapon.model.position.clone(),
      weaponRotation: weapon.model.rotation.clone(),
      weaponScale: weapon.model.scale.clone(),
      mountPosition: this.bone.position.clone(),
      mountRotation: this.bone.rotation.clone(),
      mountWorldMatrix: this.bone.matrixWorld.clone()
    };

    // Handle weapon orientation based on mount side
    if (this.side !== weapon.config.naturalSide) {
      // Mirror the weapon if mounting on opposite side
      position.x = position.x; // Mirror position along X axis
      rotation.y += Math.PI; // Rotate by 180 degrees (PI radians) around Y axis
    }

    weapon.model.position.copy(position);
    weapon.model.rotation.copy(rotation);
    weapon.model.scale.set(scale, scale, scale);

    // Add coordinate system visualization
    // const addAxesHelper = (obj, name) => {
    //   const axesHelper = new THREE.AxesHelper(0.5);
    //   axesHelper.name = `${name}_axes`;
    //   obj.add(axesHelper);
    // };

    // Add axes helpers to both weapon and mount
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
    const worldDirection = this.getWorldDirection();
    
    console.log(`[WEAPON] Firing weapon ${this.weapon.type} from position`, 
                worldPosition.toArray(), 
                "in direction", 
                worldDirection.toArray());
    
    const success = this.weapon.fire(worldPosition, worldDirection);
    if (success) {
      console.log(`[WEAPON] Fire successful for ${this.weapon.type}`);
      this.lastFireTime = Date.now();
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
