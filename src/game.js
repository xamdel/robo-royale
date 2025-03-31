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
import { TerrainGenerator } from './terrainGenerator.js';
import { HUD } from './hud/index.js';
import { MobileControlsManager } from './mobileControls/MobileControlsManager.js'; // Import MobileControlsManager

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

  async init(socket, userData) { // Accept userData object { primary, name }
    await this.loadMechModel();

    // Create player using the same system as remote players, but specify it's the local player
    const playerData = PlayerAnimations.createPlayerMesh(this.mechModel, this.actions, true);
    this.player = playerData.mesh;
    // In Game.init() after creating player:
    this.player.userData = { id: socket.id };

    // Apply chosen color and name from userData
    const playerName = userData?.name || 'MechPilot'; // Default name if missing
    const playerPrimaryColor = userData?.primary || '#00ffff'; // Default color if missing

    console.log(`[GAME] Initializing local player. Name: "${playerName}", Color: ${playerPrimaryColor}`);
    this.applyPlayerColor(this.player, playerPrimaryColor);
    this.localPlayerPrimaryColor = playerPrimaryColor; // Store local player's color

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
    this.player.name = "PlayerMech"; // Internal name, not display name

    // Add player to scene after weapon system is initialized
    SceneManager.add(this.player);

    // Add name tag for the local player using the chosen name
    console.log(`[GAME] Adding name tag for local player (${socket.id}) with name "${playerName}"`);
    NameTagSystem.addTag(socket.id, playerName);
    // Update the local player's name tag position immediately
    NameTagSystem.updateTagPosition(socket.id, this.player);


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
      this.pickupTarget = nearestPickup;
      console.log(`[GAME] Targeting pickup: Type=${this.pickupTarget.type}, ID=${this.pickupTarget.id}`);

      // --- Show Item Badge ---
      if (this.pickupTarget.model && SceneManager.camera && window.HUD?.showItemBadge) {
        const screenPos = this.worldToScreen(this.pickupTarget.model.position, SceneManager.camera);
        if (screenPos) {
          // Pass relevant info (adjust based on actual pickupTarget structure)
          const badgeInfo = {
            type: this.pickupTarget.weaponType || this.pickupTarget.type, // Use weaponType if available
            config: this.pickupTarget.config || {}, // Pass config if available
            // Add other relevant stats if needed
          };
          window.HUD.showItemBadge(badgeInfo, screenPos);
        } else {
          window.HUD.hideItemBadge(); // Hide if off-screen
        }
      }
      // ---------------------

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
              // Hide item badge before showing context menu
              if (window.HUD?.hideItemBadge) window.HUD.hideItemBadge();

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

    // Hide item badge on key up
    if (window.HUD?.hideItemBadge) window.HUD.hideItemBadge();

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
    let isNewPlayer = false; // Flag to track if player was just created

    if (!player) {
      isNewPlayer = true;
      // Create new player
      player = this.createPlayerMesh(playerData.id);
      if (!player) return;

      this.otherPlayers[playerData.id] = player;
      // Initialize properties for new player
      player.previousPosition = new THREE.Vector3();
      player.isMoving = false;
      player.lastMovementTime = 0;
      player.appliedPrimaryColor = null; // Initialize applied color
      player.currentName = null; // Initialize current name

      // Create a dedicated mount manager for this remote player
      console.log(`Creating dedicated mount manager for remote player ${playerData.id}`);
      const MountManager = weaponSystem.mountManager.constructor;
      player.mountManager = new MountManager();
      player.mountManager.initMounts(player.mesh);
      // console.log(`Mount initialization for remote player result: ${mountsInitialized}`); // Less verbose log

      // Request weapon data for new player
      if (Network.socket && Network.socket.connected) {
        // console.log(`Requesting weapon data for player ${playerData.id}`); // Less verbose log
        Network.socket.emit('requestPlayerWeapons', { playerId: playerData.id });
      }
    } // End of if (!player) block


    // --- Apply NAME updates (for new and existing players) ---
    const receivedName = playerData.name || `Player_${playerData.id.slice(-4)}`; // Use default if missing
    // Update tag if name is new, different, or wasn't set initially
    if (receivedName && player.currentName !== receivedName) {
        console.log(`[GAME] ${isNewPlayer ? 'Adding' : 'Updating'} name tag for player ${playerData.id} to "${receivedName}"`);
        NameTagSystem.addTag(playerData.id, receivedName); // Add or update tag
        player.currentName = receivedName; // Store/update the current name
    } else if (isNewPlayer && !playerData.name) {
        // Handle case where new player joins but name is missing in first update
        const defaultName = `Player_${playerData.id.slice(-4)}`;
        console.warn(`[GAME] Player data for new player ${playerData.id} missing name. Using default: "${defaultName}"`);
        // Ensure tag is added if it wasn't already (e.g., if receivedName was initially null/empty)
        if (!NameTagSystem.tags.has(playerData.id)) {
             NameTagSystem.addTag(playerData.id, defaultName);
        }
        player.currentName = defaultName; // Store the default name
    }


    // --- Apply color updates (for new and existing players) ---
    const receivedColor = playerData.primaryColor || '#00ffff'; // Use default if missing
    // Update color if it's new, different, or wasn't set initially
    if (receivedColor && player.appliedPrimaryColor !== receivedColor) {
        console.log(`[GAME] ${isNewPlayer ? 'Applying' : 'Updating'} color for player ${playerData.id}: ${receivedColor}`);
        this.applyPlayerColor(player.mesh, receivedColor);
        player.appliedPrimaryColor = receivedColor; // Store/update applied color

        // Also update color of existing weapons if color changed
        if (!isNewPlayer && player.mountManager) {
            console.log(`[GAME] Re-applying updated color ${receivedColor} to weapons of player ${playerData.id}`);
            player.mountManager.getAllMounts().forEach(mount => {
                const weapon = mount.getWeapon();
                if (weapon && typeof weapon.applyColor === 'function') {
                    weapon.applyColor(receivedColor);
                }
            });
        }
    } else if (isNewPlayer && !player.appliedPrimaryColor) {
        // Ensure default color is applied if none received initially
        console.log(`[GAME] Applying default color for new player ${playerData.id}: ${receivedColor}`);
        this.applyPlayerColor(player.mesh, receivedColor);
        player.appliedPrimaryColor = receivedColor;
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

    // Get mobile input state
    const mobileInput = MobileControlsManager.getInputState();

    // Determine movement based on mobile or keyboard input
    let finalMoveForward = this.moveForward;
    let finalMoveBackward = this.moveBackward;
    let finalMoveLeft = this.moveLeft;
    let finalMoveRight = this.moveRight;
    let finalIsRunning = this.isRunning; // TODO: Add run button/logic for mobile

    let moveVector = new THREE.Vector3();
    let moved = false;

    if (mobileInput.moveVector.lengthSq() > 0.01) { // Use joystick if active
        const { forward, right } = cameraDirections;
        const speed = 5.0 * deltaTime; // Base speed, running handled separately if needed
        // Use joystick vector directly (already normalized)
        moveVector.add(forward.clone().multiplyScalar(mobileInput.moveVector.y * speed));
        moveVector.add(right.clone().multiplyScalar(mobileInput.moveVector.x * speed));
        moved = true;
        // Override keyboard states if joystick is used (optional, prevents conflicts)
        finalMoveForward = mobileInput.moveVector.y > 0.1;
        finalMoveBackward = mobileInput.moveVector.y < -0.1;
        finalMoveLeft = mobileInput.moveVector.x < -0.1;
        finalMoveRight = mobileInput.moveVector.x > 0.1;

    } else { // Fallback to keyboard if joystick is centered
        const keyboardInput = {
            deltaTime: deltaTime,
            moveForward: this.moveForward,
            moveBackward: this.moveBackward,
            moveLeft: this.moveLeft,
            moveRight: this.moveRight,
            isRunning: this.isRunning,
        };
        moveVector = this.applyInput(keyboardInput, cameraDirections);
        if (moveVector.lengthSq() > 0) {
            moved = true;
        }
    }

     // Create the input object AFTER determining final movement states
     const input = {
        id: this.inputSequence++,
        deltaTime: deltaTime,
        moveForward: finalMoveForward,
        moveBackward: finalMoveBackward,
        moveLeft: finalMoveLeft,
        moveRight: finalMoveRight,
        isRunning: finalIsRunning, // Use final state
        timestamp: Date.now()
    };
    this.inputBuffer.push(input);


    // Apply the calculated moveVector
    if (moved && !this.isDead) {
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

    // --- Hide Item Badge if player moves away ---
    // (This is a simple check, might need refinement)
    if (!this.isHoldingE && this.pickupTarget && window.HUD?.hideItemBadge) {
        const playerWorldPos = new THREE.Vector3();
        this.player.getWorldPosition(playerWorldPos);
        const pickupRange = 4.0;
        if (playerWorldPos.distanceTo(this.pickupTarget.model.position) > pickupRange + 0.5) { // Add buffer
            // console.log("[GAME] Player moved away from pickup target, hiding badge."); // Debug
            window.HUD.hideItemBadge();
            this.pickupTarget = null; // Clear target if moved away without interacting
        }
    }
    // ------------------------------------------


    // Update previous position
    if (moved) this.previousPosition.copy(this.player.position);

    return moveData;
  },

  // Helper function to convert world coordinates to screen coordinates
  worldToScreen(worldPosition, camera) {
      const vector = worldPosition.clone();
      vector.project(camera);

      // Check if the point is behind the camera
      if (vector.z > 1) {
          return null; // Don't display if behind camera
      }

      const widthHalf = window.innerWidth / 2;
      const heightHalf = window.innerHeight / 2;

      const x = (vector.x * widthHalf) + widthHalf;
      const y = -(vector.y * heightHalf) + heightHalf;

      // Optional: Check if it's within screen bounds (e.g., add padding)
      const padding = 20;
      if (x < padding || x > window.innerWidth - padding || y < padding || y > window.innerHeight - padding) {
         // return null; // Optionally hide if too close to edge or off-screen
      }


      return { x, y };
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
