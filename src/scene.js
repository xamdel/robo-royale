import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'; //for metallic reflections
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { weaponSystem } from './weapons';
import { particleEffectSystem } from './systems/ParticleEffectSystem.js';
import { TerrainGenerator } from './terrainGenerator.js'; // Import the terrain generator
import { BuildingPlacer } from './buildingPlacer.js'; // Import the building placer
import { modelManager } from './ModelManager.js'; // Import the model manager
import { WeaponSpawnManager } from './weaponSpawnManager.js'; // Import the weapon spawn manager
import { Network } from './network.js'; // Import Network

const PLATFORM_Y_POSITION = 100; // Define platform height constant (Increased height)

export const SceneManager = {
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000),
  normalFOV: 75, // Default FOV
  zoomFOV: 30, // Zoomed FOV
  targetFOV: 75, // Target FOV (for smooth transitions)
  renderer: new THREE.WebGLRenderer({ antialias: true }),
  cameraOffset: new THREE.Vector3(0, 3, 7), // Third-person camera offset
  cameraDistance: 5, // Distance from player
  cameraHeight: 4, // Height offset
  freeLookActive: false, // Free look mode toggle
  mouseSensitivity: 0.002, // Mouse sensitivity
  mobileSensitivity: 0.006, // Mobile touch sensitivity (Adjust as needed)
  yaw: Math.PI, // Horizontal camera rotation (Set to face opposite direction initially)
  pitch: -0.3, // Vertical camera rotation (slightly looking down)
  minPitch: -0.8, // Limit looking down
  maxPitch: 0.8, // Limit looking up
  lookDelta: { x: 0, y: 0 }, // Store look input delta for the frame
  debugHelpers: {}, // Store debug helpers
  terrainMesh: null, // Add reference to store the terrain mesh
  isZooming: false, // Zoom state
  normalDistance: 5, // Default camera distance
  zoomDistance: 2, // Distance when zoomed in
  targetCameraDistance: 5, // Target camera distance
  zoomSpeed: 0.1, // Zoom transition speed
  platformMesh: null, // Add reference for the platform
  platformBoundingBox: null, // Store platform bounding box for collision checks
  turretMesh: null, // Reference to the loaded turret model
  turretCannonTopMesh: null, // Reference to the rotating part
  isControllingTurret: false, // State flag
  turretCameraOffset: new THREE.Vector3(0, 2.5, 6), // Place camera in front of turret
  originalPlayerCameraState: null, // To restore camera settings
  turretYaw: 0, // Horizontal aim of the turret (relative to turret's base forward)
  turretPitch: 0, // Vertical aim of the turret
  turretMinPitch: -0.4, // Limit turret looking down (radians)
  turretMaxPitch: 0.6, // Limit turret looking up (radians)
  turretMinYaw: -Math.PI / 2.5, // Limit turret rotation left (radians)
  turretMaxYaw: Math.PI / 2.5, // Limit turret rotation right (radians)
  isFollowingProjectile: false, // State flag for follow-cam
  followingProjectileData: null, // Reference to the projectile being followed { mesh, direction, serverId }
  portals: [], // To store portal data { mesh, labelMesh, destinationUrl, triggerZone }

  init(mapSeed = 'default_seed_from_scene') { // Accept mapSeed, provide default for safety
    console.log(`[SceneManager] Initializing with map seed: ${mapSeed}`);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;
    document.body.appendChild(this.renderer.domElement);

    // Setup input controls (mouse and touch)
    this.setupInputControls();

    // Background color removed, will be handled by fog and skydome

    // Add lights
    // const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // Can reduce or remove if HemisphereLight is strong enough
    // this.scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0xADD8E6, 0x556B2F, 1.5); // Sky blue, ground green, intensity
    this.scene.add(hemisphereLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5); // Slightly reduced intensity
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 4096;
    directionalLight.shadow.mapSize.height = 4096; // Increased resolution
    directionalLight.shadow.camera.near = 1;
    directionalLight.shadow.camera.far = 600; // Increased far plane for larger map
    directionalLight.shadow.camera.left = -350; // Increased bounds for 600x600 map
    directionalLight.shadow.camera.right = 350;
    directionalLight.shadow.camera.top = 350;
    directionalLight.shadow.camera.bottom = -350;
    directionalLight.shadow.bias = -0.001; // Reduce shadow acne
    this.scene.add(directionalLight);
    // IMPORTANT: Update the shadow camera helper after changing bounds
    directionalLight.shadow.camera.updateProjectionMatrix();

    // Add shadow camera helper for debugging
    this.debugHelpers.shadowCamera = new THREE.CameraHelper(directionalLight.shadow.camera);
    this.scene.add(this.debugHelpers.shadowCamera);
    this.debugHelpers.shadowCamera.visible = false; // Keep hidden by default

    // --- Add Fog ---
    const fogColor = 0xADD8E6; // Light blue, similar to hemisphere sky
    const fogNear = 100; // Start distance
    const fogFar = 450;  // End distance (adjust based on map size/view distance)
    this.scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
    // Optional: Match fog color to hemisphere sky color for consistency
    // this.scene.fog = new THREE.Fog(hemisphereLight.color.getHex(), fogNear, fogFar);

    // --- Add Gradient Skydome ---
    const skyGeo = new THREE.SphereGeometry(500, 32, 15); // Radius matches shadow camera far plane
    const skyTopColor = new THREE.Color(0x87CEEB); // Sky Blue
    const skyBottomColor = new THREE.Color(0xFFFFFF); // White/Light horizon

    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `;

    const fragmentShader = `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize( vWorldPosition + offset ).y;
        gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max( h , 0.0), exponent ), 0.0 ) ), 1.0 );
      }
    `;

    const uniforms = {
      topColor: { value: skyTopColor },
      bottomColor: { value: skyBottomColor },
      offset: { value: 0 }, // Adjust if horizon is not at y=0
      exponent: { value: 0.6 } // Controls gradient steepness
    };

    const skyMat = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      side: THREE.BackSide // Render on the inside of the sphere
    });

    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.renderOrder = -1; // Ensure it renders behind everything else
    this.scene.add(sky);
    // --- End Skydome ---


    // Initialize TerrainGenerator first with the seed
    TerrainGenerator.initialize(mapSeed); // Use the provided seed

    // Generate and add the terrain using the new generator function
    this.terrainMesh = TerrainGenerator.generateTerrainMesh(); // Removed debug flag
    if (this.terrainMesh) {
        this.scene.add(this.terrainMesh);
        console.log(`[SceneManager] Terrain mesh added to scene.`); // Removed debug message part

        // --- Add Ground Mist Particle Effect ---
        // Ensure particle system is initialized before calling this
        // This might need adjustment depending on where particleEffectSystem is initialized
        if (particleEffectSystem && particleEffectSystem.initialized) {
            // Spawn mist across the central area of the terrain
            const terrainWidth = TerrainGenerator.generationParams.width || 600;
            const terrainHeight = TerrainGenerator.generationParams.height || 600;
            particleEffectSystem.createGroundMist(
                new THREE.Vector3(0, 0.5, 0), // Center position, slightly above ground
                Math.min(terrainWidth, terrainHeight), // Area size based on terrain dimensions
                150, // Number of particles
                20000 // Duration (ms) - long lasting
            );
            console.log("[SceneManager] Ground mist effect created.");
        } else {
            console.warn("[SceneManager] ParticleEffectSystem not ready, skipping ground mist creation.");
        }
        // --- End Ground Mist ---

    } else {
        console.error("[SceneManager] Failed to generate terrain mesh.");
    }

    // WeaponSpawnManager is now initialized in Game.init()

    // Place buildings after terrain is generated and models are loaded
    if (this.terrainMesh && TerrainGenerator.isInitialized && modelManager.isLoaded) {
        console.log("[SceneManager] Placing buildings...");
        BuildingPlacer.placeBuildings(this.scene, TerrainGenerator, modelManager); // Pass modelManager

        // Weapon spawning is now handled via network event 'initialPickupState'
        console.log("[SceneManager] Buildings placed.");

    } else {
        console.warn("[SceneManager] Skipping building placement because terrain and/or models are not ready.");
        if (!this.terrainMesh || !TerrainGenerator.isInitialized) console.warn(" - Terrain not ready.");
        if (!modelManager.isLoaded) console.warn(" - Models not loaded.");
    }

    // Set initial camera position (adjust Y based on terrain height if needed later)
    this.camera.position.set(0, 20, 10); // Increased Y slightly for better view
    this.camera.lookAt(0, 0, 0);

    // Handle window resize
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Load the platform and turret models after other initializations
    this.loadPlatformModel().then(() => {
        // Place portals *after* the platform is loaded and positioned
        this.setupPortals();
    }); // Ensure platform is loaded before placing portals on it
    this.loadTurretModel(); // Call the new function
  },

  // Function to load the platform model
  async loadPlatformModel() {
    const loader = new GLTFLoader();
    try {
      // User mentioned they set the platform Z to -250, let's assume they updated the model name too if needed.
      // Using Platform2.glb as seen in the last successful file content.
      const gltf = await loader.loadAsync('assets/models/Platform2.glb');
      this.platformMesh = gltf.scene;
      this.platformMesh.scale.set(5, 5, 5); // Scale the platform up
      this.platformMesh.position.set(0, PLATFORM_Y_POSITION, -250); // Position the platform near Z edge

      // Ensure platform casts and receives shadows
      this.platformMesh.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.scene.add(this.platformMesh);
      console.log('[SceneManager] Platform model loaded, scaled, and added to scene.');

      // Calculate and store bounding box for collision *after* scaling and positioning
      this.platformBoundingBox = new THREE.Box3().setFromObject(this.platformMesh);
      // Optional: Add a helper to visualize the bounding box
      // const helper = new THREE.Box3Helper(this.platformBoundingBox, 0xffff00);
      // this.scene.add(helper);

    } catch (error) {
      console.error('[SceneManager] Failed to load platform model:', error);
    }
    // Return the promise so we can chain .then() in init
    // Although loadAsync already returns a promise, wrapping it ensures consistency
    return Promise.resolve();
  },

  // Function to load the turret model
  async loadTurretModel() {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync('assets/models/Turret.glb');
      this.turretMesh = gltf.scene; // Store reference to the whole turret
      // Position the turret on the platform near the positive Z edge (relative to platform center at Z=-250)
      this.turretMesh.position.set(0, PLATFORM_Y_POSITION, -230); // Y=100, Z=-230
      this.turretMesh.scale.set(11, 11, 11);

      // Ensure turret casts and receives shadows and find the cannon top
      this.turretMesh.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          // Find the cannon top mesh by name - **ASSUMING 'Turret_Cannon_Top'**
          if (child.name === 'Turret_Cannon_Top') {
            this.turretCannonTopMesh = child;
            console.log('[SceneManager] Found Turret_Cannon_Top mesh.');
          }
        }
      });

      // Add a check if the cannon top wasn't found
      if (!this.turretCannonTopMesh) {
         console.warn('[SceneManager] Turret_Cannon_Top mesh not found in Turret.glb. Turret rotation might not work.');
      }

      this.scene.add(this.turretMesh);
      console.log('[SceneManager] Turret model loaded, referenced, and added to scene.');

      // --- Add JOIN BATTLE Billboard ---
      try {
        const billboardCanvas = document.createElement('canvas');
        const billboardContext = billboardCanvas.getContext('2d');
        const billboardWidth = 512; // Texture resolution
        const billboardHeight = 64;
        billboardCanvas.width = billboardWidth;
        billboardCanvas.height = billboardHeight;

        // Style the text (using HUD styles)
        billboardContext.fillStyle = 'rgba(0, 20, 40, 0.7)'; // Dark semi-transparent background (similar to HUD bg)
        billboardContext.fillRect(0, 0, billboardWidth, billboardHeight);
        billboardContext.font = 'bold 48px Orbitron, Roboto Mono, monospace'; // HUD font, adjusted size
        billboardContext.fillStyle = '#00aaff'; // HUD primary color
        billboardContext.textAlign = 'center';
        billboardContext.textBaseline = 'middle';
        billboardContext.fillText('JOIN BATTLE', billboardWidth / 2, billboardHeight / 2);

        const billboardTexture = new THREE.CanvasTexture(billboardCanvas);
        billboardTexture.needsUpdate = true;

        // Adjust plane size based on aspect ratio of text/canvas - Made much smaller
        const billboardAspect = billboardWidth / billboardHeight; // 4:1
        const billboardPlaneHeight = 0.5; // Drastically reduced height
        const billboardPlaneWidth = billboardPlaneHeight * billboardAspect; // Drastically reduced width (2)

        const billboardGeometry = new THREE.PlaneGeometry(billboardPlaneWidth, billboardPlaneHeight);
        const billboardMaterial = new THREE.MeshBasicMaterial({
          map: billboardTexture,
          transparent: true, // Needed because of the rgba background
          side: THREE.DoubleSide, // Visible from both sides
          depthTest: false, // Optional: Render on top of other objects slightly easier
        });

        const billboardMesh = new THREE.Mesh(billboardGeometry, billboardMaterial);

        // Counteract parent scale
        const turretScaleFactor = 11;
        billboardMesh.scale.set(1 / turretScaleFactor, 1 / turretScaleFactor, 1 / turretScaleFactor);

        // Position the billboard above the turret's local origin - Lowered
        // The turret scale is 11, so offsets are relative to the unscaled model unless applied after scaling.
        // Adding as a child means the position is relative to the parent's origin.
        const billboardYOffset = 0.75; // Further reduced Y offset
        billboardMesh.position.set(0, billboardYOffset, 0); // Centered above the turret base origin
        billboardMesh.rotation.y = Math.PI; // Rotate 180 degrees to face forward

        // Add billboard as a child of the turret mesh so it moves/rotates with the base
        this.turretMesh.add(billboardMesh);
        console.log('[SceneManager] Added JOIN BATTLE billboard to turret.');

      } catch (billboardError) {
          console.error('[SceneManager] Failed to create billboard:', billboardError);
      }
      // --- End Billboard ---

    } catch (error) {
      console.error('[SceneManager] Failed to load turret model:', error);
    }
  },

  enterTurretControl(playerModel) {
    if (!this.turretMesh) {
      console.error("[SceneManager] Cannot enter turret control: Turret mesh not loaded.");
      return;
    }
    console.log("[SceneManager] Entering turret control.");
    this.isControllingTurret = true;

    // Store original camera state
    this.originalPlayerCameraState = {
      fov: this.camera.fov,
      pitch: this.pitch,
      yaw: this.yaw,
      targetFOV: this.targetFOV,
      isZooming: this.isZooming,
      freeLookActive: this.freeLookActive,
    };

    // Hide player model
    if (playerModel) {
      playerModel.visible = false;
    }

    // Reset turret aim (relative to its base)
    this.turretYaw = 0;
    this.turretPitch = 0;

    // Reset player camera pitch/yaw/zoom for turret view
    this.pitch = 0; // Reset pitch for turret view
    this.yaw = 0; // Reset yaw for turret view (turret rotation handles this now)
    this.targetFOV = this.normalFOV; // Ensure not zoomed
    this.isZooming = false;
    this.freeLookActive = false; // Disable free look

    // Switch HUD elements
    if (window.HUD?.showTurretReticle) window.HUD.showTurretReticle();
    // Interaction prompt is hidden by game.js when entering control

    // Add instructional message using the alert system
    if (window.HUD?.showAlert) {
        const fireAction = window.MobileControlsManager?.isTouchDevice ? "Tap Fire Button" : "Left-Click";
        window.HUD.showAlert(`Shoot to travel`, "info", 5000); // Show for 5 seconds
    }
  },

  exitTurretControl(playerModel) {
    console.log("[SceneManager] Exiting turret control.");
    this.isControllingTurret = false;

    // Show player model
    if (playerModel) {
      playerModel.visible = true;
    }

    // Restore original camera state
    if (this.originalPlayerCameraState) {
      this.camera.fov = this.originalPlayerCameraState.fov;
      this.pitch = this.originalPlayerCameraState.pitch;
      this.yaw = this.originalPlayerCameraState.yaw;
      this.targetFOV = this.originalPlayerCameraState.targetFOV;
      this.isZooming = this.originalPlayerCameraState.isZooming;
      this.freeLookActive = this.originalPlayerCameraState.freeLookActive;
      this.originalPlayerCameraState = null;
      this.camera.updateProjectionMatrix(); // Apply FOV change immediately
    }

    // Reset turret aim visuals (optional, could leave as is)
    // if (this.turretCannonTopMesh) {
    //   this.turretCannonTopMesh.rotation.set(0, 0, 0);
    // }

    // Switch HUD elements back
    if (window.HUD?.hideTurretReticle) window.HUD.hideTurretReticle();
    // Interaction prompt visibility is handled by game.js based on proximity check

    // If we were following a projectile when exiting, make sure to stop.
    if (this.isFollowingProjectile) {
        this.stopFollowingProjectile(false); // Pass false to prevent restoring turret view elements
    }
  },

  // Method to start following a projectile
  startFollowingProjectile(projectileData) {
    if (!projectileData || !projectileData.mesh) {
      console.error("[SceneManager] Invalid projectile data for following.");
      return;
    }
    console.log(`[SceneManager] Starting to follow projectile ID: ${projectileData.serverId}`);
    this.isFollowingProjectile = true;
    this.followingProjectileData = projectileData;
    // Optionally, reset lookDelta to prevent accidental turret movement while following
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    // Maybe hide turret reticle?
    if (window.HUD?.hideTurretReticle) window.HUD.hideTurretReticle();
  },

  // Method to stop following a projectile
  // Added restoreTurretViewElements parameter (defaults to true)
  stopFollowingProjectile(restoreTurretViewElements = true) {
    if (!this.isFollowingProjectile) return; // Already stopped

    const projectileId = this.followingProjectileData?.serverId; // Get ID before clearing
    console.log(`[SceneManager] Stopping following projectile ID: ${projectileId}`);
    this.isFollowingProjectile = false;
    this.followingProjectileData = null;

    // Only restore turret elements (like reticle) if requested AND still in turret control
    // This prevents restoring them if we stopped following because we teleported *out* of the turret.
    if (restoreTurretViewElements && this.isControllingTurret) {
        console.log("[SceneManager] Restoring turret view elements after following projectile.");
        // Reset turret aim immediately for consistency when returning control manually (not via teleport)
        this.turretYaw = 0;
        this.turretPitch = 0;
        // Show turret reticle again
        if (window.HUD?.showTurretReticle) window.HUD.showTurretReticle();
    } else if (!restoreTurretViewElements) {
        console.log(`[SceneManager] Stopped following projectile ${projectileId}, but not restoring turret view elements (likely due to teleport).`);
    } else {
        // This case (restoreTurretViewElements=true but not isControllingTurret) shouldn't normally happen
        // if exitTurretControl calls stopFollowingProjectile(false).
        console.warn(`[SceneManager] Stopped following projectile ${projectileId}, but player is no longer in turret control. No view elements restored.`);
    }
  },

  add(object) {
    this.scene.add(object);
  },

  remove(object) {
    this.scene.remove(object);
    // Also remove any debug helpers associated with this object
    if (this.debugHelpers[object.uuid]) {
      this.scene.remove(this.debugHelpers[object.uuid]);
      delete this.debugHelpers[object.uuid];
    }
  },

  async cloneWeapon(weaponType) {
    console.log(`[SceneManager] Attempting to clone weapon: ${weaponType}`);

    try {
      if (!weaponSystem?.weaponFactory) {
        throw new Error('Weapon system not initialized');
      }

      const model = await weaponSystem.weaponFactory.loadWeaponModel(weaponType);
      if (!model) {
        throw new Error(`Failed to load model for ${weaponType}`);
      }

      return model.clone();
    } catch (error) {
      console.error(`[SceneManager] Failed to clone weapon ${weaponType}:`, error);
      return null;
    }
  },

  // Add debug visualization for interpolation
  addDebugHelper(playerId, mesh, targetPosition) {
    // Create a line between current position and target position
    const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const geometry = new THREE.BufferGeometry().setFromPoints([
      mesh.position,
      targetPosition
    ]);
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);

    // Store the helper
    this.debugHelpers[mesh.uuid] = line;

    return line;
  },

  // Update debug visualization
  updateDebugHelper(mesh, targetPosition) {
    if (this.debugHelpers[mesh.uuid]) {
      // Update the line geometry
      const points = [mesh.position.clone(), targetPosition.clone()];
      this.debugHelpers[mesh.uuid].geometry.setFromPoints(points);
      this.debugHelpers[mesh.uuid].geometry.attributes.position.needsUpdate = true;
    } else {
      // Create a new helper if it doesn't exist
      this.addDebugHelper(mesh.uuid, mesh, targetPosition);
    }
  },

  getPlayerFacingYaw() {
    // This is the raw yaw without the camera-specific adjustment
    return this.yaw;
  },

  render(playerPosition) {
    const now = performance.now();
    const deltaTime = this.lastRenderTime ? (now - this.lastRenderTime) / 1000 : 0;
    this.lastRenderTime = now;

    // Update weapon spawn manager (now accessed via Game.weaponSpawnManager)
    if (window.Game && window.Game.weaponSpawnManager) {
        window.Game.weaponSpawnManager.update(deltaTime);
    }

    // Update portal shader time uniforms for animation
    this.portals.forEach((portalData, index) => {
        const timeValue = now * 0.0005; // Adjust speed as needed
        // Update Ring
        if (portalData.visualMeshRing?.material instanceof THREE.ShaderMaterial) {
            portalData.visualMeshRing.material.uniforms.time.value = timeValue;
            // if (index === 1) console.log(`Updating ring ${index} time: ${timeValue}`); // Debug log for second portal
        }
        // Update Face - Explicitly target the face material's uniforms
        if (portalData.visualMeshFace?.material instanceof THREE.ShaderMaterial) {
            portalData.visualMeshFace.material.uniforms.time.value = timeValue; // Use same time for now
            // if (index === 1) console.log(`Updating face ${index} time: ${timeValue}`); // Debug log for second portal
        }
    });

    // Collision check for weapon pickups (handled by 'E' key interaction in game.js)
    // const collidedPickup = this.weaponSpawnManager?.checkCollisions(playerPosition);
    // if (collidedPickup) {
    //   // Handle pickup logic here or in game.js
    //   console.log(`Player collided with ${collidedPickup.type}`);
    //   // Example: weaponSystem.pickupWeapon(playerModel, collidedPickup.model, collidedPickup.type);
    //   // Example: this.weaponSpawnManager.removePickup(collidedPickup.id);
    // }

    this.renderer.render(this.scene, this.camera);
  },

  // Touch state variables
  touchStartTime: 0,
  touchStartPosition: { x: 0, y: 0 },
  touchCurrentPosition: { x: 0, y: 0 },
  touchHoldTimeout: null,
  isHoldingTouch: false,
  touchHoldDuration: 500, // ms for hold gesture

  setupInputControls() {
    const canvas = this.renderer.domElement;

    // --- Mouse Controls ---
    document.addEventListener('mousemove', (event) => {
      // Ensure Game object exists before checking its state
      if (!window.Game) return;

      // Check if context menu is active in Game object
      const isContextMenuActive = window.Game.isContextMenuActive || false;
      // Store mouse delta instead of applying directly
      if (document.pointerLockElement === document.body && !isContextMenuActive) {
        this.lookDelta.x -= event.movementX; // Accumulate delta
        this.lookDelta.y -= event.movementY;
      }
    });

    // Pointer lock setup & Turret Firing
    document.addEventListener('click', () => {
      // Request pointer lock if not already active
      if (document.pointerLockElement !== document.body) {
        // Don't request pointer lock if the context menu is active (handled elsewhere)
        if (!window.Game?.isContextMenuActive) {
            document.body.requestPointerLock();
        }
      }
      // Handle turret firing if controlling the turret, pointer is locked, AND not currently following a projectile
      else if (this.isControllingTurret && !this.isFollowingProjectile) {
        console.log("[SceneManager] Click detected while controlling turret (and not following)."); // Debug log
        this.fireTurret(); // Call the new centralized firing method
      }
      // Note: Regular weapon firing is handled by WeaponSystem based on mouse state, not this click event.
    });

    // Right mouse for zoom
    document.addEventListener('mousedown', (event) => {
      if (event.button === 2) { // Right mouse button
        this.isZooming = true;
        this.targetFOV = this.zoomFOV; // Set target FOV to zoom FOV
      }
    });

    document.addEventListener('mouseup', (event) => {
      if (event.button === 2) { // Right mouse button
        this.isZooming = false;
        this.targetFOV = this.normalFOV; // Set target FOV to normal FOV
      }
    });

    // Middle mouse for free look
    document.addEventListener('mousedown', (event) => {
      if (event.button === 1) { // Middle mouse button
        this.freeLookActive = true;
      }
    });

    document.addEventListener('mouseup', (event) => {
      if (event.button === 1) { // Middle mouse button
        this.freeLookActive = false;
      }
    });

    // Handle pointer lock change
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== document.body) {
        // Reset free look when pointer lock is exited
        this.freeLookActive = false;
      }
    });

    // --- Touch Controls ---
    canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
    canvas.addEventListener('touchcancel', this.handleTouchEnd.bind(this), { passive: false }); // Treat cancel like end
  },

  // --- NEW: Centralized Turret Firing Logic ---
  fireTurret() {
    // Check if controlling turret and not following projectile
    if (!this.isControllingTurret || this.isFollowingProjectile) {
      return; // Don't fire if not in correct state
    }

    console.log("[SceneManager] fireTurret called."); // Debug log

    const hitTerrain = this.checkTurretTerrainTarget();
    if (hitTerrain) {
      console.log("[SceneManager] Turret raycast hit terrain.");
      if (window.HUD?.addMessage) {
        window.HUD.addMessage("Turret Target Acquired!", "success"); // Success message
      }
      // --- Fire Projectile ---
      if (Network?.sendShot) {
        const position = new THREE.Vector3();
        const direction = new THREE.Vector3();
        this.camera.getWorldPosition(position); // Get world position of camera
        this.camera.getWorldDirection(direction); // Get world direction camera is facing

        console.log(`[SceneManager] Sending turret shot. Pos: ${position.toArray().join(',')}, Dir: ${direction.toArray().join(',')}`);

        Network.sendShot({
          weaponId: 'turret', // Placeholder ID for the turret
          weaponType: 'turretCannon', // Specific type for the server to handle
          position: { x: position.x, y: position.y, z: position.z },
          direction: { x: direction.x, y: direction.y, z: direction.z }
        });
        // TODO: Add client-side firing effect (muzzle flash, sound)?
      } else {
        console.warn("[SceneManager] Network.sendShot is not available.");
      }
      // --- End Fire Projectile ---
    } else {
      console.log("[SceneManager] Turret raycast missed terrain.");
      if (window.HUD?.addMessage) {
        window.HUD.addMessage("Turret Missed.", "warning"); // Failure message
      }
    }
  },
  // --- END NEW ---

  handleTouchStart(event) {
    // Prevent default browser actions like scrolling/zooming on the canvas
    event.preventDefault();

    if (event.touches.length === 1) { // Handle single touch for now
      const touch = event.touches[0];
      this.isHoldingTouch = true;
      this.touchStartTime = Date.now();
      this.touchStartPosition.x = touch.clientX;
      this.touchStartPosition.y = touch.clientY;
      this.touchCurrentPosition.x = touch.clientX;
      this.touchCurrentPosition.y = touch.clientY;

      // Clear any previous hold timeout
      clearTimeout(this.touchHoldTimeout);

      // Set timeout for hold gesture
      this.touchHoldTimeout = setTimeout(() => {
        if (this.isHoldingTouch) {
          // Check if touch hasn't moved much (threshold for hold)
          const dx = this.touchCurrentPosition.x - this.touchStartPosition.x;
          const dy = this.touchCurrentPosition.y - this.touchStartPosition.y;
          const moveThreshold = 10; // Pixels
          if (Math.sqrt(dx * dx + dy * dy) < moveThreshold) {
            console.log("[SceneManager] Touch Hold Detected at:", this.touchStartPosition);
            this.triggerContextMenuAtTouch(this.touchStartPosition);
            // Prevent tap/drag after hold triggers menu
            this.isHoldingTouch = false; // End the hold state so touchend doesn't trigger tap
          }
        }
      }, this.touchHoldDuration);

      // TODO: Add logic for touch-based camera movement start if needed
    }
  },

  handleTouchMove(event) {
    event.preventDefault();

    if (event.touches.length === 1 && this.isHoldingTouch) {
      const touch = event.touches[0];
      const prevX = this.touchCurrentPosition.x;
      const prevY = this.touchCurrentPosition.y;
      this.touchCurrentPosition.x = touch.clientX;
      this.touchCurrentPosition.y = touch.clientY;

      const deltaX = this.touchCurrentPosition.x - prevX;
      const deltaY = this.touchCurrentPosition.y - prevY;

      // If touch moves significantly, cancel the hold timeout
      const dx = this.touchCurrentPosition.x - this.touchStartPosition.x;
      const dy = this.touchCurrentPosition.y - this.touchStartPosition.y;
      const moveThreshold = 10;
       if (Math.sqrt(dx*dx + dy*dy) >= moveThreshold) {
           clearTimeout(this.touchHoldTimeout);
           // console.log("[SceneManager] Touch moved, hold cancelled."); // Debug
       }

       // --- DISABLED Camera rotation from general canvas touch move ---
       // This logic is now handled by prioritizing mobileLookDelta in updateCamera
       // const mobileControls = window.MobileControlsManager; // Cache for safety
       // if (!mobileControls?.isTouchDevice && !window.Game?.isContextMenuActive) {
       //     this.lookDelta.x -= deltaX * 1.5; // Apply sensitivity adjustment for touch
       //     this.lookDelta.y -= deltaY * 1.5;
       // }
       // --- END DISABLED ---
    }
  },

  handleTouchEnd(event) {
     event.preventDefault();
     clearTimeout(this.touchHoldTimeout); // Always clear timeout on touch end

     if (this.isHoldingTouch) {
         const touchEndTime = Date.now();
         const duration = touchEndTime - this.touchStartTime;
         const dx = this.touchCurrentPosition.x - this.touchStartPosition.x;
         const dy = this.touchCurrentPosition.y - this.touchStartPosition.y;
         const moveThreshold = 10; // Pixels

         // Check for a tap (short duration, minimal movement)
         if (duration < this.touchHoldDuration && Math.sqrt(dx * dx + dy * dy) < moveThreshold) {
             console.log("[SceneManager] Tap Detected at:", this.touchStartPosition);
             // TODO: Handle tap action (e.g., fire weapon if tapping on right side?)
             // this.handleTap(this.touchStartPosition);
         }
     }

     this.isHoldingTouch = false; // Reset hold state
     // TODO: Add logic for touch-based camera movement end if needed
  },

  triggerContextMenuAtTouch(touchPosition) {
      // This function needs access to Game state to find the pickup target
      if (!window.Game || !window.Game.player || !window.Game.weaponSpawnManager || !weaponSystem) {
          console.warn("[SceneManager] Cannot trigger context menu, Game state not available.");
          return;
      }

      // Use raycasting from touch position to find potential pickup target
      const raycaster = new THREE.Raycaster();
      const mouseNDC = new THREE.Vector2(
          (touchPosition.x / window.innerWidth) * 2 - 1,
          -(touchPosition.y / window.innerHeight) * 2 + 1
      );
      raycaster.setFromCamera(mouseNDC, this.camera);

      // Check intersection with pickup items (assuming they are in a specific group or have userData)
      const pickupMeshes = window.Game.weaponSpawnManager.getAllPickupModels(); // Need a way to get all pickup meshes
      const intersects = raycaster.intersectObjects(pickupMeshes, true); // Recursive check

      let targetPickupInfo = null;
      if (intersects.length > 0) {
          // Find the closest intersected pickup mesh that has associated pickup data
          for (const intersect of intersects) {
              let currentObj = intersect.object;
              while (currentObj && !currentObj.userData?.pickupId) {
                  currentObj = currentObj.parent; // Traverse up to find the object with pickupId
              }
              if (currentObj && currentObj.userData.pickupId) {
                  const pickupId = currentObj.userData.pickupId;
                  const pickupData = window.Game.weaponSpawnManager.getPickupById(pickupId); // Need this function in WeaponSpawnManager
                  if (pickupData) {
                      // Check distance (optional, but good practice)
                      const playerPos = new THREE.Vector3();
                      window.Game.player.getWorldPosition(playerPos);
                      const pickupPos = new THREE.Vector3();
                      currentObj.getWorldPosition(pickupPos);
                      const pickupRange = 4.0; // Match game logic range
                      if (playerPos.distanceTo(pickupPos) <= pickupRange) {
                          targetPickupInfo = pickupData; // Found a valid target
                          console.log(`[SceneManager] Raycast hit pickup: ${targetPickupInfo.type} (ID: ${targetPickupInfo.id})`);
                          break; // Use the first valid hit
                      }
                  }
              }
          }
      }

      if (targetPickupInfo && targetPickupInfo.type === 'weapon') {
          console.log("[SceneManager] Triggering weapon context menu via touch hold.");
          window.Game.isContextMenuActive = true; // Disable camera controls in Game

          // Hide item badge if it was shown
          if (window.HUD?.hideItemBadge) window.HUD.hideItemBadge();

          const allMounts = weaponSystem.mountManager.getAllMounts();
          // Show context menu centered at touch position
          window.HUD.showWeaponContextMenu(touchPosition, allMounts, targetPickupInfo);
      } else {
          console.log("[SceneManager] Touch hold did not target a weapon pickup.");
          // Optionally hide context menu if it was somehow still visible
          if (window.HUD?.hideWeaponContextMenu) window.HUD.hideWeaponContextMenu();
          window.Game.isContextMenuActive = false;
      }
  },

  // Removed addWeaponPickups method as it's now handled by WeaponSpawnManager

  // Modified to accept mobileLookDelta
  updateCamera(playerPosition, playerModel, mobileLookDelta = null) {
    // --- Projectile Follow-Cam Logic ---
    if (this.isFollowingProjectile && this.followingProjectileData?.mesh) {
      const projectileMesh = this.followingProjectileData.mesh;
      const projectileDirection = this.followingProjectileData.direction; // Assumes direction is stored

      // Define offset behind and slightly above the projectile
      const followOffset = projectileDirection.clone().multiplyScalar(-8).add(new THREE.Vector3(0, 3, 0)); // 8 units behind, 3 units up
      const targetCameraPosition = projectileMesh.position.clone().add(followOffset);

      // Smoothly move camera towards target position
      this.camera.position.lerp(targetCameraPosition, 0.1); // Adjust lerp factor for smoothness

      // Make camera look slightly ahead of the projectile
      const lookAtTarget = projectileMesh.position.clone().addScaledVector(projectileDirection, 10); // Look 10 units ahead
      this.camera.lookAt(lookAtTarget);

      // Return default vectors as player/turret movement is disabled
      return { forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) };

    // --- Turret Control Logic (Not Following Projectile) ---
    } else if (this.isControllingTurret) {
      // Delegate all camera and turret model updates to the specific function
      // Pass mobileLookDelta to the turret logic
      return this.updateTurretCameraLogic(mobileLookDelta); // Return the result (turret's forward/right)

    // --- Player Camera Logic ---
    } else {
      // --- Apply Look Delta ---
      let appliedLookDelta = false;
      // Prioritize mobile look delta if provided and non-zero
      // console.log('[SceneManager.updateCamera] Received mobileLookDelta:', JSON.stringify(mobileLookDelta), typeof mobileLookDelta); // DEBUG REMOVED
      if (mobileLookDelta && (mobileLookDelta.deltaX !== 0 || mobileLookDelta.deltaY !== 0)) {
          // console.log(`[SceneManager.updateCamera] Applying mobile look delta: dX=${mobileLookDelta.deltaX}, dY=${mobileLookDelta.deltaY}`); // DEBUG REMOVED
          // Apply mobile delta using separate sensitivity. Invert signs to match mouse behavior.
          this.yaw -= mobileLookDelta.deltaX * this.mobileSensitivity; // Use mobileSensitivity
          this.pitch -= mobileLookDelta.deltaY * this.mobileSensitivity; // Use mobileSensitivity
          appliedLookDelta = true;
          // console.log(`[SceneManager.updateCamera] Yaw/Pitch after mobile delta: ${this.yaw.toFixed(3)}, ${this.pitch.toFixed(3)}`); // DEBUG REMOVED
      }
      // Fallback to mouse/canvas delta if mobile delta wasn't used
      else if (!appliedLookDelta && (this.lookDelta.x !== 0 || this.lookDelta.y !== 0)) {
          // Apply mouse/canvas delta (already inverted in handler)
          this.yaw += this.lookDelta.x * this.mouseSensitivity;
          this.pitch += this.lookDelta.y * this.mouseSensitivity;
          appliedLookDelta = true;
          // console.log(`Applied mouse/canvas look delta: ${this.lookDelta.x}, ${this.lookDelta.y}`); // Debug
      }

      // Clamp pitch regardless of input source
      this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));

      // Reset SceneManager's internal delta (used by mouse/canvas touch) after applying it
      this.lookDelta.x = 0;
      this.lookDelta.y = 0;
      // --- End Apply Look Delta ---

      // Calculate camera rotation based on updated yaw and pitch
      const cameraRotation = new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

      // Smoothly interpolate FOV
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.targetFOV, this.zoomSpeed);
      this.camera.updateProjectionMatrix();

      // Calculate camera position based on player position, offset, and rotation
      const offset = new THREE.Vector3(0, this.cameraHeight, this.normalDistance) // Use normalDistance
        .applyQuaternion(cameraRotation);
      const targetCameraPosition = playerPosition.clone().add(offset);
      // console.log(`[SceneManager.updateCamera] Target Pos: ${targetCameraPosition.x.toFixed(2)},${targetCameraPosition.y.toFixed(2)},${targetCameraPosition.z.toFixed(2)} | Target Quat: ${cameraRotation.x.toFixed(2)},${cameraRotation.y.toFixed(2)},${cameraRotation.z.toFixed(2)},${cameraRotation.w.toFixed(2)}`); // DEBUG REMOVED

      // Apply position and rotation to the camera
      this.camera.position.copy(targetCameraPosition);
      this.camera.quaternion.copy(cameraRotation); // Set camera rotation directly
      // console.log(`[SceneManager.updateCamera] Final Cam Pos: ${this.camera.position.x.toFixed(2)},${this.camera.position.y.toFixed(2)},${this.camera.position.z.toFixed(2)} | Final Cam Quat: ${this.camera.quaternion.x.toFixed(2)},${this.camera.quaternion.y.toFixed(2)},${this.camera.quaternion.z.toFixed(2)},${this.camera.quaternion.w.toFixed(2)}`); // DEBUG REMOVED


      // Calculate forward and right vectors based on camera rotation
      const forward = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(cameraRotation)
        .setY(0)
        .normalize();

      const right = new THREE.Vector3(1, 0, 0)
        .applyQuaternion(cameraRotation)
        .setY(0)
        .normalize();

      // Only update player model orientation if not in free look mode
      if (playerModel && !this.freeLookActive) {
        // Make player model face the camera's forward direction
        const playerLookAt = playerPosition.clone().add(forward);
        playerModel.lookAt(playerLookAt);
        // Apply rotation offset if model's default forward is not Z+
        // playerModel.rotateY(Math.PI); // Uncomment if model faces Z- by default
      }
      // Note: When in free look, the server will use movementRotation instead

      return { forward, right }; // Return player's forward/right
    }
  }, // End of updateCamera method

  // Modified to accept and use mobileLookDelta
  updateTurretCameraLogic(mobileLookDelta = null) { // Define as a method within SceneManager
    // Only require the base turret mesh for camera logic, as cannon rotation is disabled for now.
    if (!this.turretMesh) {
        // console.warn("[SceneManager] updateTurretCameraLogic called but turretMesh is missing."); // Reduce console noise
        // Return default vectors if turret isn't ready
        return { forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) };
    }

    // Apply accumulated look delta to turret aim ONLY if not following a projectile
    let appliedLookDelta = false;
    if (!this.isFollowingProjectile) {
        // Prioritize mobile look delta if provided and non-zero
        if (mobileLookDelta && (mobileLookDelta.deltaX !== 0 || mobileLookDelta.deltaY !== 0)) {
            // Apply mobile delta using separate sensitivity. Invert signs to match mouse behavior.
            this.turretYaw -= mobileLookDelta.deltaX * this.mobileSensitivity; // Use mobileSensitivity
            this.turretPitch -= mobileLookDelta.deltaY * this.mobileSensitivity; // Use mobileSensitivity
            appliedLookDelta = true;
        }
        // Fallback to mouse/canvas delta if mobile delta wasn't used
        else if (!appliedLookDelta && (this.lookDelta.x !== 0 || this.lookDelta.y !== 0)) {
            // Apply mouse/canvas delta (already inverted in handler)
            this.turretYaw += this.lookDelta.x * this.mouseSensitivity;
            this.turretPitch -= this.lookDelta.y * this.mouseSensitivity; // Negate to invert vertical movement
            appliedLookDelta = true;
        }

        // Clamp turret pitch and yaw regardless of input source
        this.turretPitch = Math.max(this.turretMinPitch, Math.min(this.turretMaxPitch, this.turretPitch));
        this.turretYaw = Math.max(this.turretMinYaw, Math.min(this.turretMaxYaw, this.turretYaw));

        // Reset SceneManager's internal delta (used by mouse/canvas touch) after applying it
        this.lookDelta.x = 0;
        this.lookDelta.y = 0;
    }

    // --- Update Camera Position & Orientation ---
    // Calculate rotation based on turret aim (Yaw around Y, Pitch around X)
    // We want the camera to rotate *around* the turret base
    const turretBasePosition = this.turretMesh.position;
    const cameraRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.turretPitch, this.turretYaw, 0, 'YXZ'));

    // Apply offset relative to the turret base, then rotate it
    const rotatedOffset = this.turretCameraOffset.clone().applyQuaternion(cameraRotation);
    const targetCameraPosition = turretBasePosition.clone().add(rotatedOffset);

    this.camera.position.copy(targetCameraPosition);

    // Calculate a point in front of the camera to look at
    const lookDirection = new THREE.Vector3(0, 0, 1); // Camera looks down -Z by default
    lookDirection.applyQuaternion(cameraRotation); // Apply the turret's aim rotation
    const lookAtTarget = targetCameraPosition.clone().add(lookDirection); // Add direction to camera position
    this.camera.lookAt(lookAtTarget); // Make the camera look at the calculated point

    // --- Update Turret Cannon Mesh Rotation (Commented out as requested) ---
    // Apply the calculated pitch and yaw to the cannon mesh
    // Assuming the cannon model's default orientation aligns with the axes correctly.
    // Yaw rotation is typically around the Y-axis.
    // Pitch rotation is typically around the X-axis (or Z if the model is oriented differently).
    // We might need to apply rotations relative to the turret's base orientation if it's not zero.
    // this.turretCannonTopMesh.rotation.set(this.turretPitch, this.turretYaw, 0, 'YXZ'); // Use 'YXZ' order common for FPS controls

    // Ensure FOV is normal (no zoom in turret)
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.normalFOV, this.zoomSpeed);
    this.camera.updateProjectionMatrix();

    // Return forward/right vectors based on the calculated camera rotation for the turret view
    const forward = lookDirection; // Use the already calculated look direction
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraRotation).normalize();
    // Avoid using turretCannonTopMesh as it might be null and rotation is disabled anyway
    return { forward: forward, right: right }; // Return camera's orientation in turret mode
  }, // End of updateTurretCameraLogic method

  // New method to check if the turret is aiming at the terrain
  checkTurretTerrainTarget() {
    if (!this.isControllingTurret || !this.terrainMesh) {
      // Not in turret mode or terrain doesn't exist
      return false;
    }

    // Use the current camera's position and direction for the raycast
    const raycaster = new THREE.Raycaster();
    const cameraPosition = this.camera.position;
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection); // Get the direction the camera is looking

    raycaster.set(cameraPosition, cameraDirection);

    // Check for intersection specifically with the terrain mesh
    const intersects = raycaster.intersectObject(this.terrainMesh);

    // Return true if there's an intersection, false otherwise
    return intersects.length > 0;
  },

  // Renamed and updated to check platform first
  getPlatformOrTerrainHeight(x, z) { // Ensure this is the last method before the closing brace '};'
    // 1. Check Platform Collision
    if (this.platformMesh && this.platformBoundingBox) {
      // Simple AABB check for now (assumes player is roughly above the platform's XZ footprint)
      // A more robust check might involve raycasting down onto the platform mesh itself
      if (x >= this.platformBoundingBox.min.x && x <= this.platformBoundingBox.max.x &&
          z >= this.platformBoundingBox.min.z && z <= this.platformBoundingBox.max.z) {
        // If within the platform's horizontal bounds, return the platform's Y position plus the offset
        // This ensures the player stays slightly above the surface
        return PLATFORM_Y_POSITION + 2; // Added +2 offset
      }
    }

    // 2. Check Terrain Height (if not on platform)
    if (!this.terrainMesh) {
      console.warn("Terrain mesh not available for height check.");
      return 0; // Default height if terrain isn't ready
    }

    const raycaster = new THREE.Raycaster();
    // Cast ray downwards from a point high above the target x, z
    const origin = new THREE.Vector3(x, 100, z); // Start ray high up
    const direction = new THREE.Vector3(0, -1, 0); // Point straight down
    raycaster.set(origin, direction);

    const intersects = raycaster.intersectObject(this.terrainMesh);

    if (intersects.length > 0) {
      return intersects[0].point.y; // Return the Y coordinate of the intersection point
    }

    // console.warn(`No terrain intersection found at (${x}, ${z}). Returning default height 0.`);
    return 0; // Default height if no intersection (e.g., outside terrain bounds)
  },

  // Get the current direction the camera is facing
  getCameraDirection() {
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    return direction;
  },

  // --- Portal Creation ---
  createPortal(position, rotationY, labelText, destinationUrl) {
    console.log(`[SceneManager] Creating portal at ${position.toArray().join(',')} with label "${labelText}" leading to ${destinationUrl}`);
    const portalGroup = new THREE.Group(); // Group portal elements
    portalGroup.position.copy(position);
    portalGroup.rotation.y = rotationY;

    // --- Portal Visual (Swirling Shader) ---
    const sizeMultiplier = 1.4; // Increase size by another 40%
    const portalRadius = 1.5 * 1.3 * sizeMultiplier; // Further increased radius
    const portalHeight = 4 * 1.3 * sizeMultiplier;   // Further increased height
    const portalThickness = 0.2 * 1.3 * sizeMultiplier; // Further increase thickness
    const portalGeometry = new THREE.CylinderGeometry(portalRadius, portalRadius, portalThickness, 64, 1, true); // Increased segments for smoother look

    // --- Swirling Shader Material (Green/Purple) ---
    const portalVertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    const portalFragmentShader = `
        uniform float time;
        uniform vec3 baseColor; // Renamed from 'color'
        varying vec2 vUv;

        // Simple noise function
        float random(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }

        // Value noise function
        float noise(vec2 st) {
            vec2 i = floor(st);
            vec2 f = fract(st);
            float a = random(i);
            float b = random(i + vec2(1.0, 0.0));
            float c = random(i + vec2(0.0, 1.0));
            float d = random(i + vec2(1.0, 1.0));
            vec2 u = f * f * (3.0 - 2.0 * f); // Smoothstep
            return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        void main() {
            vec2 uv = vUv;
            // Create a swirling effect by rotating UVs based on distance from center and time
            vec2 center = vec2(0.5, 0.5);
            float dist = distance(uv, center);
            float angle = atan(uv.y - center.y, uv.x - center.x);
            float swirlIntensity = 0.5 + sin(dist * 10.0 + time * 2.0) * 0.5; // Pulsating swirl
            angle += swirlIntensity * 0.5; // Rotate based on intensity

            // Map back to UV coordinates
            uv = center + vec2(cos(angle), sin(angle)) * dist;

            // Use noise for texture/variation
            // float n = noise(uv * 5.0 + time * 0.5); // Removed duplicate declaration
            float n = noise(uv * 4.0 + time * 0.6); // Adjusted noise scale/speed

            // Define colors
            vec3 purple = baseColor; // Use the uniform base color (purple)
            vec3 green = vec3(0.1, 1.0, 0.2); // Vibrant green

            // Mix colors based on noise
            vec3 mixedColor = mix(purple, green, smoothstep(0.3, 0.7, n)); // Mix based on noise value

            // Combine noise and swirl for alpha mask (make edges softer)
            float edgeFade = smoothstep(0.0, 0.15, uv.y) * smoothstep(1.0, 0.85, uv.y); // Slightly softer fade
            float alpha = (n * 0.6 + 0.4) * edgeFade; // Ensure minimum opacity, apply edge fade

            gl_FragColor = vec4(mixedColor, alpha);
        }
    `;

    const portalMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0.0 },
            baseColor: { value: new THREE.Color(0xcc00ff) } // Purple base color
        },
        vertexShader: portalVertexShader,
        fragmentShader: portalFragmentShader,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false, // Important for transparency
        blending: THREE.AdditiveBlending // Make it glowy
    });

    const portalRingMesh = new THREE.Mesh(portalGeometry, portalMaterial);
    portalRingMesh.rotation.x = Math.PI / 2; // Rotate to stand upright
    portalRingMesh.position.y = portalHeight / 2; // Center vertically (using the *new* height)
    portalGroup.add(portalRingMesh);
    // Add userData to easily identify portal meshes later if needed
    portalRingMesh.userData.isPortalVisual = true; // Mark as part of the visual
    portalRingMesh.userData.destinationUrl = destinationUrl; // Keep URL reference if needed

    // --- Portal Face Visual (Filled Circle) ---
    const portalFaceGeometry = new THREE.CircleGeometry(portalRadius, 64); // Same radius, more segments
    // Use a slightly modified shader or different uniforms if desired, but start with the same
    const portalFaceMaterial = portalMaterial.clone(); // Clone the ring material initially
    // Optional: Modify face material uniforms (e.g., different color or time offset)
    // portalFaceMaterial.uniforms.color.value = new THREE.Color(0x80ffff); // Lighter cyan?

    const portalFaceMesh = new THREE.Mesh(portalFaceGeometry, portalFaceMaterial);
    // Position it at the same vertical center as the ring
    portalFaceMesh.position.y = portalHeight / 2;
    // No X rotation needed for CircleGeometry facing Z+ by default. It will align with the group's Y rotation.
    portalGroup.add(portalFaceMesh);
    portalFaceMesh.userData.isPortalVisual = true; // Mark as part of the visual

    // --- Portal Label Billboard ---
    let labelMesh = null;
    try {
        const billboardCanvas = document.createElement('canvas');
        const billboardContext = billboardCanvas.getContext('2d');
        const billboardWidth = 512; // Texture resolution
        const billboardHeight = 64;
        billboardCanvas.width = billboardWidth;
        billboardCanvas.height = billboardHeight;

        // Style the text
        billboardContext.fillStyle = 'rgba(20, 0, 40, 0.7)'; // Dark purple background
        billboardContext.fillRect(0, 0, billboardWidth, billboardHeight);
        billboardContext.font = 'bold 40px Orbitron, Roboto Mono, monospace'; // Slightly smaller font
        billboardContext.fillStyle = '#cc00ff'; // Purple text
        billboardContext.textAlign = 'center';
        billboardContext.textBaseline = 'middle';
        billboardContext.fillText(labelText.toUpperCase(), billboardWidth / 2, billboardHeight / 2);

        const billboardTexture = new THREE.CanvasTexture(billboardCanvas);
        billboardTexture.needsUpdate = true;

        const billboardAspect = billboardWidth / billboardHeight;
        const billboardPlaneHeight = 0.6; // Slightly larger than turret billboard
        const billboardPlaneWidth = billboardPlaneHeight * billboardAspect;

        const billboardGeometry = new THREE.PlaneGeometry(billboardPlaneWidth, billboardPlaneHeight);
        const billboardMaterial = new THREE.MeshBasicMaterial({
          map: billboardTexture,
          transparent: true,
          side: THREE.DoubleSide,
          depthTest: false, // Render on top
        });

        labelMesh = new THREE.Mesh(billboardGeometry, billboardMaterial);
        // Position above the portal visual
        const billboardYOffset = portalHeight + 0.5; // Place above the cylinder visual
        labelMesh.position.set(0, billboardYOffset, 0);
        // Billboard doesn't need parent rotation applied if it always faces camera (standard billboard)
        // If it should be fixed relative to the portal group, no extra rotation needed here.
        portalGroup.add(labelMesh);
        console.log(`[SceneManager] Added portal label: "${labelText}"`);

    } catch (billboardError) {
        console.error('[SceneManager] Failed to create portal label:', billboardError);
    }

    // --- Trigger Zone (Adjusted for new size) ---
    // Make it slightly larger than the new visual size
    const triggerSize = new THREE.Vector3(portalRadius * 2.5, portalHeight * 1.2, portalRadius * 2.5); // Uses further updated radius/height
    const triggerZone = new THREE.Box3();
    // Box3 is axis-aligned, so we set it based on the group's world position and the desired size
    // We need to calculate the world position of the portal center first
    const worldPosition = new THREE.Vector3();
    portalGroup.getWorldPosition(worldPosition);
    // Adjust center Y based on portal height
    const triggerCenter = worldPosition.clone().add(new THREE.Vector3(0, portalHeight / 2, 0));
    triggerZone.setFromCenterAndSize(triggerCenter, triggerSize); // Use calculated center
    // Optional: Visualize the trigger zone
    // const helper = new THREE.Box3Helper(triggerZone, 0xff00ff); // Magenta helper
    // this.scene.add(helper);
    // Store the helper on the portal data if created, so it can be updated/removed
    // portalData.triggerHelper = helper;

    // Add the complete portal group to the scene
    this.scene.add(portalGroup);

    // Store portal data for collision checks later
    // Add references to both visual meshes if needed for separate control
    this.portals.push({
        mesh: portalGroup, // Store the group
        visualMeshRing: portalRingMesh,
        visualMeshFace: portalFaceMesh,
        labelMesh: labelMesh, // Reference to the label
        destinationUrl: destinationUrl,
        triggerZone: triggerZone // Store the calculated Box3
    });

    return portalGroup; // Return the created group
  },

  // --- Setup Portals based on URL ---
  setupPortals() {
    if (!this.platformMesh) {
        console.error("[SceneManager] Cannot setup portals: Platform mesh not loaded.");
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const cameFromPortal = params.get('portal') === 'true';
    const refUrl = params.get('ref');
    const currentOrigin = window.location.origin + window.location.pathname; // URL of this game

    const platformPosition = this.platformMesh.position;
    const platformRadius = 25; // Approximate radius based on scale and model size

    // --- Create Exit Portal ---
    // Place towards the back edge (Z approx -270)
    const exitPortalXOffset = -6; // Reduced offset to the left
    const portalZ = platformPosition.z - platformRadius * 0.8; // Z position near -270
    const exitPortalPosition = new THREE.Vector3(
        platformPosition.x + exitPortalXOffset, // Use reduced offset
        PLATFORM_Y_POSITION + 0.1, // Slightly above platform surface
        portalZ
    );
    const exitPortalRotation = 0; // Face towards the center/front
    const exitPortalLabel = "Vibeverse Portal";
    const exitPortalDestination = "http://portal.pieter.com"; // The main portal hub
    this.createPortal(exitPortalPosition, exitPortalRotation, exitPortalLabel, exitPortalDestination);

    // --- Create Return Portal (if applicable) ---
    // Place next to the exit portal, also near Z = -270
    if (cameFromPortal && refUrl) {
        console.log(`[SceneManager] Player arrived from portal: ${refUrl}. Creating return portal.`);
        const returnPortalXOffset = 6; // Reduced offset to the right
        const returnPortalPosition = new THREE.Vector3(
            platformPosition.x + returnPortalXOffset, // Use reduced offset
            PLATFORM_Y_POSITION + 0.1, // Slightly above platform surface
            portalZ // Same Z as the exit portal
        );
        const returnPortalRotation = 0; // Also face towards the center/front
        // Extract domain for label, handle potential errors
        let returnLabel = "Return Portal";
        try {
            const refDomain = new URL(refUrl).hostname;
            returnLabel = `Return to ${refDomain}`;
        } catch (e) {
            console.warn(`[SceneManager] Could not parse ref URL hostname: ${refUrl}`);
            returnLabel = "Return"; // Fallback label
        }

        this.createPortal(returnPortalPosition, returnPortalRotation, returnLabel, refUrl); // Destination is the refUrl
    } else {
        console.log("[SceneManager] Player did not arrive from a portal or no ref URL provided. No return portal created.");
    }
  }
};
