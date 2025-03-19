import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { SceneManager } from './scene.js';

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
    await this.loadAnimation('assets/animations/Run Forward.fbx', 'run');

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

    if (isMoving) {
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

    createPlayerMesh(id) {
    if (!this.mechModel) {
      console.error("Mech model not loaded yet");
      return null;
    }
    const mesh = this.mechModel.clone();
    mesh.position.set(0, 0, 0);
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
      mesh: mesh
    };
  },

update(deltaTime) {
    // Update animations
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }

    // Get camera direction and process input
    const camera = SceneManager.camera;
    const cameraForward = camera.getWorldDirection(new THREE.Vector3());
    this.processInput(cameraForward, deltaTime);
  },

  processInput(cameraForward, deltaTime) {
    let speed = 5.0 * deltaTime;
    if (this.isRunning) {
      speed *= 2; // Double speed when running
    }
    let moved = false;

    // Calculate movement direction based on camera orientation
    const forward = cameraForward.clone();
    forward.y = 0;
    forward.normalize();
    
    const right = new THREE.Vector3();
    right.crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
    
    // Apply movement based on keys pressed
    if (this.moveForward) {
      this.player.position.add(forward.clone().multiplyScalar(speed)).setY(this.player.position.y);
      moved = true;
    }
    if (this.moveBackward) {
      this.player.position.add(forward.clone().multiplyScalar(-speed));
      moved = true;
    }
    if (this.moveLeft) {
      this.player.position.add(right.clone().multiplyScalar(speed));
      moved = true;
    }
    if (this.moveRight) {
      this.player.position.add(right.clone().multiplyScalar(-speed));
      moved = true;
    }
    
    // Update animation state
    this.updateAnimation(moved);
    
    // Update player rotation to face movement direction
    if (moved) {
      // Calculate movement direction
      const movementDirection = new THREE.Vector3();
      
      if (this.moveForward) movementDirection.add(forward);
      if (this.moveBackward) movementDirection.sub(forward);
      if (this.moveLeft) movementDirection.add(right);
      if (this.moveRight) movementDirection.sub(right);
      
      if (movementDirection.length() > 0.1) {
        movementDirection.normalize();
        const targetAngle = Math.atan2(movementDirection.x, movementDirection.z);
        this.player.rotation.y = targetAngle;
      }
    }
    
    return moved ? {
      position: this.player.position.clone(),
      rotation: this.player.rotation.y
    } : null;
  }
};
