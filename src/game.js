import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
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
      const loader = new FBXLoader();
      loader.load('assets/models/gemini-mech.fbx', (fbx) => {
        fbx.scale.set(5, 5, 5)
        fbx.position.y = 0.1;

        // Ensure the model faces -Z (Three.js forward)
        // fbx.rotation.y = Math.PI; 
        // Rotate 180 if front is +Z in the FBX

        fbx.traverse((child) => {
          if (child.isMesh) {
            // Shadow settings
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        // Initialize animation mixer
        this.mixer = new THREE.AnimationMixer(fbx);
        this.mechModel = fbx;
        resolve(fbx);
      });
    });
  },

  loadAnimation(animationPath, name) {
    return new Promise((resolve) => {
      const loader = new FBXLoader();
      loader.load(animationPath, (anim) => {
        const action = this.mixer.clipAction(anim.animations[0]);
        this.actions[name] = action;
        resolve(action);
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

    // Initialize actions
    this.actions = {};

    // Load walking animation (adjust path as needed)
    await this.loadAnimation('assets/animations/Walk.fbx', 'walk');
    
    // Set up initial state
    this.actions.walk.setLoop(THREE.LoopRepeat);
    this.currentAction = this.actions.walk;

    // Input handling
    document.addEventListener('keydown', (event) => {
      switch (event.key) {
        case 'w': this.moveForward = true; break;
        case 's': this.moveBackward = true; break;
        case 'a': this.moveLeft = true; break;
        case 'd': this.moveRight = true; break;
        this.updateAnimation();
      }
    });
    document.addEventListener('keyup', (event) => {
      switch (event.key) {
        case 'w': this.moveForward = false; break;
        case 's': this.moveBackward = false; break;
        case 'a': this.moveLeft = false; break;
        case 'd': this.moveRight = false; break;
        this.updateAnimation();
      }
    });
  },

  updateAnimation(isMoving) {
    if (isMoving && this.currentAction !== this.actions.walk) {
      if (this.currentAction) this.currentAction.fadeOut(0.2);
      this.actions.walk.reset().fadeIn(0.2).play();
      this.currentAction = this.actions.walk;
    } else if (!isMoving && this.currentAction === this.actions.walk) {
      this.actions.walk.fadeOut(0.2);
      this.currentAction = null;
    }
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
    const mixer = new THREE.AnimationMixer(mesh);
    return {
      mesh: mesh,
      mixer: mixer,
      targetPosition: new THREE.Vector3(0, 0, 0),
      lastPosition: new THREE.Vector3(0, 0, 0),
      actions: {},
      currentAction: null
    };
  },

  // Add update method to handle animation timing
  update(deltaTime) {
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }
    
    // Update other players' animations
    for (let id in this.otherPlayers) {
      const player = this.otherPlayers[id];
      if (player.mixer) {
        player.mixer.update(deltaTime);
      }
    }
  },

  processInput(cameraForward, deltaTime) {
    const baseSpeed = 5.0;
    const speed = baseSpeed * deltaTime;
    
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

    const delta = this.calculateMovementDelta(input, speed);
    
    if (delta.moved) {
      this.lastPosition.copy(this.player.position);
      
      this.inputHistory.push({
        input: input,
        delta: delta
      });
      
      if (this.inputHistory.length > 60) {
        this.inputHistory.shift();
      }

      // Update animation state
      this.updateAnimation(delta.moved);
      
      // Calculate facing direction
      const movementDirection = new THREE.Vector3(delta.dx, 0, delta.dz).normalize();
      if (movementDirection.length() > 0) {
        const angle = Math.atan2(movementDirection.x, movementDirection.z);
        this.player.rotation.y = angle;
      }
    } else {
      this.updateAnimation(false);
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
