import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
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

  loadMechModel() {
    return new Promise((resolve) => {
      const loader = new FBXLoader();
      loader.load('assets/models/gemini-mech-rigged.fbx', (fbx) => {
        console.log(fbx);
        fbx.traverse((child) => {
          console.log(child.name, child.type); // Log all children (bones, meshes, etc.)
        });
        fbx.scale.set(5, 5, 5)
        fbx.position.y = 0.1;

        fbx.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

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
    this.player = playerModel;
    // Maintain loaded model's Y position
    this.player.position.set(0, playerModel.position.y, 0);
    SceneManager.add(this.player);

    // Initialize actions
    this.actions = {};

    // Load walking animation
    await this.loadAnimation('assets/animations/Walk.fbx', 'walk');
    // Load running animation
    await this.loadAnimation('assets/animations/Standing Run Forward.fbx', 'run');
    
    // TODO: When animations are available, uncomment these:
    // // Load strafing animation
    await this.loadAnimation('assets/animations/Right Strafe.fbx', 'rightStrafe');
    await this.loadAnimation('assets/animations/Left Strafe.fbx', 'leftStrafe');
    // // Load walking backward animation
    await this.loadAnimation('assets/animations/Walk Backward.fbx', 'walkBackward');

    // Set up initial state
    this.actions.walk.setLoop(THREE.LoopRepeat);
    this.actions.run.setLoop(THREE.LoopRepeat);
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
  },

  updateAnimation(isMoving) {
    let targetAction = null;

    if (this.moveLeft) {
      targetAction = this.actions.leftStrafe;
    } else if (this.moveRight) {
      targetAction = this.actions.rightStrafe;
    } else if (this.moveBackward) {
      targetAction = this.actions.walkBackward;
    } else if (isMoving) {
      targetAction = this.isRunning ? this.actions.run : this.actions.walk;
    }

    if (targetAction != null && this.currentAction !== targetAction) {
        if (this.currentAction) {
            this.currentAction.fadeOut(0.2);
        }
        targetAction.reset().fadeIn(0.2).play();
        this.currentAction = targetAction;
    } else if (!isMoving && this.currentAction) {
      this.currentAction.fadeOut(0.2);
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
      targetAction = player.isRunning ? player.actions.run : player.actions.walk;
    }
    
    if (targetAction != null && player.currentAction !== targetAction) {
      if (player.currentAction) {
        player.currentAction.fadeOut(0.2);
      }
      targetAction.reset().fadeIn(0.2).play();
      player.currentAction = targetAction;
    } else if (!isMoving && player.currentAction) {
      player.currentAction.fadeOut(0.2);
      player.currentAction = null;
    }
  },

  createPlayerMesh(id) {
    if (!this.mechModel) {
      console.error("Mech model not loaded yet");
      return null;
    }
    const mesh = this.mechModel.clone();
    mesh.position.set(0, 0, 0);
    
    // Create animation mixer for this player
    const mixer = new THREE.AnimationMixer(mesh);
    
    // Clone animation actions
    const walkAction = this.actions.walk ? 
      mixer.clipAction(this.actions.walk._clip) : null;
    const runAction = this.actions.run ? 
      mixer.clipAction(this.actions.run._clip) : null;
    const leftStrafeAction = this.actions.leftStrafe ? 
      mixer.clipAction(this.actions.leftStrafe._clip) : null;
    const rightStrafeAction = this.actions.rightStrafe ? 
      mixer.clipAction(this.actions.rightStrafe._clip) : null;
    const walkBackwardAction = this.actions.walkBackward ? 
      mixer.clipAction(this.actions.walkBackward._clip) : null;
    
    if (walkAction) walkAction.setLoop(THREE.LoopRepeat);
    if (runAction) runAction.setLoop(THREE.LoopRepeat);
    
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
      walk: walkAction,
      run: runAction,
      leftStrafe: leftStrafeAction,
      rightStrafe: rightStrafeAction,
      walkBackward: walkBackwardAction
      },
      currentAction: null,
      isRunning: false,
      targetPosition: null,
      targetRotation: 0,
      previousPosition: null
    };
  },

  update(deltaTime) {
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
    
    // Maintain player's Y position
    this.player.position.setY(this.player.position.y);
    
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
