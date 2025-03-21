import { io } from 'socket.io-client';
import { Game } from './game.js';
import { SceneManager } from './scene.js';
import { Debug } from './main.js';
import { WeaponManager } from './weapons.js';
import * as THREE from 'three';

export const Network = {
  socket: null,
  
  // Network parameters
  interpolationSpeed: 5,
  smoothedRTT: 100, // Initial estimate (ms)
  jitterBuffer: [],
  adaptiveInterpolationSpeed: 5,
  adaptiveBufferSize: 10,
  reconciliationThreshold: 0.05, // Distance threshold for reconciliation
  
  // Sequence and state tracking
  sequenceNumber: 0,
  lastReceivedSequence: {},
  playerStateBuffer: {},

  init() {
    this.socket = io();
    
    this.socket.on('connect', () => {
      console.log('Connected to server with ID:', this.socket.id);
    });

    this.socket.on('moveValidated', (data) => {
      this.handleServerValidation(data);
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
    if (!this.playerStateBuffer[data.id]) {
      this.playerStateBuffer[data.id] = [];
    }

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

    if (this.playerStateBuffer[data.id].length > 10) {
      this.playerStateBuffer[data.id].shift();
    }

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
    this.adaptInterpolationParameters();
    
    for (const id in Game.otherPlayers) {
      const player = Game.otherPlayers[id];
      const stateBuffer = this.playerStateBuffer[id];
      
      if (!stateBuffer || stateBuffer.length === 0) continue;

      const latestState = stateBuffer[stateBuffer.length - 1];
      
      if (player.mesh && latestState) {
        const lerpFactor = Math.min(this.adaptiveInterpolationSpeed * deltaTime, 1);
        player.mesh.position.lerp(latestState.position, lerpFactor);
        player.mesh.quaternion.slerp(latestState.rotation, lerpFactor);
        
        if (Debug.state.enabled && Debug.state.showVisualHelpers) {
          SceneManager.updateDebugHelper(
            player.mesh, 
            latestState.position
          );
        }
      }
    }
  },

  handleServerValidation(validationData) {
    const { inputId, position, rotation, serverTime } = validationData;
    
    Game.lastProcessedInputId = Math.max(Game.lastProcessedInputId, inputId);
    Game.inputBuffer = Game.inputBuffer.filter(input => input.id > inputId);
    
    const historyIndex = Game.stateHistory.findIndex(state => state.inputId === inputId);
    if (historyIndex === -1) return;
    
    const predictedState = Game.stateHistory[historyIndex];
    const serverPos = new THREE.Vector3(position.x, position.y, position.z);
    const positionError = predictedState.position.distanceTo(serverPos);
    
    if (positionError > this.reconciliationThreshold) {
      console.log(`Reconciling position, error: ${positionError.toFixed(4)}`);
      Game.player.position.copy(serverPos);
      
      // Reconcile rotation as well
      Game.player.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      
      const cameraDirections = SceneManager.updateCamera(Game.player.position, Game.player);
      for (let i = historyIndex + 1; i < Game.stateHistory.length; i++) {
        const replayInput = Game.inputBuffer.find(input => 
          input.id === Game.stateHistory[i].inputId);
          
        if (replayInput) {
          const moveVector = Game.applyInput(replayInput, cameraDirections);
          Game.player.position.add(moveVector);
          Game.stateHistory[i].position = Game.player.position.clone();
          Game.stateHistory[i].rotation = Game.player.quaternion.clone();
        }
      }
    }
    
    this.updateNetworkStats(serverTime);
  },

  adaptInterpolationParameters() {
    if (this.jitterBuffer.length >= 10) {
      const avg = this.jitterBuffer.reduce((sum, val) => sum + val, 0) / this.jitterBuffer.length;
      const variance = this.jitterBuffer.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / this.jitterBuffer.length;
      const jitter = Math.sqrt(variance);
      
      if (this.smoothedRTT > 200 || jitter > 50) {
        this.adaptiveBufferSize = Math.min(20, this.adaptiveBufferSize + 1);
        this.adaptiveInterpolationSpeed = Math.max(3, this.adaptiveInterpolationSpeed - 0.5);
      } else if (this.smoothedRTT < 50 && jitter < 10) {
        this.adaptiveBufferSize = Math.max(5, this.adaptiveBufferSize - 1);
        this.adaptiveInterpolationSpeed = Math.min(10, this.adaptiveInterpolationSpeed + 0.5);
      }
      
      this.jitterBuffer = [];
    }
  },

  updateNetworkStats(serverTime) {
    const now = Date.now();
    const rtt = now - serverTime;
    
    this.jitterBuffer.push(rtt);
    if (this.jitterBuffer.length > 30) this.jitterBuffer.shift();
    
    this.smoothedRTT = this.smoothedRTT ? 
      0.9 * this.smoothedRTT + 0.1 * rtt : 
      rtt;
  },

  sendMove(moveData) {
    if (!moveData || !moveData.position) {
      console.warn('Invalid moveData:', moveData);
      return;
    }
    
    // Calculate movement direction quaternion if there's movement
    const moveVector = new THREE.Vector3(
      moveData.position.x - (Game.player.position.x || 0),
      0,
      moveData.position.z - (Game.player.position.z || 0)
    );
    let movementRotation = null;
    if (moveVector.lengthSq() > 0.001) { // Small threshold to avoid noise
      moveVector.normalize();
      movementRotation = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, -1),
        moveVector
      );
    }

    const networkTransform = {
      position: {
        x: moveData.position.x,
        y: moveData.position.y,
        z: moveData.position.z
      },
      rotation: { // Camera rotation
        x: moveData.rotation.x,
        y: moveData.rotation.y,
        z: moveData.rotation.z,
        w: moveData.rotation.w
      },
      movementRotation: movementRotation ? { // Movement-based rotation
        x: movementRotation.x,
        y: movementRotation.y,
        z: movementRotation.z,
        w: movementRotation.w
      } : null,
      input: moveData.input,
      isRunning: Game.isRunning,
      sequence: this.sequenceNumber++,
      timestamp: Date.now()
    };
    
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