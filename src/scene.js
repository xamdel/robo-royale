import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'; //for metallic reflections
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VertexNormalsHelper } from 'three/examples/jsm/helpers/VertexNormalsHelper.js'; // Import VertexNormalsHelper instead
import { weaponSystem } from './weapons';
import { particleEffectSystem } from './systems/ParticleEffectSystem.js';

export const SceneManager = {
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000),
  renderer: new THREE.WebGLRenderer({ antialias: true }),
  gltfLoader: new GLTFLoader(),
  collisionMesh: null, // Reference to the world collision mesh
  worldMesh: null, // Reference to the visual world mesh
  cameraOffset: new THREE.Vector3(0, 3, 7), // Third-person camera offset
  cameraDistance: 5, // Distance from player
  cameraHeight: 4, // Height offset
  freeLookActive: false, // Free look mode toggle
  mouseSensitivity: 0.002, // Mouse sensitivity
  yaw: 0, // Horizontal camera rotation
  pitch: -0.3, // Vertical camera rotation (slightly looking down)
  minPitch: -0.8, // Limit looking down
  maxPitch: 0.8, // Limit looking up
  debugHelpers: {
    groundRay: null, // For visualizing ground check ray
    collisionNormals: null, // For visualizing collision mesh normals
    // existing helpers...
  }, // Store debug helpers

  init() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;
    document.body.appendChild(this.renderer.domElement);
    
    // Setup mouse controls
    this.setupMouseControls();

    // Set scene background color to sky blue
    this.scene.background = new THREE.Color('#87CEEB');

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 4096;
    directionalLight.shadow.mapSize.height = 4096; // Increased resolution
    directionalLight.shadow.camera.near = 1; // Adjusted near plane
    directionalLight.shadow.camera.far = 100; // Adjusted far plane
    directionalLight.shadow.camera.left = -50; // Added left plane
    directionalLight.shadow.camera.right = 50; // Added right plane
    directionalLight.shadow.camera.top = 50; // Added top plane
    directionalLight.shadow.camera.bottom = -50; // Added bottom plane
    directionalLight.shadow.bias = -0.001; // Reduce shadow acne
    this.scene.add(directionalLight);

    // Add shadow camera helper for debugging
    this.debugHelpers.shadowCamera = new THREE.CameraHelper(directionalLight.shadow.camera);
    this.scene.add(this.debugHelpers.shadowCamera);
    this.debugHelpers.shadowCamera.visible = false;

    // Load the world model instead of the plane
    this.loadWorldModel();

    // Set initial camera position (adjust if needed based on map)
    this.camera.position.set(0, 10, 10); // Keep initial for now
    this.camera.lookAt(0, 0, 0);

    // Handle window resize
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  },

  async loadWorldModel() {
    try {
      const gltf = await this.gltfLoader.loadAsync('/assets/models/world.glb');
      console.log("World GLB loaded", gltf);

      // Debug: List all meshes in the file for verification
      console.log("World GLB contents:");
      gltf.scene.traverse((child) => {
        if (child.isMesh) {
          console.log(`- Mesh: ${child.name}, Vertices: ${child.geometry.attributes.position.count}`);
        }
      });

      gltf.scene.traverse((child) => {
        if (child.isMesh) {
          if (child.name === 'World_Collision') {
            this.collisionMesh = child;
            // Debug: Make the collision mesh visible but semi-transparent for debugging
            // this.collisionMesh.visible = true;
            // // Ensure material exists and is modifiable
            // if (!this.collisionMesh.material) {
            //   this.collisionMesh.material = new THREE.MeshBasicMaterial();
            // } else if (Array.isArray(this.collisionMesh.material)) {
            //   // Handle multi-material case if necessary, for now just use the first
            //   this.collisionMesh.material = this.collisionMesh.material[0];
            // }
            // this.collisionMesh.material.transparent = true;
            // this.collisionMesh.material.opacity = 0.3;
            // this.collisionMesh.material.color.set(0xff0000); // Red for visibility
            // this.collisionMesh.material.needsUpdate = true; // Important for changes to take effect

            // Ensure raycaster hits both sides of the faces
            if (this.collisionMesh.material) {
                this.collisionMesh.material.side = THREE.DoubleSide;
                this.collisionMesh.material.needsUpdate = true;
            } else {
                 // If no material, create one set to DoubleSide
                 this.collisionMesh.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, visible: false }); // Keep it invisible unless debugging visibility
            }
            console.log("Set collision mesh material to DoubleSide for raycasting.");

            // console.log("Found collision mesh:", this.collisionMesh);

            // // Debug: Output collision mesh bounding box
            // const box = new THREE.Box3().setFromObject(this.collisionMesh);
            // const size = box.getSize(new THREE.Vector3());
            // const center = box.getCenter(new THREE.Vector3());
            // console.log("Collision mesh bounds:", {
            //   min: box.min,
            //   max: box.max,
            //   size: size,
            //   center: center
            // });

            // Debug: Add normal helpers to visualize face normals
            if (this.debugHelpers.collisionNormals) {
              this.scene.remove(this.debugHelpers.collisionNormals); // Remove old one if exists
            }
            // Use VertexNormalsHelper for collision mesh
            // Ensure geometry has normals computed (GLTFLoader usually handles this)
            if (this.collisionMesh.geometry.attributes.normal) {
              this.debugHelpers.collisionNormals = new VertexNormalsHelper( this.collisionMesh, 0.5, 0x00ff00 ); // Green lines for vertex normals
              this.scene.add( this.debugHelpers.collisionNormals );
              console.log("Added collision mesh vertex normal helper");
            } else {
              console.warn("Collision mesh geometry missing normals, cannot add helper.");
            }

          } else if (child.name === 'World_Visual') {
            this.worldMesh = child;
            // Apply shadows recursively to visual mesh parts
            this.worldMesh.traverse(visualPart => {
              if (visualPart.isMesh) {
                visualPart.castShadow = true;
                visualPart.receiveShadow = true;
              }
            });
            this.scene.add(this.worldMesh);
            console.log("Added visual world mesh to scene:", this.worldMesh);
          } else {
             // Handle other meshes in the GLB if necessary
             // For now, assume only World_Visual and World_Collision are top-level relevant meshes
             // If they are nested, this logic needs adjustment.
             // Let's ensure nested visual parts also get shadows:
             if (child.parent && child.parent.name === 'World_Visual') {
                child.castShadow = true;
                child.receiveShadow = true;
             }
          }
        }
      });

      if (!this.worldMesh) {
         console.warn("World_Visual mesh not found in world.glb. Adding entire scene.");
         // Fallback: add the whole scene, apply shadows broadly
         gltf.scene.traverse( node => {
            if (node.isMesh) {
               node.castShadow = true;
               node.receiveShadow = true;
            }
         });
         this.scene.add(gltf.scene);
         // Attempt to find collision mesh anyway
         if (!this.collisionMesh) {
            gltf.scene.traverse( node => {
               if (node.name === 'World_Collision') {
                  this.collisionMesh = node;
                  this.collisionMesh.visible = false;
               }
            });
         }
      }
      if (!this.collisionMesh) {
         console.error("CRITICAL: World_Collision mesh not found in world.glb!");
      }

      // Adjust shadow camera bounds based on the loaded world model if needed
      // Example: Calculate bounding box and adjust light.shadow.camera
      // const box = new THREE.Box3().setFromObject(this.worldMesh || gltf.scene);
      // const size = box.getSize(new THREE.Vector3());
      // const center = box.getCenter(new THREE.Vector3());
      // Adjust directionalLight.shadow.camera properties here...
      // directionalLight.shadow.camera.left = -size.x / 2;
      // directionalLight.shadow.camera.right = size.x / 2;
      // ... etc. (Requires directionalLight reference)

    } catch (error) {
      console.error("Failed to load world model:", error);
      // Add fallback plane?
      const fallbackGeometry = new THREE.PlaneGeometry(100, 100);
      const fallbackMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 }); // Red error plane
      const fallbackPlane = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
      fallbackPlane.rotation.x = -Math.PI / 2;
      fallbackPlane.receiveShadow = true;
      this.scene.add(fallbackPlane);
    }
  },

  // Add this method for visualizing rays
  showDebugRay(origin, direction, distance, color = 0xff0000) {
    // Remove previous ray and its spheres if they exist
    if (this.debugHelpers.groundRay) {
      if (this.debugHelpers.groundRay.userData.startSphere) {
        this.scene.remove(this.debugHelpers.groundRay.userData.startSphere);
      }
      if (this.debugHelpers.groundRay.userData.endSphere) {
        this.scene.remove(this.debugHelpers.groundRay.userData.endSphere);
      }
      this.scene.remove(this.debugHelpers.groundRay);
      this.debugHelpers.groundRay = null; // Clear the reference
    }

    // Create the ray visualization
    const rayEnd = direction.clone().multiplyScalar(distance).add(origin);
    const points = [origin.clone(), rayEnd.clone()];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color });
    const ray = new THREE.Line(geometry, material);

    // Add ray to scene and store reference
    this.scene.add(ray);
    this.debugHelpers.groundRay = ray;

    // Add small spheres at start and end points for better visibility
    const sphereGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    const sphereMaterial = new THREE.MeshBasicMaterial({ color });

    const startSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    startSphere.position.copy(origin);
    this.scene.add(startSphere);

    const endSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    endSphere.position.copy(rayEnd);
    this.scene.add(endSphere);

    // Store spheres to be removed later
    ray.userData = {
      startSphere,
      endSphere
    };

    return ray;
  },

  // Client-side raycasting using THREE.Raycaster
  performRaycast(rayOrigin, rayDirection, maxDistance) {
    // Debug visualization
    this.showDebugRay(rayOrigin, rayDirection, maxDistance);

    if (!this.collisionMesh) {
      console.warn("Collision mesh not available for raycasting.");
      return []; // Return empty array if no mesh
    }

    const raycaster = new THREE.Raycaster(rayOrigin, rayDirection, 0, maxDistance);
    // Ensure raycaster checks against the collision mesh and its children
    const intersects = raycaster.intersectObject(this.collisionMesh, true);

    // Log detailed information about the raycast
    // console.log("Client Raycast:", {
    //   origin: rayOrigin.toArray(),
    //   direction: rayDirection.toArray(),
    //   maxDistance,
    //   hits: intersects.length,
    //   firstHit: intersects.length > 0 ? {
    //     distance: intersects[0].distance,
    //     point: intersects[0].point.toArray(),
    //     normal: intersects[0].face ? intersects[0].face.normal.toArray() : null
    //   } : null
    // });

    // Rate limit the logging
    // if (!this.lastRaycastLog || Date.now() - this.lastRaycastLog > 100) {
    //   console.log("Client Raycast:", {
    //     origin: rayOrigin.toArray(),
    //     direction: rayDirection.toArray(),
    //     maxDistance,
    //     hits: intersects.length,
    //     firstHit: intersects.length > 0 ? {
    //       distance: intersects[0].distance,
    //       point: intersects[0].point.toArray(),
    //       normal: intersects[0].face ? intersects[0].face.normal.toArray() : null
    //     } : null
    //   });
    //   this.lastRaycastLog = Date.now();
    // }

    return intersects; // Returns array of intersection objects [{ distance, point, face, object, ... }]
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
    const deltaTime = this.lastRenderTime ? (now - this.lastRenderTime)/1000 : 0;
    this.lastRenderTime = now;

    // Rotate pickups for visual effect
    if (this.cannon && this.cannonCollider) {
      this.cannon.rotation.y += deltaTime * 0.5;
      const worldPos = new THREE.Vector3();
      this.cannon.getWorldPosition(worldPos);
      this.cannonCollider.center.copy(worldPos);
    }
    
    if (this.rocketLauncher && this.rocketLauncherCollider) {
      this.rocketLauncher.rotation.y += deltaTime * 0.5;
      const worldPos = new THREE.Vector3();
      this.rocketLauncher.getWorldPosition(worldPos);
      this.rocketLauncherCollider.center.copy(worldPos);
    }
    
    this.renderer.render(this.scene, this.camera);
  },

  setupMouseControls() {
    // Mouse movement handler
    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement === document.body) {
        // Apply mouse movement to camera rotation
        this.yaw -= event.movementX * this.mouseSensitivity;
        this.pitch -= event.movementY * this.mouseSensitivity;
        
        // Clamp pitch to prevent camera flipping
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
      }
    });
    
    // Pointer lock setup
    document.addEventListener('click', () => {
      if (document.pointerLockElement !== document.body) {
        document.body.requestPointerLock();
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
  },

  async addWeaponPickups() {
    try {
      console.log('[WEAPON PICKUP] Creating cannon pickup');
      const cannonWeapon = await weaponSystem.weaponFactory.createWeapon('cannon');
      
      if (!cannonWeapon) {
        console.error('[WEAPON PICKUP] Failed to create cannon weapon');
        return;
      }
      
      console.log('[WEAPON PICKUP] Cannon created, adding to scene', cannonWeapon);
      this.cannon = cannonWeapon.model;
      
      if (!this.cannon) {
        console.error('[WEAPON PICKUP] Cannon weapon has no model property');
        return;
      }
      
      this.cannon.position.set(0, 0, -10);
      this.cannon.castShadow = true;
      
      // Ensure the model is visible
      this.cannon.visible = true;
      this.cannon.traverse(child => {
        if (child.isMesh) {
          child.visible = true;
          child.castShadow = true;
        }
      });
      
      this.scene.add(this.cannon);
      console.log('[WEAPON PICKUP] Cannon added to scene at position', this.cannon.position.toArray());
      
      this.cannonCollider = new THREE.Sphere(
        this.cannon.position.clone(),
        2.5 // Pickup radius
      );

      console.log('[WEAPON PICKUP] Creating rocket launcher pickup');
      const rocketWeapon = await weaponSystem.weaponFactory.createWeapon('rocketLauncher');
      
      if (!rocketWeapon) {
        console.error('[WEAPON PICKUP] Failed to create rocket launcher weapon');
        return;
      }
      
      console.log('[WEAPON PICKUP] Rocket launcher created, adding to scene', rocketWeapon);
      this.rocketLauncher = rocketWeapon.model;
      
      if (!this.rocketLauncher) {
        console.error('[WEAPON PICKUP] Rocket launcher weapon has no model property');
        return;
      }
      
      this.rocketLauncher.position.set(10, 0, -10);
      this.rocketLauncher.castShadow = true;
      
      // Ensure the model is visible
      this.rocketLauncher.visible = true;
      this.rocketLauncher.traverse(child => {
        if (child.isMesh) {
          child.visible = true;
          child.castShadow = true;
        }
      });
      
      this.scene.add(this.rocketLauncher);
      console.log('[WEAPON PICKUP] Rocket launcher added to scene at position', this.rocketLauncher.position.toArray());
      
      this.rocketLauncherCollider = new THREE.Sphere(
        this.rocketLauncher.position.clone(),
        2.5 // Pickup radius
      );
    } catch (error) {
      console.error('Error adding weapon pickups:', error);
    }
  },

  updateCamera(playerPosition, playerModel) {
    const cameraRotation = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    const offset = new THREE.Vector3(0, this.cameraHeight, this.cameraDistance)
      .applyQuaternion(cameraRotation);

    const targetCameraPosition = playerPosition.clone().add(offset);
    this.camera.position.copy(targetCameraPosition);
    this.camera.quaternion.copy(cameraRotation);

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
      const playerRotation = cameraRotation.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), Math.PI)
      );
      playerModel.quaternion.copy(playerRotation);
    }
    // Note: When in free look, the server will use movementRotation instead

    return { forward, right };
  },
};
