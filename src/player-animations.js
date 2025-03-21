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

    // Prioritize strafe movements using exact animation names
    if (player.moveLeft) {
      targetAction = player.actions['RunLeft-loop'];
    } else if (player.moveRight) {
      targetAction = player.actions['RunRight-loop'];
    } else if (player.moveBackward) {
      targetAction = player.actions['RunBackward-loop'];
    } else if (isMoving) {
      targetAction = player.actions['RunForward-loop'];
    }

    // Handle idle state
    if (!isMoving && !player.moveLeft && !player.moveRight && !player.moveBackward) {
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

  createPlayerMesh(mechModel, actions) {
    const mesh = SkeletonUtils.clone(mechModel);
    mesh.position.set(0, 0, 0);
    
    const { mixer, actions: playerActions } = this.createAnimationMixer(mesh, actions);
    
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
      actions: playerActions,
      currentAction: null,
      isRunning: false,
      targetPosition: null,
      targetRotation: 0,
      previousPosition: null
    };
  }
};
