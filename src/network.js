import { io } from 'socket.io-client';
import { Game } from './game.js';
import { SceneManager } from './scene.js';
import { Debug } from './main.js';
import { WeaponManager } from './weapons.js';
import * as THREE from 'three';

export const Network = {
  socket: null,
  
  // Improved interpolation settings
  interpolationSpeed: 5, // Smoother, more controlled interpolation
  
  // Sequence and state tracking
  sequenceNumber: 0,
  lastReceivedSequence: {},
  playerStateBuffer: {},

  init() {
    this.socket = io();
    
    this.socket.on('connect', () => {
      console.log('Connected to server with ID:', this.socket.id);
    });

    this.socket.on('projectileHit', (data) => {
      WeaponManager.createExplosion(new THREE.Vector3(
        data.position.x,
        data.position.y,
        data.position.z
      ));
    });

    this.socket.on('existingPlayers', (serverPlayers) => {
      console.log('Received existing players:', serverPlayers);
      for (let id in serverPlayers) {
        if (id !== this.socket.id) {
          this.addOtherPlayer(id, serverPlayers[id]);
        }
      }
    });

    this.socket.on('newPlayer', (player) => {
      console.log('New player joined:', player.id);
      if (player.id !== this.socket.id) {
        this.addOtherPlayer(player.id, player);
      }
    });

    this.socket.on('playerMoved', (data) => {
      if (Game.otherPlayers[data.id]) {
        const player = Game.otherPlayers[data.id];
        
        // Validate and buffer network state
        this.bufferPlayerState(data);
      }
    });

    this.socket.on('playerDisconnected', (id) => {
      console.log('Player disconnected:', id);
      if (Game.otherPlayers[id]) {
        SceneManager.remove(Game.otherPlayers[id].mesh);
        delete Game.otherPlayers[id];
        delete this.playerStateBuffer[id];
      }
    });
  },

  bufferPlayerState(data) {
    // Create buffer for player if not exists
    if (!this.playerStateBuffer[data.id]) {
      this.playerStateBuffer[data.id] = [];
    }

    // Add new state to buffer
    const newState = {
      position: new THREE.Vector3(data.position.x, data.position.y, data.position.z),
      rotation: new THREE.Quaternion(
        data.rotation.x || 0, 
        data.rotation.y || 0, 
        data.rotation.z || 0, 
        data.rotation.w || 1
      ),
      isRunning: data.isRunning,
      timestamp: Date.now(),
      sequence: data.sequence
    };

    this.playerStateBuffer[data.id].push(newState);

    // Limit buffer size
    if (this.playerStateBuffer[data.id].length > 10) {
      this.playerStateBuffer[data.id].shift();
    }

    // Optional: Sequence number validation
    if (data.sequence !== undefined) {
      this.validateSequence(data.id, data.sequence);
    }
  },

  validateSequence(playerId, sequence) {
    this.lastReceivedSequence[playerId] = this.lastReceivedSequence[playerId] || 0;
    
    if (Debug.state.enabled && sequence < this.lastReceivedSequence[playerId]) {
      console.warn(`[${Date.now()}] Out-of-order packet for player ${playerId}:`, {
        received: sequence,
        expected: this.lastReceivedSequence[playerId] + 1
      });
    }
    
    this.lastReceivedSequence[playerId] = Math.max(
      this.lastReceivedSequence[playerId], 
      sequence
    );
  },

  addOtherPlayer(id, playerData) {
    Game.otherPlayers[id] = Game.createPlayerMesh(id);
    
    if (Game.otherPlayers[id]) {
      SceneManager.add(Game.otherPlayers[id].mesh);
      
      // Initialize with quaternion rotation
      const initialRotation = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), 
        playerData.rotation || 0
      );
      
      Game.otherPlayers[id].mesh.position.set(
        playerData.position.x, 
        playerData.position.y, 
        playerData.position.z
      );
      Game.otherPlayers[id].mesh.quaternion.copy(initialRotation);
      
      // Initialize state tracking
      Game.otherPlayers[id].targetTransform = {
        position: new THREE.Vector3(
          playerData.position.x,
          playerData.position.y,
          playerData.position.z
        ),
        rotation: initialRotation,
        isRunning: playerData.isRunning || false
      };
    }
  },

  update(deltaTime) {
    for (const id in Game.otherPlayers) {
      const player = Game.otherPlayers[id];
      const stateBuffer = this.playerStateBuffer[id];
      
      if (!stateBuffer || stateBuffer.length === 0) continue;

      // Get most recent buffered state
      const latestState = stateBuffer[stateBuffer.length - 1];
      
      if (player.mesh && latestState) {
        // Interpolation factor
        const lerpFactor = Math.min(this.interpolationSpeed * deltaTime, 1);
        
        // Position interpolation
        player.mesh.position.lerp(latestState.position, lerpFactor);
        
        // Rotation interpolation using quaternion SLERP
        player.mesh.quaternion.slerp(latestState.rotation, lerpFactor);
        
        // Debug visualization
        if (Debug.state.enabled && Debug.state.showVisualHelpers) {
          SceneManager.updateDebugHelper(
            player.mesh, 
            latestState.position
          );
        }
      }
    }
  },

  sendMove(moveData) {
    if (!moveData || !moveData.position) {
      console.warn('Invalid moveData:', moveData);
      return;
    }
    
    // Prepare network transform
    const networkTransform = {
      position: {
        x: moveData.position.x,
        y: moveData.position.y,
        z: moveData.position.z
      },
      rotation: {
        x: moveData.rotation.x,
        y: moveData.rotation.y,
        z: moveData.rotation.z,
        w: moveData.rotation.w
      },
      isRunning: Game.isRunning,
      sequence: this.sequenceNumber++,
      timestamp: Date.now()
    };
    
    // Optional debug logging
    if (Debug.state.enabled) {
      console.log('Sending move data:', networkTransform);
    }
    
    this.socket.emit('move', networkTransform);
  },

  sendProjectileHit(position) {
    this.socket.emit('projectileHit', {
      position: {
        x: position.x,
        y: position.y,
        z: position.z
      }
    });
  }
};
