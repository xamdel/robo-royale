import * as THREE from 'three';
import { SceneManager } from './scene.js';

export const WeaponManager = {
  weaponSockets: {
    leftArm: {
      boneName: 'ArmL',
      position: [-0.55,-2.46, 0.00],
      rotation: [0, 0, 0],
      scale: 1,
      attachmentCallback: null
    },
    rightArm: {
      boneName: 'ArmR',
      position: [-0.5, 0, 0],
      rotation: [0, -Math.PI/2, 0],
      scale: 0.2
    },
    shoulderLeft: {
      boneName: 'ShoulderL',
      position: [0, 0.3, 0],
      rotation: [0, 0, 0],
      scale: 0.25
    },
    shoulderRight: {
      boneName: 'ShoulderR',
      position: [0, 0.3, 0],
      rotation: [0, 0, 0],
      scale: 0.25
    }
  },

  weaponTypes: {
    cannon: {
      socket: 'leftArm',
      positionOffset: [0, 0, 0],
      rotationOffset: [0, 0, 0],
      scaleMultiplier: 1.0,
      effectColor: 0xffff00
    },
    rocketLauncher: {
      socket: 'rightArm',
      positionOffset: [0, 0.1, 0],
      rotationOffset: [0, 0, 0],
      scaleMultiplier: 1.2,
      effectColor: 0xff0000
    }
  },

  findBoneByName(player, boneName) {
    let result = null;
    
    if (!player) {
      console.error('Player model not loaded, cannot find bone:', boneName);
      return null;
    }
    
    player.traverse((object) => {
      if (object.name === boneName) {
        result = object;
      }
    });
    
    if (!result) {
      console.warn(`Bone "${boneName}" not found in player model`);
    }
    
    return result;
  },

  attachWeaponToSocket(player, weaponObject, socketName, weaponType = 'cannon') {
    const socket = this.weaponSockets[socketName];
    const weaponConfig = this.weaponTypes[weaponType] || this.weaponTypes.cannon;
    
    if (!socket) {
      console.error(`Socket "${socketName}" not defined`);
      return false;
    }
    
    const bone = this.findBoneByName(player, socket.boneName);
    if (!bone) {
      console.error(`Could not find bone "${socket.boneName}" for socket "${socketName}"`);
      return false;
    }
    
    const worldPos = new THREE.Vector3();
    weaponObject.getWorldPosition(worldPos);
    
    const originalScale = weaponObject.scale.clone();
    
    SceneManager.scene.remove(weaponObject);
    bone.add(weaponObject);
    
    weaponObject.position.set(...socket.position);
    weaponObject.rotation.set(...socket.rotation);
    
    weaponObject.position.x += weaponConfig.positionOffset[0];
    weaponObject.position.y += weaponConfig.positionOffset[1];
    weaponObject.position.z += weaponConfig.positionOffset[2];
    
    weaponObject.rotation.x += weaponConfig.rotationOffset[0];
    weaponObject.rotation.y += weaponConfig.rotationOffset[1];
    weaponObject.rotation.z += weaponConfig.rotationOffset[2];
    
    const finalScale = socket.scale * weaponConfig.scaleMultiplier;
    weaponObject.scale.set(
      originalScale.x * finalScale,
      originalScale.y * finalScale,
      originalScale.z * finalScale
    );
    
    console.log(`Attached "${weaponType}" to socket "${socketName}" on bone "${socket.boneName}"`, {
      finalPosition: weaponObject.position.toArray(),
      finalRotation: weaponObject.rotation.toArray(),
      finalScale: weaponObject.scale.toArray()
    });
    
    if (socket.attachmentCallback) {
      socket.attachmentCallback(weaponObject, bone);
    }
    
    this.addPickupEffect(worldPos, weaponConfig.effectColor);
    
    return true;
  },

  addPickupEffect(position, color = 0xffff00) {
    const particles = new THREE.Group();
    
    for (let i = 0; i < 10; i++) {
      const geometry = new THREE.SphereGeometry(0.1, 8, 8);
      const material = new THREE.MeshBasicMaterial({ 
        color: color,
        transparent: true,
        opacity: 0.8
      });
      
      const particle = new THREE.Mesh(geometry, material);
      
      particle.position.set(
        position.x + (Math.random() - 0.5) * 0.5,
        position.y + (Math.random() - 0.5) * 0.5,
        position.z + (Math.random() - 0.5) * 0.5
      );
      
      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 2
      );
      
      particles.add(particle);
    }
    
    SceneManager.add(particles);
    
    const startTime = performance.now();
    const duration = 1000;
    
    const updateParticles = () => {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / duration;
      
      if (progress >= 1) {
        SceneManager.remove(particles);
        return;
      }
      
      particles.children.forEach(particle => {
        particle.position.add(particle.userData.velocity.clone().multiplyScalar(0.016));
        particle.userData.velocity.y -= 0.1;
        
        if (particle.material) {
          particle.material.opacity = 0.8 * (1 - progress);
        }
      });
      
      requestAnimationFrame(updateParticles);
    };
    
    updateParticles();
  }
};
