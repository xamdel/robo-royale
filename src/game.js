import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SceneManager } from './scene.js';
import { weaponSystem } from './weapons/index.js';
import { PlayerAnimations } from './player-animations.js';
import { DebugTools } from './debug-tools.js';
import { WeaponOrientationDebugger } from './debug-tools/weapon-orientation-debugger.js';
import { Network } from './network.js';

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
  previousPosition: null,
  weaponOrientationDebugger: null,
  
  // Player stats for HUD
  health: 100,
  maxHealth: 100,
  isDead: false,
  respawnPosition: new THREE.Vector3(0, 0, 0),
  
  // Network and prediction properties
  inputBuffer: [],
  stateHistory: [],
  lastProcessedInputId: 0,
  inputSequence: 0,
  networkUpdateRate: 60, // Updates per second
  lastNetworkUpdate: 0,

  // Constants for client-side prediction (should match server if possible)
  PLAYER_HEIGHT: 1.8,
  PLAYER_RADIUS: 0.5,
  GROUND_CHECK_DISTANCE: 5.0,
  WALL_CHECK_OFFSET: 0.1,
  STEP_HEIGHT: 0.4,
  
  loadMechModel() {
    return new Promise((resolve) => {
      const loader = new GLTFLoader();
      loader.load('assets/models/Mech-norootmotion.glb', (gltf) => {
        const model = gltf.scene;
        console.log('Loaded mech model with animations:', gltf.animations);

        
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
    await this.loadMechModel();
    
    // Create player using the same system as remote players, but specify it's the local player
    const playerData = PlayerAnimations.createPlayerMesh(this.mechModel, this.actions, true);
    this.player = playerData.mesh;
    // In Game.init() after creating player:
    this.player.userData = { id: socket.id };

    // Initialize weapon orientation debugger
    // this.weaponOrientationDebugger = new WeaponOrientationDebugger();
    // Add colliders to the local player's mesh
    this.player.colliders = {
        body: new Collider('capsule', {
            height: 4.0,
            radius: 1,
            offset: new THREE.Vector3(0, 2, 0)
        }),
        cabin: new Collider('sphere', {
            radius: 0.7,
            offset: new THREE.Vector3(0, 4, 0)
        })
    };
    this.mixer = playerData.mixer;
    this.actions = playerData.actions;
    this.currentAction = null;
    
    // Initialize weapon system first
    console.log('[GAME] Initializing weapon system...');
    await weaponSystem.init(this.player);
    
    // Preload all weapon models
    console.log('[GAME] Preloading weapon models...');
    await weaponSystem.weaponFactory.preloadWeaponModels();
    console.log('[GAME] Weapon models preloaded successfully');

    // Set initial position high above the chosen spawn point
    const initialX = 10;
    const initialZ = 10;
    const initialY = 100; // Match server's SPAWN_Y_ABOVE_GROUND
    this.player.position.set(initialX, initialY, initialZ); // Set initial position high
    console.log(`[GAME] Set initial player position high to x=${initialX}, y=${initialY}, z=${initialZ}`);
    this.previousPosition = this.player.position.clone();
    
    // Add identifying properties to help with weapon parent checks
    this.player.isPlayerModel = true;
    this.player.name = "PlayerMech";
    
    // Add player to scene after weapon system is initialized
    SceneManager.add(this.player);

    // Add weapon pickups after weapon system and player are initialized
    console.log('[GAME] Adding weapon pickups to scene...');
    await SceneManager.addWeaponPickups();
    console.log('[GAME] Weapon pickups added to scene');

    // Initialize player stats for HUD
    this.health = this.maxHealth;
    
    // Show welcome messages after a short delay
    setTimeout(() => {
      if (window.HUD) {
        window.HUD.showAlert("MECH SYSTEMS ONLINE", "info");
        setTimeout(() => {
          window.HUD.addMessage("Welcome to Robo Royale. Controls: WASD to move, SHIFT to run.");
          setTimeout(() => {
            window.HUD.addMessage("Left-click to fire when weapon is equipped.");
            setTimeout(() => {
              window.HUD.addMessage("Find the cannon on the battlefield to arm your mech.");
            }, 1500);
          }, 1500);
        }, 1000);
      }
    }, 1000);

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

  },

  handleDeath(killerPlayerId) {
    this.isDead = true;
    
    // Store current position as respawn position
    this.respawnPosition.copy(this.player.position);
    
    // Clear movement states
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.isRunning = false;
    
    // Hide player model (actual hiding is done in the network handler 
    // since we need to sync it with the explosion effect)
  },

  handleRespawn() {
    console.log('Player respawning!');
    this.isDead = false;
    this.health = this.maxHealth;
    
    // Reset position to respawn point
    this.player.position.copy(this.respawnPosition);
    
    // Make player visible again (actual showing is done in the network handler
    // to ensure proper synchronization)
    
    // Clear any pending inputs
    this.inputBuffer = [];
    this.stateHistory = [];
    
    // Add visual effect
    if (window.HUD) {
      window.HUD.showAlert("SYSTEMS REBOOT COMPLETE", "success");
    }
  },

  update(deltaTime) {
    if (!this.mixer || !this.player) {
      console.warn('Update called before initialization completed');
      return null;
    }

    // Update local player's animation mixer
    this.mixer.update(deltaTime);

    // Check for weapon pickups
    if (SceneManager.cannon && SceneManager.cannonCollider) {
      const playerWorldPos = new THREE.Vector3();
      this.player.getWorldPosition(playerWorldPos);
      
      const cannonWorldPos = SceneManager.cannonCollider.center.clone();
      const distanceThreshold = SceneManager.cannonCollider.radius * 1.2;
      const distanceToPlayer = playerWorldPos.distanceTo(cannonWorldPos);
      
      if (distanceToPlayer <= distanceThreshold) {
        weaponSystem.pickupWeapon(this.player, SceneManager.cannon, 'cannon')
          .then(success => {
            if (success) {
              SceneManager.cannonCollider = null;
            }
          });
      }
    }

    if (SceneManager.rocketLauncher && SceneManager.rocketLauncherCollider) {
      const playerWorldPos = new THREE.Vector3();
      this.player.getWorldPosition(playerWorldPos);
      
      const rocketWorldPos = SceneManager.rocketLauncherCollider.center.clone();
      const distanceThreshold = SceneManager.rocketLauncherCollider.radius * 1.2;
      const distanceToPlayer = playerWorldPos.distanceTo(rocketWorldPos);
      
      if (distanceToPlayer <= distanceThreshold) {
        weaponSystem.pickupWeapon(this.player, SceneManager.rocketLauncher, 'rocketLauncher')
          .then(success => {
            if (success) {
              SceneManager.rocketLauncherCollider = null;
            }
          });
      }
    }

    // Update other player animations
    Object.values(this.otherPlayers).forEach(player => {
      if (player.mixer) {
        player.mixer.update(deltaTime);
        
        // Check if the player position has changed, with different thresholds for walking/running
        const movementThreshold = player.isRunning ? 0.03 : 0.01; // Lower threshold for walking
        const positionChanged = player.previousPosition && 
          player.mesh.position.distanceTo(player.previousPosition) > movementThreshold;
        
        // Track the time of the last detected movement
        if (positionChanged) {
          player.lastMovementTime = Date.now();
        }
        
        // Consider a player definitively stopped if no movement for 250ms
        const movementTimeout = 250; // ms
        const hasStoppedMoving = !player.lastMovementTime || 
          (Date.now() - player.lastMovementTime > movementTimeout);
        
        // Updated logic
        let isMoving;
        
        if (player.isMoving) {
          // If server says they're moving, consider them moving until timeout
          isMoving = !hasStoppedMoving || positionChanged;
        } else {
          // If server says they're not moving, still allow local detection of movement
          isMoving = positionChanged && !hasStoppedMoving;
        }
        
        // Update animation using unified system
        PlayerAnimations.updateAnimation(player, isMoving);
        
        // Store position for next frame
        if (player.previousPosition) {
          player.previousPosition.copy(player.mesh.position);
        } else {
          player.previousPosition = player.mesh.position.clone();
        }
      }
    });
    
    weaponSystem.update(deltaTime);

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

    // Add compound colliders
    playerData.mesh.colliders = {
      body: new Collider('capsule', {
        height: 4.0,
        radius: 1,
        offset: new THREE.Vector3(0, 2, 0)
      }),
      cabin: new Collider('sphere', {
        radius: 0.7,
        offset: new THREE.Vector3(0, 4, 0)
      })
    };
    
    // Store player ID on mesh for debugging
    playerData.mesh.playerId = id;
    playerData.mesh.isRemotePlayer = true;
    
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
      player.isMoving = false;
      player.lastMovementTime = 0; // Initialize movement timestamp
      
      // Create a dedicated mount manager for this remote player
      console.log(`Creating dedicated mount manager for remote player ${playerData.id}`);
      const MountManager = weaponSystem.mountManager.constructor; // Get the MountManager class
      player.mountManager = new MountManager();
      const mountsInitialized = player.mountManager.initMounts(player.mesh);
      console.log(`Mount initialization for remote player result: ${mountsInitialized}`);
      
      // Request weapon data for this player
      if (Network.socket && Network.socket.connected) {
        console.log(`Requesting weapon data for player ${playerData.id}`);
        Network.socket.emit('requestPlayerWeapons', {
          playerId: playerData.id
        });
      }
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
      
      // Track previous movement state
      const wasMoving = player.isMoving;
      
      // Calculate if player is actually moving based on state
      player.isMoving = (
        playerData.moveState.moveForward || 
        playerData.moveState.moveBackward || 
        playerData.moveState.moveLeft || 
        playerData.moveState.moveRight
      );
      
      // If movement state changes from moving to stopped, force animation update
      if (wasMoving && !player.isMoving) {
        // Reset last movement time to force idle animation immediately
        player.lastMovementTime = 0;
      }
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
    // Don't process input if player is dead
    if (this.isDead) {
      return null;
    }

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
      let finalPredictedPos = this.player.position.clone(); // Start with current position

      // Ensure collision mesh is loaded before attempting prediction raycasts
      if (SceneManager.collisionMesh && moveVector.lengthSq() > 0.0001 && !this.isDead) { // Use a small threshold
        moved = true;
        let potentialNextPos = this.player.position.clone().add(moveVector);

        // Find actual ground below current position for accurate step check
        let actualCurrentGroundY = -Infinity;
        const currentGroundRayOrigin = this.player.position.clone();
        currentGroundRayOrigin.y += 0.1; // Start slightly above current pos
        const currentGroundRayDir = new THREE.Vector3(0, -1, 0);
        const currentGroundIntersects = SceneManager.performRaycast(currentGroundRayOrigin, currentGroundRayDir, this.GROUND_CHECK_DISTANCE * 2); // Use longer distance just in case
        if (currentGroundIntersects.length > 0) {
            actualCurrentGroundY = currentGroundIntersects[0].point.y;
        } else {
             // If no ground found below current pos, use current player Y as fallback
             // This might happen if player is genuinely falling
             actualCurrentGroundY = this.player.position.y;
             console.warn("Client prediction: No ground found below current player position.");
        }


        // --- Client-Side Prediction ---
        // 1. Ground Check for the *next* position
        const groundRayOrigin = potentialNextPos.clone();
        groundRayOrigin.y += this.STEP_HEIGHT + 0.1; // Start ray slightly above step height
        const groundRayDir = new THREE.Vector3(0, -1, 0);
        const groundIntersects = SceneManager.performRaycast(groundRayOrigin, groundRayDir, this.GROUND_CHECK_DISTANCE);

        let foundGround = false;
        if (groundIntersects.length > 0) {
          const groundY = groundIntersects[0].point.y;
          // Use actualCurrentGroundY for step height check
          const heightDiff = groundY - actualCurrentGroundY;

           if (heightDiff <= this.STEP_HEIGHT) {
               // Valid step or flat ground
               // Assume origin is at feet
               potentialNextPos.y = groundY;
               foundGround = true;
           } else {
               // Trying to step up too high, invalidate horizontal move for now
              potentialNextPos.x = this.player.position.x;
              potentialNextPos.z = this.player.position.z;
              // Keep player at current ground height
              potentialNextPos.y = this.player.position.y;
              foundGround = true; // Technically found ground, but step was too high
          }
      } else {
          // No ground found - potentially falling? Revert Y for now.
          // A proper implementation would handle gravity/falling state.
          potentialNextPos.y = this.player.position.y;
          // Optionally invalidate horizontal move if falling is not desired
          // potentialNextPos.x = this.player.position.x;
          // potentialNextPos.z = this.player.position.z;
      }

      // 2. Wall Check (only if ground check didn't invalidate horizontal)
      const horizontalMoveVec = potentialNextPos.clone().sub(this.player.position);
      horizontalMoveVec.y = 0;
      const horizontalDist = horizontalMoveVec.length();

      if (foundGround && horizontalDist > 0.01) {
          const horizontalDir = horizontalMoveVec.normalize();
          const wallRayOrigin = this.player.position.clone();
          wallRayOrigin.y = potentialNextPos.y; // Use the Y determined by ground check
          wallRayOrigin.add(horizontalDir.clone().multiplyScalar(this.WALL_CHECK_OFFSET)); // Offset slightly

          const wallIntersects = SceneManager.performRaycast(wallRayOrigin, horizontalDir, horizontalDist + this.WALL_CHECK_OFFSET);

          if (wallIntersects.length > 0 && wallIntersects[0].distance <= horizontalDist) {
               // Hit wall, stop just before it
               const stopDist = wallIntersects[0].distance - this.WALL_CHECK_OFFSET * 1.1;
               potentialNextPos = wallRayOrigin.add(horizontalDir.multiplyScalar(Math.max(0, stopDist))); // Move up to just before hit
               // Assume origin is at feet
               potentialNextPos.y = foundGround ? groundIntersects[0].point.y : this.player.position.y; // Ensure Y is correct
           }
       }
      // --- End Client-Side Prediction ---

      finalPredictedPos.copy(potentialNextPos);
      this.player.position.copy(finalPredictedPos); // Update visual model position

    } else if (SceneManager.collisionMesh && !moved && !this.isDead) { // Check collisionMesh here too
       // If not moving, still perform a ground check to stick to ground
       const groundRayOrigin = this.player.position.clone();
       groundRayOrigin.y += 0.1;
       const groundRayDir = new THREE.Vector3(0, -1, 0);
        const groundIntersects = SceneManager.performRaycast(groundRayOrigin, groundRayDir, this.GROUND_CHECK_DISTANCE);
        if (groundIntersects.length > 0) {
            const groundY = groundIntersects[0].point.y;
            // Assume origin is at feet
            finalPredictedPos.y = groundY;
            this.player.position.y = finalPredictedPos.y; // Stick to ground
        }
     }


    this.stateHistory.push({
      inputId: input.id,
      position: this.player.position.clone(),
      rotation: this.player.quaternion.clone(),
      timestamp: Date.now()
    });

    if (this.stateHistory.length > 60) this.stateHistory.shift();

    // Use the unified animation system
    PlayerAnimations.updateAnimation(this, moved);

    // Send the *predicted* position to the server for validation
    let moveData = null; // Initialize moveData to null
    if (moved) { // Only create and assign if the player moved
      moveData = {
        inputId: input.id,
        position: finalPredictedPos.clone(), // Send the final predicted position
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
    };
  }
    // Update previous position
    if (moved) this.previousPosition.copy(this.player.position);

    return moveData;
  },

  isRemotePlayer(player) {
    // Check if this player is in our otherPlayers map
    return Object.values(this.otherPlayers).some(p => p.mesh === player);
  },
};

class Collider {
  constructor(type, params) {
    this.type = type; // 'capsule' or 'sphere'
    this.params = params;
    // For capsule: height, radius, offset
    // For sphere: radius, offset
  }
}
