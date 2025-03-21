import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
      const loader = new GLTFLoader();
      loader.load('assets/models/Mech-norootmotion.glb', (gltf) => {
        const model = gltf.scene;
        console.log('Loaded mech model with animations:', gltf.animations);
        
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
    const mesh = this.mechModel.clone();
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
