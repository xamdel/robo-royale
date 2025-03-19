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
    this.player = playerModel.clone();
    this.player.position.set(0, 0, 0);
    SceneManager.add(this.player);

    // Initialize actions
    this.actions = {};

    // Load walking animation
    await this.loadAnimation('assets/animations/Walk.fbx', 'walk');
    
    // Set up initial state
    this.actions.walk.setLoop(THREE.LoopRepeat);
    this.currentAction = null;

    // Input handling
    document.addEventListener('keydown', (event) => {
      switch (event.key) {
        case 'w': this.moveForward = true; break;
        case 's': this.moveBackward = true; break;
        case 'a': this.moveLeft = true; break;
        case 'd': this.moveRight = true; break;
      }
    });
    document.addEventListener('keyup', (event) => {
      switch (event.key) {
        case 'w': this.moveForward = false; break;
        case 's': this.moveBackward = false; break;
        case 'a': this.moveLeft = false; break;
        case 'd': this.moveRight = false; break;
      }
    });
  },

  updateAnimation(isMoving) {
    if (isMoving && this.currentAction !== this.actions.walk) {
      if (this.currentAction) this.currentAction.fadeOut(0.2);
      this.actions.walk.reset().fadeIn(0.2).play();
      this.currentAction = this.actions.walk;
    } else if (!isMoving && this.currentAction === this.actions.walk) {
      this.actions.walk.fadeOut(0.2);
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
  },

  processInput(cameraForward, deltaTime) {
    const speed = 5.0 * deltaTime;
    let moved = false;
    
    // Calculate movement direction based on camera orientation
    const forward = cameraForward.clone();
    forward.y = 0;
    forward.normalize();
    
    const right = new THREE.Vector3();
    right.crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
    
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
