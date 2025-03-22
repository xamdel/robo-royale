import * as THREE from 'three';
import { SceneManager } from './scene.js';
import { Game } from './game.js';
import { Network } from './network.js';

export const WeaponManager = {
  activeProjectiles: [],
  
  projectileSettings: {
    speed: 3,
    maxDistance: 100,
    fireCooldown: 250,
    lastFireTime: 0
  },

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
    
    // Notify other players about weapon pickup
    Network.sendWeaponPickup(weaponObject.uuid);
    
    return true;
  },

  fireWeapon(player) {
    const now = Date.now();
    if (now - this.projectileSettings.lastFireTime < this.projectileSettings.fireCooldown) {
      return;
    }
    
    const socket = this.weaponSockets.leftArm;
    const bone = this.findBoneByName(player, socket.boneName);
    if (!bone) return;

    // Get world position and direction from weapon socket
    const worldPos = new THREE.Vector3();
    bone.getWorldPosition(worldPos);
    
    const worldDir = new THREE.Vector3(0, 0, -1);
    bone.getWorldDirection(worldDir);
    
    this.createProjectile(worldPos, worldDir, player, false);
    this.projectileSettings.lastFireTime = now;
  },

  createProjectile(position, direction, sourcePlayer, isRemote = false) {
    const geometry = new THREE.SphereGeometry(0.2, 8, 8);
    const material = new THREE.MeshBasicMaterial({ 
      color: isRemote ? '#ff4400' : '#dae640' // Different color for remote shots
    });
    const projectile = new THREE.Mesh(geometry, material);
    
    projectile.position.copy(position);
    projectile.userData.velocity = direction
      .clone()
      .multiplyScalar(this.projectileSettings.speed);
    projectile.userData.startPosition = position.clone();
    projectile.userData.sourcePlayer = sourcePlayer;
    projectile.userData.isRemote = isRemote;
    
    SceneManager.add(projectile);
    this.activeProjectiles.push(projectile);

    // If this is a local shot, send it to the network
    if (!isRemote && Game.player) {
      Network.sendShot(position.clone(), direction.clone());
    }
  },

  handleRemoteShot(data) {
    const position = new THREE.Vector3(
      data.position.x,
      data.position.y,
      data.position.z
    );
    const direction = new THREE.Vector3(
      data.direction.x,
      data.direction.y,
      data.direction.z
    );
    
    this.createProjectile(position, direction, null, true);
  },

  updateProjectiles(deltaTime) {
    this.activeProjectiles = this.activeProjectiles.filter(projectile => {
      // Move projectile
      projectile.position.add(
        projectile.userData.velocity.clone().multiplyScalar(deltaTime * 60)
      );
      
      // Check distance traveled
      const distance = projectile.position.distanceTo(
        projectile.userData.startPosition
      );
      
      // Remove if beyond max distance
      if (distance > this.projectileSettings.maxDistance) {
        SceneManager.remove(projectile);
        return false;
      }

      // Check collisions with players
      const sourcePlayer = projectile.userData.sourcePlayer;
      
      // Check local player collision
      if (Game.player && sourcePlayer !== Game.player) {
        Game.player.updateMatrixWorld();
        const playerPos = new THREE.Vector3();
        Game.player.getWorldPosition(playerPos);
        Game.player.collider.center.copy(playerPos);
        
          if (Game.player.collider.containsPoint(projectile.position)) {
            this.createExplosion(projectile.position);
            if (!projectile.userData.isRemote) {
              Network.sendProjectileHit(projectile.position, Game.player.uuid);
            }
            SceneManager.remove(projectile);
            return false;
          }
      }
      
      // Check other players collision
      for (const id in Game.otherPlayers) {
        const otherPlayer = Game.otherPlayers[id];
        if (otherPlayer && otherPlayer.mesh && otherPlayer.mesh !== sourcePlayer) {
          otherPlayer.mesh.updateMatrixWorld();
          const otherPos = new THREE.Vector3();
          otherPlayer.mesh.getWorldPosition(otherPos);
          otherPlayer.collider.center.copy(otherPos);
          
          if (otherPlayer.collider.containsPoint(projectile.position)) {
            this.createExplosion(projectile.position);
            if (!projectile.userData.isRemote) {
              Network.sendProjectileHit(projectile.position, otherPlayer.mesh.uuid);
            }
            SceneManager.remove(projectile);
            return false;
          }
        }
      }
      
      return true;
    });
  },

  createExplosion(position) {
    const particles = new THREE.Group();
    const numParticles = 20;
    const explosionColor = 0xff4400; // Orange-red color
    
    for (let i = 0; i < numParticles; i++) {
      const geometry = new THREE.SphereGeometry(0.15, 8, 8);
      const material = new THREE.MeshBasicMaterial({ 
        color: explosionColor,
        transparent: true,
        opacity: 0.8
      });
      
      const particle = new THREE.Mesh(geometry, material);
      
      // Random position within explosion radius
      const radius = 0.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      
      particle.position.set(
        position.x + radius * Math.sin(phi) * Math.cos(theta),
        position.y + radius * Math.sin(phi) * Math.sin(theta),
        position.z + radius * Math.cos(phi)
      );
      
      // Random velocity outward from center
      particle.userData.velocity = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi)
      ).multiplyScalar(Math.random() * 5 + 3);
      
      particles.add(particle);
    }
    
    SceneManager.add(particles);
    
    const startTime = performance.now();
    const duration = 800; // Shorter duration for more explosive feel
    
    const updateParticles = () => {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / duration;
      
      if (progress >= 1) {
        SceneManager.remove(particles);
        return;
      }
      
      particles.children.forEach(particle => {
        particle.position.add(particle.userData.velocity.clone().multiplyScalar(0.016));
        particle.userData.velocity.multiplyScalar(0.95); // Slow down
        
        if (particle.material) {
          particle.material.opacity = 0.8 * (1 - progress);
        }
      });
      
      requestAnimationFrame(updateParticles);
    };
    
    updateParticles();
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
