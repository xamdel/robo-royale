import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SceneManager } from './scene.js';
import { weaponSystem } from './weapons/index.js';
import { PlayerAnimations } from './player-animations.js';
import { DebugTools } from './debug-tools.js';
import { WeaponOrientationDebugger } from './debug-tools/weapon-orientation-debugger.js';
import { Network } from './network.js';
import { WeaponSpawnManager } from './weaponSpawnManager.js'; // Import WeaponSpawnManager
import { TerrainGenerator } from './terrainGenerator.js'; // Import TerrainGenerator

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
  weaponSpawnManager: null, // Add property for the manager
  killLog: [], // Added kill log array
  
  // Player stats for HUD
  health: 200, // Initialize to maxHealth
  maxHealth: 200, // Updated to match the intended max health
  isDead: false,
  respawnPosition: new THREE.Vector3(0, 0, 0),
  
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

    this.player.position.set(0, this.player.position.y, 0);
    this.previousPosition = this.player.position.clone();
    
    // Add identifying properties to help with weapon parent checks
    this.player.isPlayerModel = true;
    this.player.name = "PlayerMech";
    
    // Add player to scene after weapon system is initialized
    SceneManager.add(this.player);

    // Initialize and use WeaponSpawnManager
    console.log('[GAME] Initializing WeaponSpawnManager...');
    // Ensure TerrainGenerator is initialized before passing it
    if (!TerrainGenerator.isInitialized) {
        console.error("[GAME] TerrainGenerator not initialized before creating WeaponSpawnManager!");
        // Handle error appropriately, maybe wait or throw
    } else {
        this.weaponSpawnManager = new WeaponSpawnManager(SceneManager, TerrainGenerator);
        console.log('[GAME] Spawning weapon pickups via manager...');
        await this.weaponSpawnManager.spawnWeapons(); // Use the manager to spawn
        console.log('[GAME] Weapon pickups spawned via manager');
    }

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

    // Notify the server about the death. The server should handle weapon dropping & removal.
    console.log("[GAME] Player died. Notifying server...");
    Network.sendPlayerDeath({ killerId: killerPlayerId }); // Assuming Network has this method

    // Client-side cleanup (might be redundant if server confirms removal, but good for immediate feedback)
    // We keep this for now, but the authoritative removal happens server-side.
    if (weaponSystem) {
         console.log("[GAME] Performing client-side weapon removal after death notification.");
         weaponSystem.removeAllPlayerWeapons();
    } else {
        console.warn("[GAME] WeaponSystem not available during handleDeath for client-side cleanup.");
    }

    // NOTE: Spawning dropped weapons is now handled by receiving messages from the server
    // based on the server's authoritative action after processing the death event.
    
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

    // Ensure local weapons are cleared on respawn
    if (weaponSystem) {
        console.log("[GAME] Clearing local weapons on respawn.");
        weaponSystem.removeAllPlayerWeapons();
    } else {
        console.warn("[GAME] WeaponSystem not available during handleRespawn.");
    }
    
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

    // Update weapon spawn manager (for animations like rotation)
    if (this.weaponSpawnManager) {
      this.weaponSpawnManager.update(deltaTime);

      // Check for weapon pickup collisions using the manager
      if (!this.isDead) { // Only check collisions if alive
        const playerWorldPos = new THREE.Vector3();
        this.player.getWorldPosition(playerWorldPos);
        const collidedPickup = this.weaponSpawnManager.checkCollisions(playerWorldPos);

        if (collidedPickup) {
          console.log(`[GAME] Player collided with ${collidedPickup.type} pickup: ${collidedPickup.id}`);
          // Attempt to pick up the weapon
          weaponSystem.pickupWeapon(this.player, collidedPickup.model, collidedPickup.type)
            .then(success => {
              if (success) {
                console.log(`[GAME] Successfully picked up ${collidedPickup.type} (Client-side attachment)`);
                
                // Notify the server that this pickup was collected
                Network.sendPickupCollected({ pickupId: collidedPickup.id }); 

                // Remove the pickup visually immediately on the client
                // The server will broadcast removal to other clients later
                this.weaponSpawnManager.removePickup(collidedPickup.id); 
              } else {
                console.log(`[GAME] Failed to pick up ${collidedPickup.type} (e.g., no mount points available)`);
              }
            }).catch(error => {
              console.error(`[GAME] Error during weapon pickup:`, error);
            });
        }
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

    if (moveVector.lengthSq() > 0 && !this.isDead) {
      moved = true;
      this.player.position.add(moveVector);
      // Adjust player height based on terrain
      const terrainHeight = SceneManager.getTerrainHeight(this.player.position.x, this.player.position.z);
      this.player.position.setY(terrainHeight);
    } else if (!this.isDead) {
      // Ensure player stays on terrain even when not moving (e.g., after respawn)
      const terrainHeight = SceneManager.getTerrainHeight(this.player.position.x, this.player.position.z);
      if (Math.abs(this.player.position.y - terrainHeight) > 0.01) { // Add tolerance
        this.player.position.setY(terrainHeight);
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
