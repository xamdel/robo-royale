import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export const PlayerAnimations = {
  createAnimationMixer(model, actions) {
    const mixer = new THREE.AnimationMixer(model);
    const animationActions = {};
    
    Object.keys(actions).forEach(actionName => {
      const action = mixer.clipAction(actions[actionName]._clip);
      action.setLoop(THREE.LoopRepeat);
      animationActions[actionName] = action;
    });
    
    return {
      mixer,
      actions: animationActions
    };
  },

  updatePlayerAnimation(player, isMoving) {
    let targetAction = null;

    if (!player.actions) return;

    // Determine movement direction based on player's movement vector
    const movementVector = new THREE.Vector3();
    
    if (player.moveLeft) {
      movementVector.x -= 1;
    }
    if (player.moveRight) {
      movementVector.x += 1;
    }
    if (player.moveForward) {
      movementVector.z -= 1;
    }
    if (player.moveBackward) {
      movementVector.z += 1;
    }

    // Normalize movement vector to get primary direction
    movementVector.normalize();

    // Select animation based on movement direction
    if (Math.abs(movementVector.x) > Math.abs(movementVector.z)) {
      // Horizontal movement takes priority
      targetAction = movementVector.x < 0 
        ? player.actions['RunLeft-loop'] 
        : player.actions['RunRight-loop'];
    } else if (movementVector.z !== 0) {
      // Vertical movement
      targetAction = movementVector.z < 0 
        ? player.actions['RunForward-loop'] 
        : player.actions['RunBackward-loop'];
    }

    // Fallback to forward animation if moving
    if (!targetAction && isMoving) {
      targetAction = player.actions['RunForward-loop'];
    }

    // Transition animations
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

  createPlayerMesh(mechModel, actions) {
    const mesh = SkeletonUtils.clone(mechModel);
    mesh.position.set(0, 0, 0);
    
    const { mixer, actions: playerActions } = this.createAnimationMixer(mesh, actions);
    
    mesh.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        // Create unique material for each player
        if (child.material) {
          child.material = child.material.clone();
          
          // Randomize player color slightly
          const baseColor = new THREE.Color(0xff0000);
          const colorVariation = new THREE.Color(
            Math.random() * 0.2 + 0.8, // Vary red
            Math.random() * 0.2 + 0.8, // Vary green
            Math.random() * 0.2 + 0.8  // Vary blue
          );
          
          const finalColor = baseColor.multiply(colorVariation);
          
          child.material = new THREE.MeshStandardMaterial({
            color: finalColor,
            roughness: 0.7,
            metalness: 0.3
          });
          child.material.needsUpdate = true;
        }
      }
    });
    
    return {
      mesh: mesh,
      mixer: mixer,
      actions: playerActions,
      currentAction: null,
      isRunning: false,
      moveLeft: false,
      moveRight: false,
      moveForward: false,
      moveBackward: false,
      targetTransform: {
        position: new THREE.Vector3(),
        rotation: new THREE.Quaternion(),
        scale: new THREE.Vector3(1, 1, 1)
      },
      previousPosition: null
    };
  }
};
