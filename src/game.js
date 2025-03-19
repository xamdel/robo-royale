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
  inputSequence: 0,
  inputHistory: [],

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
          }
        });

        this.mechModel = fbx;
        resolve(fbx);
      });
    });
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

  processInput(cameraForward, deltaTime) {
    // Base speed value - will be multiplied by deltaTime for time-based movement
    const baseSpeed = 5.0; // Units per second
    const speed = baseSpeed * deltaTime;
    
    // Create an input packet that includes current state
    const input = {
      sequence: this.inputSequence++,
      timestamp: performance.now(),
      moveForward: this.moveForward,
      moveBackward: this.moveBackward,
      moveLeft: this.moveLeft,
      moveRight: this.moveRight,
      deltaTime: deltaTime,
      cameraForward: cameraForward.clone()
    };

    // Calculate movement based on current input state
    const delta = this.calculateMovementDelta(input, speed);
    
    if (delta.moved) {
      // Store last position for reconciliation if needed
      this.lastPosition.copy(this.player.position);
      
      // Store the input and calculated delta for possible reconciliation
      this.inputHistory.push({
        input: input,
        delta: delta
      });
      
      // Trim history to avoid memory issues (keep last 60 inputs - about 1 second)
      if (this.inputHistory.length > 60) {
        this.inputHistory.shift();
      }
    }
    
    return delta.moved ? delta : null;
  },
  
  calculateMovementDelta(input, speed) {
    const delta = { 
      dx: 0, 
      dy: 0, 
      dz: 0, 
      rotation: 0,
      moved: false 
    };
    
    // Use camera's forward direction (XZ plane only)
    const forward = input.cameraForward.clone();
    forward.y = 0;
    forward.normalize();

    // Right vector (perpendicular to forward)
    const right = new THREE.Vector3();
    right.crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();

    if (input.moveForward) {
      delta.dx += forward.x * speed;
      delta.dz += forward.z * speed;
      delta.moved = true;
    }
    if (input.moveBackward) {
      delta.dx -= forward.x * speed;
      delta.dz -= forward.z * speed;
      delta.moved = true;
    }
    if (input.moveLeft) {
      delta.dx += right.x * speed;
      delta.dz += right.z * speed;
      delta.moved = true;
    }
    if (input.moveRight) {
      delta.dx -= right.x * speed;
      delta.dz -= right.z * speed;
      delta.moved = true;
    }
    
    return delta;
  },

  applyMovement(delta) {
    if (!delta || !delta.moved) return;
    
    // Apply the movement directly to the player
    this.player.position.x += delta.dx;
    this.player.position.y += delta.dy;
    this.player.position.z += delta.dz;
    
    // Update the target position to match the new position
    this.targetPosition.copy(this.player.position);
  },
  
  // Handle server correction
  handleServerCorrection(serverState) {
    // Find the index of the last acknowledged input
    const lastProcessedIndex = this.inputHistory.findIndex(
      item => item.input.sequence === serverState.lastProcessedInput
    );
    
    if (lastProcessedIndex !== -1) {
      // Remove all processed inputs
      this.inputHistory = this.inputHistory.slice(lastProcessedIndex + 1);
      
      // Apply the server correction
      this.player.position.set(
        serverState.position.x,
        serverState.position.y,
        serverState.position.z
      );
      
      // Reapply all inputs that haven't been processed by the server yet
      this.inputHistory.forEach(item => {
        this.applyMovement(item.delta);
      });
    }
  },

  interpolatePlayers() {
    // Interpolate other players
    for (let id in this.otherPlayers) {
      const player = this.otherPlayers[id];
      player.mesh.position.lerp(player.targetPosition, 0.1);
    }
  }
};