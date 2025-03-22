import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SceneManager } from './scene.js';
import { WeaponManager } from './weapons.js';
import { PlayerAnimations } from './player-animations.js';
import { DebugTools } from './debug-tools.js';

export const Game = {
  player: null,
  otherPlayers: {},
  moveForward: false,
  moveBackward: false,
  moveLeft: false,
  moveRight: false,
  isRunning: false,
  mechModel: null,
  mixer: null,
  actions: {},
  currentAction: null,
  leftArm: null,
  cannonAttached: false,
  previousPosition: null,
  
  // Network and prediction properties
  inputBuffer: [],
  stateHistory: [],
  lastProcessedInputId: 0,
  inputSequence: 0,
  networkUpdateRate: 60, // Updates per second
  lastNetworkUpdate: 0,
  
  loadMechModel() {
    return new Promise((resolve) => {
      const loader = new GLTFLoader();
      loader.load('assets/models/Mech-norootmotion.glb', (gltf) => {
        const model = gltf.scene;
        console.log('Loaded mech model with animations:', gltf.animations);

        // Find left arm using debug tools
        this.leftArm = DebugTools.findLeftArm(model);
        
        // Set up animations
        this.mixer = new THREE.AnimationMixer(model);
        this.actions = {};
        
        gltf.animations.forEach((clip) => {
          const action = this.mixer.clipAction(clip);
          this.actions[clip.name] = action;
          console.log(`Registered animation action: ${clip.name}`);
        });

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        this.mechModel = model;
        resolve(model);
      });
    });
  },

  async init(socket) {
    const playerModel = await this.loadMechModel();
    this.player = playerModel;
    this.player.position.set(0, playerModel.position.y, 0);
    this.previousPosition = this.player.position.clone(); // Initialize
    SceneManager.add(this.player);
    
    // Set up animation looping
    Object.values(this.actions).forEach(action => {
      if (action) {
        action.setLoop(THREE.LoopRepeat);
      }
    });
    this.currentAction = null;

    // Input handling
    document.addEventListener('keydown', (event) => {
      switch (event.code) {
        case 'KeyW': this.moveForward = true; break;
        case 'KeyS': this.moveBackward = true; break;
        case 'KeyA': this.moveLeft = true; break;
        case 'KeyD': this.moveRight = true; break;
        case 'ShiftLeft':
        case 'ShiftRight': this.isRunning = true; break;
      }
    });
    document.addEventListener('keyup', (event) => {
      switch (event.code) {
        case 'KeyW': this.moveForward = false; break;
        case 'KeyS': this.moveBackward = false; break;
        case 'KeyA': this.moveLeft = false; break;
        case 'KeyD': this.moveRight = false; break;
        case 'ShiftLeft':
        case 'ShiftRight': this.isRunning = false; break;
      }
    });

    // Add mouse click handler for shooting
    document.addEventListener('mousedown', (event) => {
      if (event.button === 0 && this.cannonAttached) { // Left click
        WeaponManager.fireWeapon(this.player);
      }
    });
  },

  update(deltaTime) {
    if (!this.mixer || !this.player) {
      console.warn('Update called before initialization completed');
      return null;
    }

    const now = Date.now();
    // Check for cannon pickup
    if (SceneManager.cannon && SceneManager.cannonCollider && !this.cannonAttached) {
      const playerWorldPos = new THREE.Vector3();
      this.player.getWorldPosition(playerWorldPos);
      
      const cannonWorldPos = SceneManager.cannonCollider.center.clone();
      const distanceThreshold = SceneManager.cannonCollider.radius * 1.2;
      const distanceToPlayer = playerWorldPos.distanceTo(cannonWorldPos);
      
      if (distanceToPlayer <= distanceThreshold) {
        console.log('Player in range of cannon, attempting to attach...');
        if (this.leftArm) {
          SceneManager.cannonAttached = true;
          const success = WeaponManager.attachWeaponToSocket(this.player, SceneManager.cannon, 'leftArm', 'cannon');
          if (success) {
            SceneManager.cannonCollider = null;
            this.cannonAttached = true;
          }
        }
      }
    }

    // Update animations
    this.mixer.update(deltaTime);
    WeaponManager.updateProjectiles(deltaTime);
    
    // Update other player animations
    Object.values(this.otherPlayers).forEach(player => {
      if (player.mixer) {
        player.mixer.update(deltaTime);
        
        // Check if the player position has changed significantly
        const positionChanged = player.previousPosition && 
          player.mesh.position.distanceTo(player.previousPosition) > 0.03;
        
        // A player is moving if either their state says so OR their position changed
        const isMoving = player.isMoving || positionChanged;
        
        // Update animation based on move state and actual position change
        PlayerAnimations.updatePlayerAnimation(player, isMoving);
        
        // Store position for next frame
        if (player.previousPosition) {
          player.previousPosition.copy(player.mesh.position);
        } else {
          player.previousPosition = player.mesh.position.clone();
        }
      }
    });
    
    // Update camera and process input
    const cameraDirections = SceneManager.updateCamera(this.player.position, this.player);
    return this.processInput(cameraDirections, deltaTime);
  },

  createPlayerMesh(id) {
    if (!this.mechModel) {
      console.error("Mech model not loaded yet");
      return null;
    }
    
    const playerData = PlayerAnimations.createPlayerMesh(this.mechModel, this.actions);
    
    // Add collision sphere (radius 2 units)
    playerData.mesh.collider = new THREE.Sphere(
      new THREE.Vector3(),
      2.0
    );
    
    // Add to scene
    SceneManager.add(playerData.mesh);
    
    return playerData;
  },

  updateOtherPlayer(playerData) {
    let player = this.otherPlayers[playerData.id];
    
    if (!player) {
      // Create new player
      player = this.createPlayerMesh(playerData.id);
      if (!player) return;
      
      this.otherPlayers[playerData.id] = player;
      player.previousPosition = new THREE.Vector3();
      player.isMoving = false; // Add movement tracking flag
    }
    
    // Store previous position for movement detection
    if (player.mesh) {
      if (!player.previousPosition) {
        player.previousPosition = player.mesh.position.clone();
      } else {
        player.previousPosition.copy(player.mesh.position);
      }
    }
    
    // Update target position/rotation for interpolation
    player.targetPosition = new THREE.Vector3(
      playerData.position.x,
      playerData.position.y,
      playerData.position.z
    );
    
    player.targetRotation = new THREE.Quaternion(
      playerData.rotation.x,
      playerData.rotation.y,
      playerData.rotation.z,
      playerData.rotation.w
    );

    // Update movement state for animations
    if (playerData.moveState) {
      player.moveForward = playerData.moveState.moveForward;
      player.moveBackward = playerData.moveState.moveBackward;
      player.moveLeft = playerData.moveState.moveLeft;
      player.moveRight = playerData.moveState.moveRight;
      player.isRunning = playerData.moveState.isRunning;
      
      // Calculate if player is actually moving based on state
      player.isMoving = (
        playerData.moveState.moveForward || 
        playerData.moveState.moveBackward || 
        playerData.moveState.moveLeft || 
        playerData.moveState.moveRight
      );
    }
    
    return player;
  },

  // Apply input without side effects
  applyInput(input, cameraDirections) {
    const { forward, right } = cameraDirections;
    let speed = 5.0 * input.deltaTime;
    if (input.isRunning) {
      speed *= 2;
    }
    
    // Calculate movement vector based on input
    const moveVector = new THREE.Vector3();
    
    if (input.moveForward) moveVector.add(forward.clone().multiplyScalar(speed));
    if (input.moveBackward) moveVector.add(forward.clone().multiplyScalar(-speed));
    if (input.moveLeft) moveVector.add(right.clone().multiplyScalar(-speed));
    if (input.moveRight) moveVector.add(right.clone().multiplyScalar(speed));
    
    return moveVector;
  },

  processInput(cameraDirections, deltaTime) {
    const input = {
      id: this.inputSequence++,
      deltaTime: deltaTime,
      moveForward: this.moveForward,
      moveBackward: this.moveBackward,
      moveLeft: this.moveLeft,
      moveRight: this.moveRight,
      isRunning: this.isRunning,
      timestamp: Date.now()
    };

    this.inputBuffer.push(input);

    const moveVector = this.applyInput(input, cameraDirections);
    let moved = false;

    if (moveVector.lengthSq() > 0) {
      moved = true;
      this.player.position.add(moveVector);
      this.player.position.setY(0);
    }

    this.stateHistory.push({
      inputId: input.id,
      position: this.player.position.clone(),
      rotation: this.player.quaternion.clone(),
      timestamp: Date.now()
    });

    if (this.stateHistory.length > 60) this.stateHistory.shift();

    PlayerAnimations.updatePlayerAnimation(this, moved);

    const moveData = moved ? {
      inputId: input.id,
      position: this.player.position.clone(),
      rotation: {
        x: this.player.quaternion.x,
        y: this.player.quaternion.y,
        z: this.player.quaternion.z,
        w: this.player.quaternion.w
      },
      timestamp: input.timestamp,
      input: {
        moveForward: this.moveForward,
        moveBackward: this.moveBackward,
        moveLeft: this.moveLeft,
        moveRight: this.moveRight,
        isRunning: this.isRunning,
        deltaTime: input.deltaTime
      }
    } : null;

    // Update previous position
    if (moved) this.previousPosition.copy(this.player.position);

    return moveData;
  },
};
