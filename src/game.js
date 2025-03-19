import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SceneManager } from './scene.js';

export const Game = {
  player: null,
  otherPlayers: {},
  moveForward: false,
  moveBackward: false,
  moveLeft: false,
  moveRight: false,
  mechModel: null,
  targetPosition: null,
  lastPosition: null,

  loadMechModel() {
    return new Promise((resolve) => {
      const loader = new GLTFLoader();
      loader.load('assets/models/mech.glb', (gltf) => {
        const fbx = gltf.scene;
        // Position adjustment
        fbx.position.y = 0.1;

        // Ensure the model faces -Z (Three.js forward)
        fbx.rotation.y = Math.PI; // Rotate 180 if front is +Z in the FBX

        fbx.traverse((child) => {
          if (child.isMesh) {
            // Shadow settings
            child.castShadow = true;
            child.receiveShadow = true;
            
            // if (child.material) {
            //   // Handle material arrays
            //   if (Array.isArray(child.material)) {
            //     child.material.forEach(material => {
            //       this.upgradeMaterial(material);
            //     });
            //   } else {
            //     this.upgradeMaterial(child.material);
            //   }
            // }
          }
        });

        this.mechModel = fbx;
        resolve(fbx);
      });
    });
  },

  // New helper method to standardize material upgrading
  upgradeMaterial(material) {
    // Convert MeshBasicMaterial to MeshStandardMaterial
    if (material.isMeshBasicMaterial) {
      const color = material.color.clone();
      const newMaterial = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.7,
        metalness: 0.3
      });
      
      // Copy relevant properties
      if (material.map) newMaterial.map = material.map;
      if (material.normalMap) newMaterial.normalMap = material.normalMap;
      
      return newMaterial;
    }
    
    // Preserve emissive properties (e.g., for the green glow)
    if (material.emissive) {
      material.emissiveIntensity = material.emissiveIntensity || 1.0; // Ensure intensity isn't zero
    }
    
    // Fix transparency issues (only if needed)
    if (material.transparent && material.opacity < 1.0) {
      material.transparent = true; // Allow transparency if defined
    } else {
      material.transparent = false;
      material.opacity = 1.0;
    }
    
    // Ensure material is properly updated
    material.needsUpdate = true;
    
    return material;
  },

  async init(socket) {
    const playerModel = await this.loadMechModel();
    this.player = playerModel.clone();
    this.player.position.set(0, 0, 0);
    this.targetPosition = new THREE.Vector3(0, 0, 0);
    this.lastPosition = new THREE.Vector3(0, 0, 0);
    SceneManager.add(this.player);

    // Input handling
    document.addEventListener('keydown', (event) => {
      switch (event.key) {
        case 'w': this.moveForward = true; break;
        case 's': this.moveBackward = true; break;
        case 'a': this.moveLeft = true; break;
        case 'd': this.moveRight = true; break;
      }
    });
    document.addEventListener('keyup', (event) => {
      switch (event.key) {
        case 'w': this.moveForward = false; break;
        case 's': this.moveBackward = false; break;
        case 'a': this.moveLeft = false; break;
        case 'd': this.moveRight = false; break;
      }
    });
  },

  createPlayerMesh(id) {
    if (!this.mechModel) {
      console.error("Mech model not loaded yet");
      return null;
    }
    const mesh = this.mechModel.clone();
    mesh.position.set(0, 0, 0);
    mesh.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material = child.material.clone();
          if (child.material.isMeshStandardMaterial) {
            child.material.color.setHex(0xff0000);
          } else {
            const color = child.material.color ? child.material.color : new THREE.Color(0xff0000);
            child.material = new THREE.MeshStandardMaterial({
              color: color,
              roughness: 0.7,
              metalness: 0.3
            });
          }
          child.material.needsUpdate = true;
        }
      }
    });
    return {
      mesh: mesh,
      targetPosition: new THREE.Vector3(0, 0, 0),
      lastPosition: new THREE.Vector3(0, 0, 0)
    };
  },

  processInput(cameraForward) {
    const speed = 0.1;
    let delta = { dx: 0, dy: 0, dz: 0, rotation: 0 }; // Rotation will be set in updateCamera
    let moved = false;

    // Use camera's forward direction (XZ plane only)
    const forward = cameraForward.clone();
    forward.y = 0;
    forward.normalize();

    // Right vector (perpendicular to forward)
    const right = new THREE.Vector3();
    right.crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
    
    // Store current position before updates
    this.lastPosition.copy(this.targetPosition);

    if (this.moveForward) {
      this.targetPosition.add(forward.clone().multiplyScalar(speed));
      delta.dx += forward.x * speed;
      delta.dz += forward.z * speed;
      moved = true;
    }
    if (this.moveBackward) {
      this.targetPosition.sub(forward.clone().multiplyScalar(speed));
      delta.dx -= forward.x * speed;
      delta.dz -= forward.z * speed;
      moved = true;
    }
    if (this.moveLeft) {
      this.targetPosition.add(right.clone().multiplyScalar(speed)); // Left = positive right
      delta.dx += right.x * speed;
      delta.dz += right.z * speed;
      moved = true;
    }
    if (this.moveRight) {
      this.targetPosition.add(right.clone().multiplyScalar(-speed)); // Right = negative right
      delta.dx += right.x * -speed;
      delta.dz += right.z * -speed;
      moved = true;
    }

    // No need to set player.rotation.y here; it's handled in updateCamera
    return moved ? delta : null;
  },

  interpolatePlayers() {
    // Interpolate local player
    if (this.player && this.targetPosition) {
      this.player.position.lerp(this.targetPosition, 0.1);
    }
    
    // Interpolate other players
    for (let id in this.otherPlayers) {
      const player = this.otherPlayers[id];
      player.mesh.position.lerp(player.targetPosition, 0.1);
    }
  }
};