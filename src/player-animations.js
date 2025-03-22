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
    if (!player.actions) return;

    // Create a baseline target action
    let targetAction = null;
    
    if (isMoving) {
      // Determine primary movement direction
      let primaryDirection = 'forward'; // Default
      
      // Check each movement direction
      if (player.moveForward) primaryDirection = 'forward';
      else if (player.moveBackward) primaryDirection = 'backward';
      else if (player.moveLeft) primaryDirection = 'left';
      else if (player.moveRight) primaryDirection = 'right';
      
      // Select animation based on direction
      switch (primaryDirection) {
        case 'forward':
          targetAction = player.actions['RunForward-loop'];
          break;
        case 'backward':
          targetAction = player.actions['RunBackward-loop'];
          break;
        case 'left':
          targetAction = player.actions['RunLeft-loop'];
          break;
        case 'right':
          targetAction = player.actions['RunRight-loop'];
          break;
        default:
          // Fallback
          targetAction = player.actions['RunForward-loop'];
      }
      
      // Set animation speed based on running state
      if (targetAction) {
        targetAction.timeScale = player.isRunning ? 1.5 : 1.0;
      }
    } else {
      // When not moving, use Stand animation if available
      targetAction = player.actions['Stand'];
      
      // If no Stand animation, just stop the current action
      if (!targetAction) {
        if (player.currentAction) {
          player.currentAction.fadeOut(0.2);
          player.currentAction = null;
        }
        return;
      }
    }
    
    // Skip if same action is already playing
    if (targetAction === player.currentAction) return;
    
    // Handle animation transitions
    if (targetAction) {
      // Fade out current animation if it exists
      if (player.currentAction) {
        player.currentAction.fadeOut(0.15); // Faster transition
      }
      
      // Start new animation
      targetAction.reset();
      targetAction.fadeIn(0.15); // Faster transition
      targetAction.play();
      player.currentAction = targetAction;
    } 
    // Explicitly handle stopping animations when no target action
    else if (player.currentAction) {
      player.currentAction.fadeOut(0.2);
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
