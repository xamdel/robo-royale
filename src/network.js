import { io } from 'socket.io-client';
import { Game } from './game.js';
import { SceneManager } from './scene.js';
import * as THREE from 'three';

export const Network = {
  socket: null,
  lastMoveSent: 0,
  sendRate: 50, // Send rate limit in ms (20 updates per second)

  init() {
    this.socket = io();
    
    this.socket.on('connect', () => {
      console.log('Connected to server with ID:', this.socket.id);
    });

    this.socket.on('existingPlayers', (serverPlayers) => {
      console.log('Received existing players:', serverPlayers);
      for (let id in serverPlayers) {
        if (id !== this.socket.id) {
          this.addOtherPlayer(id, serverPlayers[id].position);
        } else {
          // Set our own position from the server
          Game.player.position.set(
            serverPlayers[id].position.x,
            serverPlayers[id].position.y,
            serverPlayers[id].position.z
          );
          Game.targetPosition.copy(Game.player.position);
        }
      }
    });

    this.socket.on('newPlayer', (player) => {
      console.log('New player joined:', player.id);
      if (player.id !== this.socket.id) {
        this.addOtherPlayer(player.id, player.position);
      }
    });

    this.socket.on('playerMoved', (data) => {
      if (Game.otherPlayers[data.id]) {
        // Store the last position for interpolation
        Game.otherPlayers[data.id].lastPosition.copy(Game.otherPlayers[data.id].mesh.position);
        
        // Set the target position for smooth movement
        Game.otherPlayers[data.id].targetPosition.set(
          data.position.x,
          data.position.y,
          data.position.z
        );
        
        // Update rotation if provided
        if (data.rotation !== undefined) {
          // Create a quaternion for the rotation around the Y axis
          const targetQuaternion = new THREE.Quaternion();
          targetQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), data.rotation);
          
          // Apply the quaternion to the player mesh
          Game.otherPlayers[data.id].mesh.quaternion.copy(targetQuaternion);
        }
      }
    });

    this.socket.on('playerDisconnected', (id) => {
      console.log('Player disconnected:', id);
      if (Game.otherPlayers[id]) {
        SceneManager.remove(Game.otherPlayers[id].mesh);
        delete Game.otherPlayers[id];
      }
    });
    
    // Add handler for server corrections
    this.socket.on('serverCorrection', (data) => {
      console.log('Received server correction:', data);
      Game.handleServerCorrection(data);
    });
  },

  addOtherPlayer(id, position) {
    Game.otherPlayers[id] = Game.createPlayerMesh(id);
    
    if (Game.otherPlayers[id]) {
      SceneManager.add(Game.otherPlayers[id].mesh);
      Game.otherPlayers[id].targetPosition.set(position.x, position.y, position.z);
      Game.otherPlayers[id].lastPosition.copy(Game.otherPlayers[id].targetPosition);
      Game.otherPlayers[id].mesh.position.copy(Game.otherPlayers[id].targetPosition);
    }
  },

  sendMove(delta) {
    const now = performance.now();
    
    // Throttle network updates to reduce bandwidth
    if (now - this.lastMoveSent > this.sendRate) {
      // Include input sequence number for reconciliation
      const moveData = {
        delta: delta,
        sequence: Game.inputSequence - 1, // Send the sequence of the processed input
        timestamp: now
      };
      
      this.socket.emit('move', moveData);
      this.lastMoveSent = now;
    }
  }
};