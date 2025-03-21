import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SceneManager } from './scene.js';
import { Debug } from './main.js';

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
  
  // Socket definitions for weapon attachment
  weaponSockets: {
    leftArm: {
      boneName: 'ArmL',  // The exact bone name from the model
      position: [0.5, 0, 0],  // Local position relative to bone
      rotation: [0, 0, 0],  // Rotation in radians [x, y, z]
      scale: 1,  // Scale factor for attached weapons
      attachmentCallback: null  // Optional function to call when weapon is attached
    },
    rightArm: {
      boneName: 'ArmR',  // Right arm bone name
      position: [-0.5, 0, 0],  // Mirror of left arm
      rotation: [0, -Math.PI/2, 0],  // Pointing outward
      scale: 0.2
    },
    shoulderLeft: {
      boneName: 'ShoulderL',
      position: [0, 0.3, 0],
      rotation: [0, 0, 0],
      scale: 0.25
    },
    shoulderRight: {
      boneName: 'ShoulderR',
      position: [0, 0.3, 0],
      rotation: [0, 0, 0],
      scale: 0.25
    }
    // Add more sockets as needed
  },
  
  // Weapon type definitions - adjust settings for each weapon
  weaponTypes: {
    cannon: {
      socket: 'leftArm',  // Default socket to attach to
      positionOffset: [0, 0, 0],  // Additional offset from socket position
      rotationOffset: [0, 0, 0],  // Additional rotation offset
      scaleMultiplier: 1.0,  // Additional scaling
      effectColor: 0xffff00  // Color for pickup effect
    },
    rocketLauncher: {
      socket: 'rightArm',
      positionOffset: [0, 0.1, 0],
      rotationOffset: [0, 0, 0],
      scaleMultiplier: 1.2,
      effectColor: 0xff0000
    }
    // Add more weapon types as needed
  },

  loadMechModel() {
    return new Promise((resolve) => {
      const loader = new GLTFLoader();
      loader.load('assets/models/Mech-norootmotion.glb', (gltf) => {
        const model = gltf.scene;
        console.log('Loaded mech model with animations:', gltf.animations);

        // Improved left arm bone finding with debugging
        this.leftArm = null;
        console.log('Searching for left arm bone...');
        
        // First, log all top-level objects in the model
        model.children.forEach(child => {
          console.log(`Top level child: ${child.name}, type: ${child.type}`);
        });
        
        // More thorough traversal with detailed logging
        model.traverse((child) => {
          // Log all bones/objects with "arm" in their name
          if (child.name.toLowerCase().includes('arm')) {
            console.log(`Found arm-related node: ${child.name}, type: ${child.type || 'no type'}`);
          }
          
          // Try multiple possible bone naming conventions
          if (child.name === 'Arm.L' || 
              child.name === 'arm_L' || 
              child.name === 'ArmL' ||
              child.name === 'L_Arm' || 
              child.name.toLowerCase().includes('arm') && 
              (child.name.includes('l') || child.name.includes('L'))) {
            
            console.log('Found possible left arm bone:', child);
            
            // If we haven't set a left arm yet, or this one seems more likely
            if (!this.leftArm || child.name === 'Arm.L') {
              this.leftArm = child;
              console.log(`Setting leftArm reference to: ${child.name}`);
            }
          }
        });
        
        if (this.leftArm) {
          console.log('Successfully found left arm bone:', {
            name: this.leftArm.name,
            path: this.getBoneHierarchy(this.leftArm)
          });
        } else {
          console.error('Left arm bone not found! Model hierarchy may be different than expected.');
          // As a fallback, try to find the bone through the armature directly
          model.traverse((child) => {
            if (child.type === 'Bone' && child.name.toLowerCase().includes('arm') && 
                (child.name.includes('l') || child.name.includes('L'))) {
              console.log('Fallback: Found bone that might be left arm:', child.name);
              this.leftArm = child;
            }
          });
        }

        // Set up animations
        this.mixer = new THREE.AnimationMixer(model);
        this.actions = {};
        
        gltf.animations.forEach((clip) => {
          // Use exact animation names from Mech.glb
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
    // Maintain loaded model's Y position
    this.player.position.set(0, playerModel.position.y, 0);
    SceneManager.add(this.player);

    // Set up animation looping for all actions
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
    
    // Initialize weapon debugging tools
    this.initDebugTools();
  },

  // Initialize debug tools for weapon positioning
  initDebugTools() {
    if (!window.Debug) {
      window.Debug = { state: { enabled: false } };
    }
    
    // Add debug commands to the window object for console access
    window.debugWeapons = {
      showBones: () => {
        this.visualizeBones();
        return "Bone visualization enabled";
      },
      findBestPosition: () => {
        this.findBestWeaponPosition();
        return "Test markers added at various positions";
      },
      tryAttach: (x, y, z, rotX, rotY, rotZ, scale) => {
        this.tryAttachAtPosition(x, y, z, rotX, rotY, rotZ, scale);
        return `Trying attachment at [${x}, ${y}, ${z}] with rotation [${rotX}, ${rotY}, ${rotZ}] and scale ${scale}`;
      },
      detach: () => {
        this.detachCannon();
        return "Detached cannon";
      }
    };
    
    console.log("Debug tools initialized. Use window.debugWeapons.* functions in console");
  },

  // Visualize bone positions to help with attachment
  visualizeBones() {
    // Remove existing visualizers
    if (this.boneVisualizers) {
      this.boneVisualizers.forEach(helper => {
        SceneManager.scene.remove(helper);
      });
    }
    
    this.boneVisualizers = [];
    
    // Helper function to create a visual marker at a bone
    const createBoneMarker = (bone, color = 0xff0000) => {
      // Create a small sphere to mark the bone position
      const geometry = new THREE.SphereGeometry(0.1, 8, 8);
      const material = new THREE.MeshBasicMaterial({ color });
      const marker = new THREE.Mesh(geometry, material);
      
      // Add axes helper to show orientation
      const axesHelper = new THREE.AxesHelper(0.5);
      marker.add(axesHelper);
      
      // Add to the bone
      bone.add(marker);
      
      // Store for later removal
      this.boneVisualizers.push(marker);
      
      // Log the bone's world position
      const worldPos = new THREE.Vector3();
      bone.getWorldPosition(worldPos);
      console.log(`Bone "${bone.name}" world position:`, worldPos);
      
      return marker;
    };
    
    // Visualize important bones
    if (this.leftArm) {
      console.log('Visualizing left arm bone');
      createBoneMarker(this.leftArm, 0xff0000); // Red for left arm
      
      // Create markers for parent bones to see hierarchy
      let parent = this.leftArm.parent;
      let color = 0x00ff00; // Start with green
      
      while (parent && parent.name) {
        console.log(`Visualizing parent bone: ${parent.name}`);
        createBoneMarker(parent, color);
        parent = parent.parent;
        color = color === 0x00ff00 ? 0x0000ff : 0x00ff00; // Alternate colors
      }
    }
    
    // Log entire bone structure
    this.logBoneStructure();
  },

  // Log detailed bone structure info
  logBoneStructure() {
    if (!this.player) {
      console.error('Player model not loaded');
      return;
    }
    
    console.log('=== FULL BONE STRUCTURE ===');
    const logNode = (node, depth = 0) => {
      const indent = '  '.repeat(depth);
      const localPos = node.position.toArray().map(n => n.toFixed(2));
      const worldPos = new THREE.Vector3();
      node.getWorldPosition(worldPos);
      const worldPosArr = worldPos.toArray().map(n => n.toFixed(2));
      
      console.log(`${indent}${node.name || 'unnamed'} - Local: [${localPos}], World: [${worldPosArr}]`);
      
      node.children.forEach(child => {
        logNode(child, depth + 1);
      });
    };
    
    this.player.children.forEach(child => {
      logNode(child);
    });
  },

  // Create test object at a known position
  createTestObject(position = [0, 0, 0], color = 0xff00ff) {
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const material = new THREE.MeshBasicMaterial({ color });
    const testCube = new THREE.Mesh(geometry, material);
    testCube.position.set(...position);
    SceneManager.scene.add(testCube);
    return testCube;
  },

  // Find the best position for the weapon through testing
  findBestWeaponPosition() {
    if (!this.leftArm) {
      console.error('Left arm not found');
      return;
    }
    
    // Test different offsets and display them
    const offsets = [
      { name: "Zero", pos: [0, 0, 0], color: 0xff0000 },
      { name: "Forward", pos: [0, 0, 1], color: 0x00ff00 },
      { name: "Right", pos: [1, 0, 0], color: 0x0000ff },
      { name: "Up", pos: [0, 1, 0], color: 0xffff00 },
      { name: "Custom", pos: [0.5, -0.3, 0.7], color: 0xff00ff }
    ];
    
    this.testMarkers = [];
    offsets.forEach(offset => {
      // Create a marker at this offset from the arm
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 8),
        new THREE.MeshBasicMaterial({ color: offset.color })
      );
      
      // Add to the arm at the offset position
      this.leftArm.add(marker);
      marker.position.set(...offset.pos);
      
      // Add label
      const worldPos = new THREE.Vector3();
      marker.getWorldPosition(worldPos);
      console.log(`Test position "${offset.name}" at local ${offset.pos}, world: ${worldPos.toArray()}`);
      
      this.testMarkers.push(marker);
    });
    
    console.log('Test markers added to visualize potential weapon positions');
  },

  // Method to try different attachment positions
  tryAttachAtPosition(x = 0, y = 0, z = 0, rotX = 0, rotY = 0, rotZ = 0, scale = 1) {
    if (!SceneManager.cannon || !this.leftArm) {
      console.error("Cannot test - missing cannon or arm reference");
      return;
    }
    
    // If already attached, detach first
    if (this.cannonAttached) {
      this.detachCannon();
    }
    
    // Store original scale
    const originalScale = SceneManager.cannon.scale.clone();
    
    // Remove from scene and parent to arm
    SceneManager.scene.remove(SceneManager.cannon);
    this.leftArm.add(SceneManager.cannon);
    
    // Apply test position, rotation, and scale
    SceneManager.cannon.position.set(x, y, z);
    SceneManager.cannon.rotation.set(rotX, rotY, rotZ);
    SceneManager.cannon.scale.set(
      originalScale.x * scale,
      originalScale.y * scale,
      originalScale.z * scale
    );
    
    console.log(`Cannon placed at [${x}, ${y}, ${z}] with rotation [${rotX}, ${rotY}, ${rotZ}] and scale ${scale}`);
    
    // Mark as attached
    SceneManager.cannonAttached = true;
    this.cannonAttached = true;
  },

  // Method to detach the cannon
  detachCannon() {
    if (!SceneManager.cannon) {
      console.error("Cannot detach - missing cannon reference");
      return;
    }
    
    // Get world position and rotation
    const worldPos = new THREE.Vector3();
    SceneManager.cannon.getWorldPosition(worldPos);
    
    const worldRot = new THREE.Euler();
    worldRot.setFromQuaternion(SceneManager.cannon.getWorldQuaternion(new THREE.Quaternion()));
    
    // Remove from parent and add back to scene
    SceneManager.cannon.parent.remove(SceneManager.cannon);
    SceneManager.scene.add(SceneManager.cannon);
    
    // Restore position and rotation
    SceneManager.cannon.position.copy(worldPos);
    SceneManager.cannon.rotation.copy(worldRot);
    
    // Reset flags
    SceneManager.cannonAttached = false;
    this.cannonAttached = false;
    
    // Reset collider
    SceneManager.cannonCollider = new THREE.Sphere(
      SceneManager.cannon.position.clone(),
      2.5 // Same pickup radius as initial
    );
    
    console.log("Cannon detached and returned to scene");
  },

  updateAnimation(isMoving) {
    let targetAction = null;

    // Prioritize strafe movements using exact animation names
    if (this.moveLeft) {
      targetAction = this.actions['RunLeft-loop'];
    } else if (this.moveRight) {
      targetAction = this.actions['RunRight-loop'];
    } else if (this.moveBackward) {
      targetAction = this.actions['RunBackward-loop'];
    } else if (isMoving) {
      targetAction = this.actions['RunForward-loop'];
    }

    // Handle idle state
    if (!isMoving && !this.moveLeft && !this.moveRight && !this.moveBackward) {
      targetAction = this.actions['Stand'];
    }

    if (targetAction && this.currentAction !== targetAction) {
        if (this.currentAction) {
            this.currentAction.fadeOut(0.2);
            this.currentAction.setEffectiveWeight(0);
        }
        targetAction.reset();
        targetAction.setEffectiveWeight(1);
        targetAction.fadeIn(0.2).play();
        this.currentAction = targetAction;
    } else if (!isMoving && this.currentAction) {
      this.currentAction.fadeOut(0.2);
      this.currentAction.setEffectiveWeight(0);
      this.currentAction = null;
    }
  },

  updateOtherPlayerAnimation(player) {
    if (!player.targetPosition || !player.previousPosition) {
      player.previousPosition = player.mesh.position.clone();
      return;
    }
    
    // Check if player is moving
    const distance = player.mesh.position.distanceTo(player.previousPosition);
    const isMoving = distance > 0.01;
    player.previousPosition = player.mesh.position.clone();
    
    let targetAction = null;
    
    if (isMoving) {
      // Use RunForward-loop for movement
      targetAction = player.actions['RunForward-loop'];
    } else {
      // Use Stand for idle
      targetAction = player.actions['Stand'];
    }
    
    if (targetAction && player.currentAction !== targetAction) {
      if (player.currentAction) {
        player.currentAction.fadeOut(0.2);
        player.currentAction.setEffectiveWeight(0);
      }
      targetAction.reset();
      targetAction.setEffectiveWeight(1);
      targetAction.fadeIn(0.2).play();
      player.currentAction = targetAction;
    } else if (!isMoving && player.currentAction) {
      player.currentAction.fadeOut(0.2);
      player.currentAction.setEffectiveWeight(0);
      player.currentAction = null;
    }
  },

  createPlayerMesh(id) {
    if (!this.mechModel) {
      console.error("Mech model not loaded yet");
      return null;
    }
    const mesh = SkeletonUtils.clone(this.mechModel);
    mesh.position.set(0, 0, 0);
    
    // Create animation mixer for this player
    const mixer = new THREE.AnimationMixer(mesh);
    
    // Clone animation actions using new animation names
    const runForwardAction = this.actions['RunForward-loop'] ? 
      mixer.clipAction(this.actions['RunForward-loop']._clip) : null;
    const runBackwardAction = this.actions['RunBackward-loop'] ? 
      mixer.clipAction(this.actions['RunBackward-loop']._clip) : null;
    const runLeftAction = this.actions['RunLeft-loop'] ? 
      mixer.clipAction(this.actions['RunLeft-loop']._clip) : null;
    const runRightAction = this.actions['RunRight-loop'] ? 
      mixer.clipAction(this.actions['RunRight-loop']._clip) : null;
    const standAction = this.actions['Stand'] ? 
      mixer.clipAction(this.actions['Stand']._clip) : null;
    
    // Set up looping for run animations
    [runForwardAction, runBackwardAction, runLeftAction, runRightAction].forEach(action => {
      if (action) action.setLoop(THREE.LoopRepeat);
    });
    
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
      mixer: mixer,
      actions: {
        'RunForward-loop': runForwardAction,
        'RunBackward-loop': runBackwardAction,
        'RunLeft-loop': runLeftAction,
        'RunRight-loop': runRightAction,
        'Stand': standAction
      },
      currentAction: null,
      isRunning: false,
      targetPosition: null,
      targetRotation: 0,
      previousPosition: null
    };
  },

  update(deltaTime) {
    // Check for cannon pickup with improved collision detection
    if (SceneManager.cannon && SceneManager.cannonCollider && !this.cannonAttached) {
      // Get player's world position
      const playerWorldPos = new THREE.Vector3();
      this.player.getWorldPosition(playerWorldPos);
      
      // Get cannon's world position
      const cannonWorldPos = SceneManager.cannonCollider.center.clone();
      
      // Check collision with more lenient distance-based approach
      const distanceThreshold = SceneManager.cannonCollider.radius * 1.2; // Slightly larger than the actual radius
      const distanceToPlayer = playerWorldPos.distanceTo(cannonWorldPos);
      
      if (Debug.state.enabled) {
        console.log(`Distance to cannon: ${distanceToPlayer.toFixed(2)}, Threshold: ${distanceThreshold.toFixed(2)}`);
      }
      
      if (distanceToPlayer <= distanceThreshold) {
        console.log('Player in range of cannon, attempting to attach...');
        // First check if we have the left arm reference
        if (!this.leftArm) {
          console.error('Cannot attach cannon - left arm reference is missing');
          console.log('Attempting to find left arm again...');
          
          // One more attempt to find the arm
          if (this.player) {
            this.player.traverse((child) => {
              if (child.name === 'Arm.L' || 
                  (child.name.toLowerCase().includes('arm') && 
                   (child.name.includes('l') || child.name.includes('L')))) {
                console.log(`Found left arm during emergency search: ${child.name}`);
                this.leftArm = child;
              }
            });
          }
        }
        
        // Now try to attach
        if (this.leftArm) {
          this.attachCannonToArm();
        } else {
          console.error('Still cannot find left arm, cannot attach cannon');
        }
      } else if (Debug.state.enabled && distanceToPlayer < distanceThreshold * 1.5) {
        console.log(`Approaching cannon: ${distanceToPlayer.toFixed(1)}m`);
      }
    }

    // Update main player animation mixer
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }
    
    // Update other player animations
    for (const id in this.otherPlayers) {
      const player = this.otherPlayers[id];
      if (player.mixer) {
        player.mixer.update(deltaTime);
        
        // Update other player animations based on movement and running state
        this.updateOtherPlayerAnimation(player);
      }
    }
    
    // Update camera and get direction vectors
    const cameraDirections = SceneManager.updateCamera(this.player.position, this.player);
    
    // Process input based on camera directions
    this.processInput(cameraDirections, deltaTime);
  },

  // Debug properties
  debugInfo: {
    lastSentPosition: null,
    positionHistory: []
  },
  
  // Store last movement data for network updates
  lastMoveData: null,

  // Find a bone by name in the player model
  findBoneByName(boneName) {
    let result = null;
    
    if (!this.player) {
      console.error('Player model not loaded, cannot find bone:', boneName);
      return null;
    }
    
    this.player.traverse((object) => {
      if (object.name === boneName) {
        result = object;
      }
    });
    
    if (!result) {
      console.warn(`Bone "${boneName}" not found in player model`);
    }
    
    return result;
  },

  // Attach a weapon to a specified socket
  attachWeaponToSocket(weaponObject, socketName, weaponType = 'cannon') {
    const socket = this.weaponSockets[socketName];
    const weaponConfig = this.weaponTypes[weaponType] || this.weaponTypes.cannon;
    
    if (!socket) {
      console.error(`Socket "${socketName}" not defined`);
      return false;
    }
    
    // Find the bone
    const bone = this.findBoneByName(socket.boneName);
    if (!bone) {
      console.error(`Could not find bone "${socket.boneName}" for socket "${socketName}"`);
      return false;
    }
    
    // Get world position for pickup effect
    const worldPos = new THREE.Vector3();
    weaponObject.getWorldPosition(worldPos);
    
    // Store original scale
    const originalScale = weaponObject.scale.clone();
    
    // Remove from scene and parent to bone
    SceneManager.scene.remove(weaponObject);
    bone.add(weaponObject);
    
    // Apply socket transform
    weaponObject.position.set(...socket.position);
    weaponObject.rotation.set(...socket.rotation);
    
    // Apply weapon-specific offsets
    weaponObject.position.x += weaponConfig.positionOffset[0];
    weaponObject.position.y += weaponConfig.positionOffset[1];
    weaponObject.position.z += weaponConfig.positionOffset[2];
    
    weaponObject.rotation.x += weaponConfig.rotationOffset[0];
    weaponObject.rotation.y += weaponConfig.rotationOffset[1];
    weaponObject.rotation.z += weaponConfig.rotationOffset[2];
    
    // Apply scaling
    const finalScale = socket.scale * weaponConfig.scaleMultiplier;
    weaponObject.scale.set(
      originalScale.x * finalScale,
      originalScale.y * finalScale,
      originalScale.z * finalScale
    );
    
    // Log success
    console.log(`Attached "${weaponType}" to socket "${socketName}" on bone "${socket.boneName}"`, {
      finalPosition: weaponObject.position.toArray(),
      finalRotation: weaponObject.rotation.toArray(),
      finalScale: weaponObject.scale.toArray()
    });
    
    // Call socket's callback if it exists
    if (socket.attachmentCallback) {
      socket.attachmentCallback(weaponObject, bone);
    }
    
    // Create pickup effect
    this.addPickupEffect(worldPos, weaponConfig.effectColor);
    
    return true;
  },

  // Updated cannon attachment function to use the socket system
  attachCannonToArm() {
    if (!SceneManager.cannon) {
      console.error('Cannot attach cannon - cannon reference is missing');
      return;
    }
    
    // Mark cannon as attached in SceneManager to stop rotation
    SceneManager.cannonAttached = true;
    
    // Use the socket system to attach the cannon
    const success = this.attachWeaponToSocket(SceneManager.cannon, 'leftArm', 'cannon');
    
    if (success) {
      // Disable collision after pickup
      SceneManager.cannonCollider = null;
      this.cannonAttached = true;
      
      // Display debug info
      console.log("Weapon attached. Use window.debugWeapons.tryAttach() to test other positions if needed.");
    } else {
      // Warn if attachment fails
      console.warn("Socket attachment failed");
      // this.attachCannonDirectly();
    }
  },

  // Fallback direct attachment method (original implementation)
  // attachCannonDirectly() {
  //   if (!SceneManager.cannon) {
  //     console.error('Cannot attach cannon - cannon reference is missing');
  //     return;
  //   }
    
  //   if (!this.leftArm) {
  //     console.error('Cannot attach cannon - left arm reference is missing');
  //     return;
  //   }
    
  //   // Get world position for pickup effect
  //   const worldPos = new THREE.Vector3();
  //   SceneManager.cannon.getWorldPosition(worldPos);
    
  //   // Stop the cannon's rotation
  //   SceneManager.cannonAttached = true;
    
  //   // Remove from scene and parent to arm
  //   SceneManager.scene.remove(SceneManager.cannon);
  //   this.leftArm.add(SceneManager.cannon);
    
  //   // Set position based on Blender coordinates
  //   SceneManager.cannon.position.set(0.5, 0, 0);
  //   SceneManager.cannon.rotation.set(0, Math.PI/2, 0);
    
  //   // Apply scaling
  //   SceneManager.cannon.scale.set(0.2, 0.2, 0.2);
    
  //   // Disable collision after pickup
  //   SceneManager.cannonCollider = null;
  //   this.cannonAttached = true;
    
  //   // Add a visual effect to confirm pickup
  //   this.addPickupEffect(worldPos);
  // },

  // Updated pickup effect with custom color option
  addPickupEffect(position, color = 0xffff00) {
    // Create a simple particle effect at the pickup position
    const particles = new THREE.Group();
    
    // Add 10 simple particles
    for (let i = 0; i < 10; i++) {
      const geometry = new THREE.SphereGeometry(0.1, 8, 8);
      const material = new THREE.MeshBasicMaterial({ 
        color: color,
        transparent: true,
        opacity: 0.8
      });
      
      const particle = new THREE.Mesh(geometry, material);
      
      // Random position around the center
      particle.position.set(
        position.x + (Math.random() - 0.5) * 0.5,
        position.y + (Math.random() - 0.5) * 0.5,
        position.z + (Math.random() - 0.5) * 0.5
      );
      
      // Store initial position and velocity for animation
      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 2
      );
      
      particles.add(particle);
    }
    
    // Add to scene
    SceneManager.add(particles);
    
    // Animate and remove after 1 second
    const startTime = performance.now();
    const duration = 1000; // 1 second
    
    const updateParticles = () => {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / duration;
      
      if (progress >= 1) {
        // Remove particles
        SceneManager.remove(particles);
        return;
      }
      
      // Update particles
      particles.children.forEach(particle => {
        // Move based on velocity
        particle.position.add(particle.userData.velocity.clone().multiplyScalar(0.016)); // Assuming ~60fps
        
        // Apply gravity
        particle.userData.velocity.y -= 0.1;
        
        // Fade out
        if (particle.material) {
          particle.material.opacity = 0.8 * (1 - progress);
        }
      });
      
      // Continue animation
      requestAnimationFrame(updateParticles);
    };
    
    // Start animation
    updateParticles();
  },

  getBoneHierarchy(bone) {
    const hierarchy = [];
    let current = bone;
    while (current.parent) {
      hierarchy.push(current.parent.name);
      current = current.parent;
    }
    return hierarchy.reverse().join(' -> ');
  },

  processInput(cameraDirections, deltaTime) {
    let speed = 5.0 * deltaTime;
    if (this.isRunning) {
      speed *= 2; // Double speed when running
    }
    let moved = false;
    
    // Get direction vectors from camera
    const { forward, right } = cameraDirections;
    
    // Store previous position for debug visualization
    const previousPosition = this.player.position.clone();
    
    // Apply movement based on keys pressed
    if (this.moveForward) {
      this.player.position.add(forward.clone().multiplyScalar(speed));
      moved = true;
    }
    if (this.moveBackward) {
      this.player.position.add(forward.clone().multiplyScalar(-speed));
      moved = true;
    }
    if (this.moveLeft) {
      this.player.position.add(right.clone().multiplyScalar(-speed));
      moved = true;
    }
    if (this.moveRight) {
      this.player.position.add(right.clone().multiplyScalar(speed));
      moved = true;
    }
    
    // Maintain player's Y position at initial height
    this.player.position.setY(0);
    
    // Debug visualization for player movement
    if (Debug.state.enabled && moved) {
      // Store position history for debug trail
      this.debugInfo.positionHistory.push(previousPosition);
      
      // Limit history length
      if (this.debugInfo.positionHistory.length > 20) {
        this.debugInfo.positionHistory.shift();
      }
      
      // Draw debug trail
      if (Debug.state.showVisualHelpers) {
        this.drawDebugTrail();
      }
    }
    
    // Update animation state based on movement
    this.updateAnimation(moved);
    
    // Player rotation is now handled by the SceneManager.updateCamera method
    // when not in free look mode
    
    const moveData = moved ? {
      position: this.player.position.clone(),
      rotation: this.player.rotation.y
    } : null;
    
    // Store last move data for network updates in main.js
    this.lastMoveData = moveData;
    
    // Store last sent position for debug visualization
    if (moveData) {
      this.debugInfo.lastSentPosition = moveData.position.clone();
    }
    
    return moveData;
  },
  
  // Draw debug trail showing player movement history
  drawDebugTrail() {
    // Remove old trail if it exists
    if (this.debugInfo.trail) {
      SceneManager.scene.remove(this.debugInfo.trail);
    }
    
    // Create points for the trail
    const points = [...this.debugInfo.positionHistory];
    
    // Add current position
    if (this.player) {
      points.push(this.player.position.clone());
    }
    
    // Create line
    if (points.length > 1) {
      const material = new THREE.LineBasicMaterial({ color: 0x00ffff });
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, material);
      
      // Store and add to scene
      this.debugInfo.trail = line;
      SceneManager.scene.add(line);
    }
  }
};