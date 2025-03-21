import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SceneManager } from './scene.js';
import { WeaponManager } from './weapons.js';
import { PlayerAnimations } from './player-animations.js';
import { DebugTools } from './debug-tools.js';

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
  
  loadMechModel() {
    return new Promise((resolve) => {
      const loader = new GLTFLoader();
      loader.load('assets/models/Mech-norootmotion.glb', (gltf) => {
        const model = gltf.scene;
        console.log('Loaded mech model with animations:', gltf.animations);

        // Find left arm using debug tools
        this.leftArm = DebugTools.findLeftArm(model);
        
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
    const playerModel = await this.loadMechModel();
    this.player = playerModel;
    this.player.position.set(0, playerModel.position.y, 0);
    SceneManager.add(this.player);

    // Set up animation looping
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

    // Add mouse click handler for shooting
    document.addEventListener('mousedown', (event) => {
      if (event.button === 0 && this.cannonAttached) { // Left click
        WeaponManager.fireWeapon(this.player);
      }
    });
  },

  update(deltaTime) {
    // Check for cannon pickup
    if (SceneManager.cannon && SceneManager.cannonCollider && !this.cannonAttached) {
      const playerWorldPos = new THREE.Vector3();
      this.player.getWorldPosition(playerWorldPos);
      
      const cannonWorldPos = SceneManager.cannonCollider.center.clone();
      const distanceThreshold = SceneManager.cannonCollider.radius * 1.2;
      const distanceToPlayer = playerWorldPos.distanceTo(cannonWorldPos);
      
      if (distanceToPlayer <= distanceThreshold) {
        console.log('Player in range of cannon, attempting to attach...');
        if (this.leftArm) {
          SceneManager.cannonAttached = true;
          const success = WeaponManager.attachWeaponToSocket(this.player, SceneManager.cannon, 'leftArm', 'cannon');
          if (success) {
            SceneManager.cannonCollider = null;
            this.cannonAttached = true;
          }
        }
      }
    }

    // Update animations and projectiles
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }
    WeaponManager.updateProjectiles(deltaTime);
    
    // Update other player animations
    for (const id in this.otherPlayers) {
      const player = this.otherPlayers[id];
      if (player.mixer) {
        player.mixer.update(deltaTime);
        PlayerAnimations.updatePlayerAnimation(player, player.mesh.position.distanceTo(player.previousPosition || player.mesh.position) > 0.01);
        if (player.previousPosition) {
          player.previousPosition.copy(player.mesh.position);
        } else {
          player.previousPosition = player.mesh.position.clone();
        }
      }
    }
    
    // Update camera and process input
    const cameraDirections = SceneManager.updateCamera(this.player.position, this.player);
    return this.processInput(cameraDirections, deltaTime);
  },

  createPlayerMesh(id) {
    if (!this.mechModel) {
      console.error("Mech model not loaded yet");
      return null;
    }
    const playerMesh = PlayerAnimations.createPlayerMesh(this.mechModel, this.actions);
    
    // Add collision sphere (radius 2 units)
    playerMesh.collider = new THREE.Sphere(
      new THREE.Vector3(),
      2.0
    );
    
    return playerMesh;
  },

  processInput(cameraDirections, deltaTime) {
    let speed = 5.0 * deltaTime;
    if (this.isRunning) {
      speed *= 2;
    }
    let moved = false;
    
    const { forward, right } = cameraDirections;
    const previousPosition = this.player.position.clone();
    
    // Movement vector calculation
    const moveVector = new THREE.Vector3();
    
    if (this.moveForward) {
      moveVector.add(forward.clone().multiplyScalar(speed));
      moved = true;
    }
    if (this.moveBackward) {
      moveVector.add(forward.clone().multiplyScalar(-speed));
      moved = true;
    }
    if (this.moveLeft) {
      moveVector.add(right.clone().multiplyScalar(-speed));
      moved = true;
    }
    if (this.moveRight) {
      moveVector.add(right.clone().multiplyScalar(speed));
      moved = true;
    }
    
    // Apply movement
    this.player.position.add(moveVector);
    this.player.position.setY(0);
    
    // Update player animations
    PlayerAnimations.updatePlayerAnimation(this, moved);
    
    // Prepare move data with full quaternion rotation
    const moveData = moved ? {
      position: this.player.position.clone(),
      rotation: {
        x: this.player.quaternion.x,
        y: this.player.quaternion.y,
        z: this.player.quaternion.z,
        w: this.player.quaternion.w
      }
    } : null;
    
    return moveData;
  }
};
