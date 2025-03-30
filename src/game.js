import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SceneManager } from './scene.js';
import { weaponSystem } from './weapons/index.js';
import { PlayerAnimations } from './player-animations.js';
import { NameTagSystem } from './systems/NameTagSystem.js'; // Import NameTagSystem
import { DebugTools } from './debug-tools.js';
import { WeaponOrientationDebugger } from './debug-tools/weapon-orientation-debugger.js';
import { Network } from './network.js';
import { WeaponSpawnManager } from './weaponSpawnManager.js'; // Import WeaponSpawnManager
import { TerrainGenerator } from './terrainGenerator.js'; // Import TerrainGenerator
import { HUD } from './hud/index.js';
import { CollisionSystem } from './collision/CollisionSystem.js'; // Import CollisionSystem
import { ObjectColliders } from './collision/ObjectColliders.js'; // Import ObjectColliders
import { CylinderCollider, SphereCollider } from './collision/CollisionPrimitives.js'; // Import specific colliders

export const Game = {
  player: null,
  collisionSystem: null, // Add CollisionSystem instance
  objectColliders: null, // Add ObjectColliders instance
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

  // State for 'E' key hold interaction
  isHoldingE: false,
  eKeyDownTime: 0,
  pickupTarget: null, // Stores info about the pickup item being targeted
  contextMenuActive: false,
  eKeyHoldTimeout: null,
  holdThreshold: 250, // ms to hold 'E' before context menu appears
  isContextMenuActive: false, // Flag to disable camera controls
  
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
    
    // Initialize weapon system first
    console.log('[GAME] Initializing weapon system...');
    await weaponSystem.init(this.player);

    // NOW initialize the debugger, ensuring mountManager exists
    // this.weaponOrientationDebugger = new WeaponOrientationDebugger();

    // Preload all weapon models
    console.log('[GAME] Preloading weapon models...');
    await weaponSystem.weaponFactory.preloadWeaponModels();
    console.log('[GAME] Weapon models preloaded successfully');

    // Add colliders to the local player's mesh
    // Note: Using offset as the initial position relative to the player model origin.
    // The CollisionSystem might need to update world positions based on player movement.
    this.player.colliders = {
        body: new CylinderCollider(
            new THREE.Vector3(0, 0, 0), // Base position (offset will be handled by ObjectColliders/CollisionSystem)
            1,  // radius
            4.0 // height
            // TODO: Verify how offset should be applied. Assuming ObjectColliders handles it.
        ),
        cabin: new SphereCollider(
            new THREE.Vector3(0, 4, 0), // Center position (using offset directly for sphere center)
            0.7 // radius
        )
    };
    // Assign the offsets separately if needed by the system later
    this.player.colliders.body.offset = new THREE.Vector3(0, 0, 0); // Cylinder base at origin
    this.player.colliders.cabin.offset = new THREE.Vector3(0, 4, 0);

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
    
    // Initialize Collision System (after TerrainGenerator is ready)
    // NOTE: CollisionSystem and ObjectColliders are now initialized in main.js
    //       and assigned to Game.collisionSystem and Game.objectColliders externally.
    if (this.collisionSystem && this.objectColliders) {
        console.log('[GAME] CollisionSystem and ObjectColliders already initialized by main.js.');
        // TODO: Call registration methods AFTER objects are created
        // Example placeholders (actual calls might be in main.js or scene.js):
      // if (EnvironmentalObjectSystem.isInitialized) {
      //   this.objectColliders.registerTreeColliders(EnvironmentalObjectSystem.instancedTrees);
      //   this.objectColliders.registerRockColliders(EnvironmentalObjectSystem.instancedRocks);
      // }
      // Building registration would happen individually as they are placed.

    } else {
        console.error("[GAME] CollisionSystem or ObjectColliders not initialized by main.js before Game.init().");
    }


    // Initialize HUD
    HUD.init();
    
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
        
        // Handle 'E' key down for pickup / context menu
        case 'KeyE':
          if (!this.isHoldingE) { // Prevent multiple triggers if held
            this.handlePickupKeyDown();
          }
          break;
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
        
        // Handle 'E' key release for pickup / context menu selection
        case 'KeyE':
          this.handlePickupKeyUp();
          break;
      }
    });

  },

  // Handles 'E' key down event
  handlePickupKeyDown() {
    // Log the state of the early exit conditions
    // console.log(`[GAME.handlePickupKeyDown] Checking conditions: isDead=${this.isDead}, playerExists=${!!this.player}, spawnManagerExists=${!!this.weaponSpawnManager}, weaponSystemExists=${!!weaponSystem}`); // Removed log
    if (this.isDead || !this.player || !this.weaponSpawnManager || !weaponSystem) {
        // console.warn("[GAME.handlePickupKeyDown] Early exit triggered."); // Removed log
        return;
    }

    this.isHoldingE = true;
    this.eKeyDownTime = Date.now();
    this.pickupTarget = null; // Reset target
    this.contextMenuActive = false; // Reset menu state
    clearTimeout(this.eKeyHoldTimeout); // Clear previous timeout

    const playerWorldPos = new THREE.Vector3();
    this.player.getWorldPosition(playerWorldPos);
    // console.log(`[GAME.handlePickupKeyDown] Player world position:`, playerWorldPos.toArray()); // Removed log
    const pickupRange = 4.0; // Increased pickup range
    const nearestPickup = this.weaponSpawnManager.findNearestPickup(playerWorldPos, pickupRange);

    if (nearestPickup) {
      this.pickupTarget = nearestPickup; // Store the target pickup
      // console.log(`[GAME] Targeting pickup: Type=${this.pickupTarget.type}, ID=${this.pickupTarget.id}`); // Removed log

      // Set timeout to show context menu if key is still held
      this.eKeyHoldTimeout = setTimeout(() => {
        if (this.isHoldingE && this.pickupTarget) { // Check if still holding and target is valid
           console.log("[GAME] Hold threshold met, showing context menu.");
           this.contextMenuActive = true;
           this.isContextMenuActive = true; // Disable camera controls
           // Use standard document method to exit pointer lock
           if (document.pointerLockElement === document.body) {
             document.exitPointerLock(); 
             console.log("[GAME] Exited PointerLock for context menu.");
           }
           if (window.HUD && window.HUD.showWeaponContextMenu) {
             // Pass mouse position (or center screen?), ALL mounts, and pickup info
            // For now, let's assume HUD centers it or uses mouse pos internally
            const allMounts = weaponSystem.mountManager.getAllMounts(); // Get all mounts
            window.HUD.showWeaponContextMenu(null, allMounts, this.pickupTarget); // Pass all mounts
          } else {
             console.error("[GAME] HUD or showWeaponContextMenu not available!");
          }
        }
      }, this.holdThreshold);
    } else {
       console.log("[GAME] 'E' pressed, but no pickups nearby.");
       // No target, so key hold won't do anything further
    }
  },

  // Handles 'E' key up event
  async handlePickupKeyUp() {
    if (!this.isHoldingE) return; // Ignore if not holding

    clearTimeout(this.eKeyHoldTimeout); // Clear the timeout regardless

    if (this.contextMenuActive) {
      // --- Context Menu Selection Logic ---
      console.log("[GAME] 'E' released while context menu active.");
      if (window.HUD && window.HUD.getSelectedMountFromContextMenu) {
        const selectedMountId = window.HUD.getSelectedMountFromContextMenu();
        if (selectedMountId && this.pickupTarget) {
          // console.log(`[GAME] Context menu selected mount: ${selectedMountId} for pickup ID: ${this.pickupTarget.id}`); // Removed log

          // Check if the selected mount is currently occupied
          const targetMount = weaponSystem.mountManager.getMountPoint(selectedMountId);
          let droppedWeapon = null;
          if (targetMount && targetMount.hasWeapon()) {
            console.log(`[GAME] Target mount ${selectedMountId} is occupied. Detaching and dropping current weapon.`);
            droppedWeapon = await weaponSystem.detachAndDropWeapon(selectedMountId);
            // Small delay to ensure detach completes before attach (optional, might not be needed)
            // await new Promise(resolve => setTimeout(resolve, 10)); 
          }

          // Attempt to attach the new weapon (pickupTarget.type) to the selected mount
          const attachSuccess = await weaponSystem.attachToSpecificMount(this.pickupTarget.type, selectedMountId);
          
          if (attachSuccess) {
            console.log(`[GAME] Successfully attached ${this.pickupTarget.type} to mount ${selectedMountId}.`);
            // Remove the *original pickup item* from the world
            const pickupIdToRemove = this.pickupTarget.id; // Get the ID from the target
            // console.log(`[GAME] Removing pickup item with ID: ${pickupIdToRemove}`); // Removed log
            this.weaponSpawnManager.removePickup(pickupIdToRemove); // Remove locally

            // Only notify server if it was a dropped item (starts with 'pickup_')
            if (pickupIdToRemove && pickupIdToRemove.startsWith('pickup_')) {
                // console.log(`[GAME] Sending pickup collected for dropped item ID: ${pickupIdToRemove}`); // Removed log
                Network.sendPickupCollected({ pickupId: pickupIdToRemove });
            } else {
                 // console.log(`[GAME] Initial spawn item ${pickupIdToRemove} collected via context menu, no server notification needed.`); // Removed log
            }
          } else {
            console.warn(`[GAME] Failed to attach ${this.pickupTarget.type} to specific mount ${selectedMountId}.`);
            if (window.HUD) window.HUD.showAlert("SELECTED MOUNT UNAVAILABLE", "warning");
          }
        } else {
          console.log("[GAME] No mount selected from context menu or no pickup target.");
        }
      } else {
         console.error("[GAME] HUD or getSelectedMountFromContextMenu not available!");
      }
      // Hide context menu
       if (window.HUD && window.HUD.hideWeaponContextMenu) {
         window.HUD.hideWeaponContextMenu();
       }
       this.contextMenuActive = false;
       this.isContextMenuActive = false; // Re-enable camera controls
       // No need to explicitly re-lock; user click will handle it.

     } else if (this.pickupTarget) {
      // --- Quick Press (Auto-Attach) Logic ---
      // console.log(`[GAME] 'E' released quickly (before context menu), attempting auto-attach for pickup ID: ${this.pickupTarget.id}`); // Removed log
      // Attempt to pick up and attach using the automatic priority logic
      try {
          // Pass the full pickupTarget object which includes the ID
          const success = await weaponSystem.tryPickupAndAttach(this.pickupTarget);
          if (success) {
            // console.log(`[GAME] Quick pickup successful via tryPickupAndAttach for ${this.pickupTarget.type} (ID: ${this.pickupTarget.id})`); // Removed log
          } else {
            // console.log(`[GAME] Quick pickup failed via tryPickupAndAttach for ${this.pickupTarget.type} (ID: ${this.pickupTarget.id}) (e.g., no suitable mounts)`); // Removed log
          }
      } catch (error) {
          console.error(`[GAME] Error during quick pickup tryPickupAndAttach:`, error);
      }
    } else {
       // Key released, but no pickup was targeted (e.g., pressed 'E' with nothing nearby)
       console.log("[GAME] 'E' released, but no pickup was targeted.");
    }

    // Reset state
    this.isHoldingE = false;
    this.pickupTarget = null;
     // contextMenuActive is already reset above
     this.isContextMenuActive = false; // Ensure camera controls are re-enabled
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

      // Collision-based pickup logic removed - will be replaced by 'E' key interaction
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

        // Update name tag position
        NameTagSystem.updateTagPosition(player.mesh.playerId, player.mesh);
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
    // Note: Using offset as the initial position relative to the player model origin.
    playerData.mesh.colliders = {
      body: new CylinderCollider(
        new THREE.Vector3(0, 0, 0), // Base position
        1,  // radius
        4.0 // height
      ),
      cabin: new SphereCollider(
        new THREE.Vector3(0, 4, 0), // Center position
        0.7 // radius
      )
    };
    // Assign the offsets separately
    playerData.mesh.colliders.body.offset = new THREE.Vector3(0, 0, 0); // Cylinder base at origin
    playerData.mesh.colliders.cabin.offset = new THREE.Vector3(0, 4, 0);

    // Store player ID on mesh for debugging
    playerData.mesh.playerId = id;
    playerData.mesh.isRemotePlayer = true;
    
    // Add to scene
    SceneManager.add(playerData.mesh);
    
    return playerData;
  },

  updateOtherPlayer(playerData) {
    // console.log(`[GAME] updateOtherPlayer called for ID: ${playerData.id}`, playerData); // Removed log
    let player = this.otherPlayers[playerData.id];
    
    if (!player) {
      // Create new player
      player = this.createPlayerMesh(playerData.id);
      if (!player) return;
      
      this.otherPlayers[playerData.id] = player;
      player.previousPosition = new THREE.Vector3();
      player.isMoving = false;
      player.lastMovementTime = 0; // Initialize movement timestamp

      // Add name tag for the new player
      // console.log(`[GAME] Received update for player ${playerData.id}. Data:`, playerData); // Removed log
      if (playerData.name) { // Check if name exists
        // console.log(`[GAME] Creating name tag for ${playerData.id} with name "${playerData.name}"`); // Removed log
        NameTagSystem.addTag(playerData.id, playerData.name);
      } else {
        console.warn(`[GAME] Player data for ${playerData.id} missing name, cannot create tag.`);
      }
      
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
    const playerCollisionRadius = 1.0; // Define player collision radius

    if (moveVector.lengthSq() > 0 && !this.isDead) {
        moved = true;
        const currentPosition = this.player.position.clone();
        const desiredPosition = currentPosition.add(moveVector);

        // --- Collision Detection & Resolution ---
        let finalPosition = desiredPosition;
        if (this.collisionSystem) {
            // 1. Check for collisions at the desired position
            const collisions = this.collisionSystem.checkPlayerCollision(
                desiredPosition,
                playerCollisionRadius
            );

            // 2. Resolve collisions if any occurred
            if (collisions.length > 0) {
                // Resolve collisions using the original position and the desired position
                // The function will modify desiredPosition if resolution occurs.
                this.collisionSystem.resolvePlayerCollision(
                    currentPosition, // Pass the position *before* movement
                    desiredPosition, // Pass the desired position (will be modified)
                    playerCollisionRadius,
                    collisions
                );
                finalPosition = desiredPosition; // Use the (potentially modified) desired position
                 // console.log(`[GAME] Collision detected. Original: ${currentPosition.add(moveVector).toArray()}, Resolved: ${finalPosition.toArray()}`);
            }
        } else {
             console.warn("[GAME] CollisionSystem not initialized, skipping object collision check.");
        }
        // --- End Collision ---

        // Apply the (potentially resolved) final position
        this.player.position.copy(finalPosition);

        // Adjust player height based on terrain AFTER resolving horizontal collisions
        // TODO: Replace SceneManager.getTerrainHeight with TerrainGenerator.getTerrainInfo if available
        const terrainHeight = SceneManager.getTerrainHeight(this.player.position.x, this.player.position.z);
        this.player.position.setY(terrainHeight); // Assuming player base should be on terrain

    } else if (!this.isDead) {
        // Ensure player stays on terrain even when not moving
        // TODO: Replace SceneManager.getTerrainHeight
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

// Remove the old simple Collider class if it exists at the end of the file
// class Collider {
//   constructor(type, params) {
//     this.type = type; // 'capsule' or 'sphere'
//     this.params = params;
//     // For capsule: height, radius, offset
//     // For sphere: radius, offset
//   }
// }
