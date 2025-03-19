import { io } from 'socket.io-client';
import { Game } from './game.js';
import { SceneManager } from './scene.js';
import * as THREE from 'three';

export const Network = {
  socket: null,

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
        // Update other player position directly
        Game.otherPlayers[data.id].mesh.position.set(
          data.position.x,
          data.position.y,
          data.position.z
        );
        
        // Update rotation
        Game.otherPlayers[data.id].mesh.rotation.y = data.rotation;
      }
    });

    this.socket.on('playerDisconnected', (id) => {
      console.log('Player disconnected:', id);
      if (Game.otherPlayers[id]) {
        SceneManager.remove(Game.otherPlayers[id].mesh);
        delete Game.otherPlayers[id];
      }
    });
  },

  addOtherPlayer(id, position) {
    Game.otherPlayers[id] = Game.createPlayerMesh(id);
    
    if (Game.otherPlayers[id]) {
      SceneManager.add(Game.otherPlayers[id].mesh);
      Game.otherPlayers[id].mesh.position.set(
        position.x, 
        position.y, 
        position.z
      );
    }
  },

  sendMove(moveData) {
    this.socket.emit('move', moveData);
  }
};
