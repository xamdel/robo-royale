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

  // State for 'E' key hold interaction
  isHoldingE: false,
  eKeyDownTime: 0,
  pickupTarget: null, // Stores info about the pickup item being targeted { id, type, weaponType?, model, distance }
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

  async init(socket, playerColor) { // Accept playerColor (singular)
    await this.loadMechModel();

    // Create player using the same system as remote players, but specify it's the local player
    const playerData = PlayerAnimations.createPlayerMesh(this.mechModel, this.actions, true);
    this.player = playerData.mesh;
    // In Game.init() after creating player:
    this.player.userData = { id: socket.id };

    // Apply chosen color to the local player model
    if (playerColor && playerColor.primary) {
      console.log(`[GAME] Applying local player color: P=${playerColor.primary}`);
      this.applyPlayerColor(this.player, playerColor.primary);
    } else {
      console.warn("[GAME] No playerColor provided to Game.init. Using default for local player.");
      // Apply default color if none provided
      this.applyPlayerColor(this.player, '#00ffff');
    }

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
        console.log('[GAME] WeaponSpawnManager initialized.');

        // Check if initial pickup state arrived before manager was ready
        if (Network.pendingInitialPickups) {
            console.log('[GAME] Processing pending initial pickup state...');
            this.weaponSpawnManager.spawnAllPickups(Network.pendingInitialPickups);
            Network.pendingInitialPickups = null; // Clear pending data
        } else {
            console.log('[GAME] Waiting for initial pickup state from server...');
        }
    }

    // Initialize player stats for HUD
    this.health = this.maxHealth;
    
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

      // Set timeout to show context menu *only for weapons* if key is still held
      if (this.pickupTarget.type === 'weapon') {
        this.eKeyHoldTimeout = setTimeout(() => {
          if (this.isHoldingE && this.pickupTarget && this.pickupTarget.type === 'weapon') { // Double check target is still valid weapon
             console.log("[GAME] Hold threshold met for weapon, showing context menu.");
             this.contextMenuActive = true; // This flag indicates the menu *should* be shown
             this.isContextMenuActive = true; // This flag disables camera controls while menu is up
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
      } else if (this.pickupTarget.type === 'ammo') {
        console.log(`[GAME] Targeting pickup: Type=ammo, ID=${this.pickupTarget.id}`);
        // No context menu for ammo boxes
      }
    } else {
       console.log("[GAME] 'E' pressed, but no pickups nearby.");
       // No target, so key hold won't do anything further
    }
  },

  // Handles 'E' key up event
  async handlePickupKeyUp() {
    if (!this.isHoldingE) return; // Ignore if not holding

    clearTimeout(this.eKeyHoldTimeout); // Clear the timeout regardless

    // Check if context menu was active (only possible for weapons)
    if (this.contextMenuActive && this.pickupTarget?.type === 'weapon') {
      // --- Weapon Context Menu Selection Logic ---
      console.log("[GAME] 'E' released while weapon context menu active.");
      if (window.HUD && window.HUD.getSelectedMountFromContextMenu) {
        const selectedMountId = window.HUD.getSelectedMountFromContextMenu();
        if (selectedMountId && this.pickupTarget) { // Ensure pickupTarget still exists
          console.log(`[GAME] Context menu selected mount: ${selectedMountId} for weapon pickup ID: ${this.pickupTarget.id}`);

          // Check if the selected mount is currently occupied
          const targetMount = weaponSystem.mountManager.getMountPoint(selectedMountId);
          let droppedWeapon = null;
          if (targetMount && targetMount.hasWeapon()) {
            console.log(`[GAME] Target mount ${selectedMountId} is occupied. Detaching and dropping current weapon.`);
            droppedWeapon = await weaponSystem.detachAndDropWeapon(selectedMountId);
            // Small delay to ensure detach completes before attach (optional, might not be needed)
            // await new Promise(resolve => setTimeout(resolve, 10)); 
          }

          // Attempt to attach the new weapon (pickupTarget.weaponType) to the selected mount
          const attachSuccess = await weaponSystem.attachToSpecificMount(this.pickupTarget.weaponType, selectedMountId); // Use weaponType

          if (attachSuccess) {
            console.log(`[GAME] Successfully attached ${this.pickupTarget.weaponType} to mount ${selectedMountId}.`);
            // Remove the *original pickup item* from the world
            const pickupIdToRemove = this.pickupTarget.id; // Get the ID from the target
            // console.log(`[GAME] Removing pickup item with ID: ${pickupIdToRemove}`); // Removed log
            this.weaponSpawnManager.removePickup(pickupIdToRemove); // Remove locally

            // Notify server about collecting this specific pickup ID
            // Server will handle removing the item state and notifying others
            console.log(`[GAME] Sending pickup collected network message for ID: ${pickupIdToRemove}`);
            Network.sendPickupCollected({ pickupId: pickupIdToRemove });

          } else {
            console.warn(`[GAME] Failed to attach ${this.pickupTarget.weaponType} to specific mount ${selectedMountId}.`);
            if (window.HUD) window.HUD.showAlert("SELECTED MOUNT UNAVAILABLE", "warning");
          }
        } else {
          console.log("[GAME] No mount selected from context menu or pickup target invalid.");
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

     } else if (this.pickupTarget) { // No context menu was shown, handle quick press
        const pickupId = this.pickupTarget.id;
        const pickupType = this.pickupTarget.type;

        console.log(`[GAME] 'E' released quickly (before context menu), attempting pickup for Type=${pickupType}, ID=${pickupId}`);

        if (pickupType === 'weapon') {
            // --- Quick Press (Weapon Auto-Attach) Logic ---
            try {
                // Pass the full pickupTarget object which includes the ID and weaponType
                const success = await weaponSystem.tryPickupAndAttach(this.pickupTarget);
                if (success) {
                    console.log(`[GAME] Quick weapon pickup successful via tryPickupAndAttach for ${this.pickupTarget.weaponType} (ID: ${pickupId})`);
                    // Note: tryPickupAndAttach handles removing the pickup locally and notifying server
                } else {
                    console.log(`[GAME] Quick weapon pickup failed via tryPickupAndAttach for ${this.pickupTarget.weaponType} (ID: ${pickupId}) (e.g., no suitable mounts)`);
                }
            } catch (error) {
                console.error(`[GAME] Error during quick weapon pickup tryPickupAndAttach:`, error);
            }
        } else if (pickupType === 'ammo') {
            // --- Quick Press (Ammo Box Pickup) Logic ---
            console.log(`[GAME] Attempting to collect ammo box (ID: ${pickupId})`);
            // Send network request to server to collect the ammo box
            Network.sendPickupCollected({ pickupId: pickupId });
            // DO NOT remove the pickup locally here.
            // The removal will be triggered by the 'pickupRemoved' event from the server
            // if the pickup is successful (i.e., player is alive).
            console.log(`[GAME] Sent pickup request for ammo box ${pickupId}. Waiting for server confirmation.`);
        } else {
            console.warn(`[GAME] Unknown pickup type encountered during quick press: ${pickupType}`);
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

      // Apply custom color received from server
      if (playerData.primaryColor) {
        console.log(`Applying color to remote player ${playerData.id}: P=${playerData.primaryColor}`);
        this.applyPlayerColor(player.mesh, playerData.primaryColor);
      } else {
        console.warn(`[GAME] Missing color data for player ${playerData.id}. Using default.`);
        // Apply default color if needed
        this.applyPlayerColor(player.mesh, '#00ffff');
      }

      // Request weapon data for this player
      if (Network.socket && Network.socket.connected) {
        console.log(`Requesting weapon data for player ${playerData.id}`);
        Network.socket.emit('requestPlayerWeapons', {
          playerId: playerData.id
        });
      }
      // Store applied color to avoid re-applying unnecessarily
      player.appliedPrimaryColor = playerData.primaryColor || '#00ffff';
      // player.appliedSecondaryColor = playerData.secondaryColor || '#ff00ff'; // Removed secondary

    } // End of if (!player) block

    // --- Apply color updates for EXISTING players ---
    // Check if new color data exists and differs from currently applied color
    if (playerData.primaryColor && player.appliedPrimaryColor !== playerData.primaryColor)
    {
        console.log(`[GAME] Updating color for existing player ${playerData.id}: P=${playerData.primaryColor}`);
        this.applyPlayerColor(player.mesh, playerData.primaryColor);
        // Update the stored applied color
        player.appliedPrimaryColor = playerData.primaryColor;
        // player.appliedSecondaryColor = playerData.secondaryColor; // Removed secondary
    }
    // --- End color update logic ---


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

  // Helper function to apply the primary color to a player model
  applyPlayerColor(mesh, primaryColorStr) {
    if (!mesh || !primaryColorStr) return;

    const primary = new THREE.Color(primaryColorStr);

    mesh.traverse((child) => {
        if (child.isMesh && child.material) {
            // Ensure material is cloneable and suitable
            if (typeof child.material.clone === 'function' &&
                (child.material instanceof THREE.MeshStandardMaterial || child.material instanceof THREE.MeshPhongMaterial)) {

                // Clone material to avoid modifying shared instances
                child.material = child.material.clone();
                // Apply primary color to all materials
                child.material.color.set(primary);
                 // Optional: Mark for update if needed, though cloning usually suffices
                // child.material.needsUpdate = true; // Generally not needed after clone + color set
            }
        }
    });
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
