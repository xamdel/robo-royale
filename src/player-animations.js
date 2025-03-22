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

  /**
   * Unified animation handler for both local and remote players
   * @param {Object} playerObject - Either Game object or remote player object
   * @param {boolean} isMoving - Whether the player is currently moving
   * @param {Object} options - Optional settings
   */
  updateAnimation(playerObject, isMoving, options = {}) {
    // Detect player type and extract required properties
    const playerData = this.normalizePlayerData(playerObject, options);
    
    if (!playerData.actions) {
      console.warn('No actions available for player animation update');
      return;
    }

    // Debug logging for movement state
    // console.debug('Animation Update:', {
    //   isLocalPlayer: playerData.isLocalPlayer,
    //   isMoving,
    //   moveStates: {
    //     forward: playerData.moveForward,
    //     backward: playerData.moveBackward,
    //     left: playerData.moveLeft,
    //     right: playerData.moveRight,
    //     running: playerData.isRunning
    //   }
    // });
    
    // Create a baseline target action
    let targetAction = null;
    
    // console.debug('Available actions:', Object.keys(playerData.actions));
    
    if (isMoving) {
      // Determine primary movement direction
      let primaryDirection = 'forward'; // Default
      
      // Check each movement direction
      if (playerData.moveForward) primaryDirection = 'forward';
      else if (playerData.moveBackward) primaryDirection = 'backward';
      else if (playerData.moveLeft) primaryDirection = 'left';
      else if (playerData.moveRight) primaryDirection = 'right';
      
      // Select animation based on direction and running state
      const animPrefix = playerData.isRunning ? 'Run' : 'Run'; // Use same animations for now
      
      switch (primaryDirection) {
        case 'forward':
          targetAction = playerData.actions[`${animPrefix}Forward-loop`];
          break;
        case 'backward':
          targetAction = playerData.actions[`${animPrefix}Backward-loop`];
          break;
        case 'left':
          targetAction = playerData.actions[`${animPrefix}Left-loop`];
          break;
        case 'right':
          targetAction = playerData.actions[`${animPrefix}Right-loop`];
          break;
        default:
          // Fallback
          targetAction = playerData.actions[`${animPrefix}Forward-loop`];
      }
      
      // Set animation speed based on running state
      if (targetAction) {
        targetAction.timeScale = playerData.isRunning ? 1.5 : 0.7;
        // console.debug('Selected animation:', {
        //   name: targetAction._clip.name,
        //   timeScale: targetAction.timeScale
        // });
      }
    } else {
      // When not moving, use Stand animation if available
      targetAction = playerData.actions['Stand'];
      
      // If no Stand animation, just stop the current action
      if (!targetAction) {
        if (playerData.currentAction) {
          playerData.currentAction.fadeOut(0.2);
          this.updateCurrentAction(playerObject, null);
        }
        return;
      }
    }
    
    // Skip if same action is already playing
    if (targetAction === playerData.currentAction) return;
    
    // Handle animation transitions
    if (targetAction) {
      // Fade out current animation if it exists
      if (playerData.currentAction) {
        playerData.currentAction.fadeOut(0.15); // Faster transition
      }
      
      // Start new animation
      targetAction.reset();
      targetAction.fadeIn(0.15); // Faster transition
      targetAction.play();
      this.updateCurrentAction(playerObject, targetAction);
    } 
    // Explicitly handle stopping animations when no target action
    else if (playerData.currentAction) {
      playerData.currentAction.fadeOut(0.2);
      this.updateCurrentAction(playerObject, null);
    }
  },

  /**
   * Normalizes player data from different object structures
   * @param {Object} playerObject - Either Game object or remote player object
   * @param {Object} options - Additional options
   * @returns {Object} - Normalized data object with common properties
   */
  normalizePlayerData(playerObject, options) {
    // Check if this is the Game object (local player)
    const isLocalPlayer = playerObject.otherPlayers !== undefined;
    
    if (isLocalPlayer) {
      // Local player (Game object)
      return {
        actions: playerObject.actions,
        currentAction: playerObject.currentAction,
        moveForward: playerObject.moveForward,
        moveBackward: playerObject.moveBackward,
        moveLeft: playerObject.moveLeft,
        moveRight: playerObject.moveRight,
        isRunning: playerObject.isRunning,
        isLocalPlayer: true
      };
    } else {
      // Remote player
      return {
        actions: playerObject.actions,
        currentAction: playerObject.currentAction,
        moveForward: playerObject.moveForward,
        moveBackward: playerObject.moveBackward,
        moveLeft: playerObject.moveLeft,
        moveRight: playerObject.moveRight,
        isRunning: playerObject.isRunning,
        isLocalPlayer: false
      };
    }
  },
  
  /**
   * Updates the current action reference on the player object
   * @param {Object} playerObject - Player object to update
   * @param {Object} action - New current action to set
   */
  updateCurrentAction(playerObject, action) {
    // Check if this is the Game object (local player)
    const isLocalPlayer = playerObject.otherPlayers !== undefined;
    
    if (isLocalPlayer) {
      playerObject.currentAction = action;
    } else {
      playerObject.currentAction = action;
    }
  },
  
  // For backward compatibility
  updatePlayerAnimation(player, isMoving) {
    // Call our new unified method
    this.updateAnimation(player, isMoving);
  },


  createPlayerMesh(mechModel, actions, isLocalPlayer = false) {
    const mesh = SkeletonUtils.clone(mechModel);
    mesh.position.set(0, 0, 0);
    
    const { mixer, actions: playerActions } = this.createAnimationMixer(mesh, actions);
    
    mesh.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        // Only modify materials for remote players
        if (child.material && !isLocalPlayer) {
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
