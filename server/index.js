const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const gameConfig = require('./config/game-config');
const GameLoop = require('./game/game-loop');
const PlayerController = require('./controllers/player-controller');
const ProjectileController = require('./controllers/projectile-controller');
const WeaponController = require('./controllers/weapon-controller');

class GameServer {
  constructor() {
    // Express and HTTP server setup
    this.app = express();
    this.server = http.createServer(this.app);
    
    // Socket.IO setup with CORS configuration
    this.io = socketIo(this.server, {
      cors: {
        origin: gameConfig.CORS_ORIGIN,
        methods: ["GET", "POST"],
        credentials: true
      }
    });

    // Initialize game loop and controllers
    this.gameLoop = new GameLoop(
      this.io, 
      null,  // Will be set in setupControllers
      null   // Will be set in setupControllers
    );

    this.setupMiddleware();
    this.setupControllers();
    this.setupSocketConnection();
  }

  setupMiddleware() {
    // Serve static files if needed
    this.app.use(express.static(path.join(__dirname, '..', 'dist')));
    this.app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'dist/index.html')));
    
    // Basic health check route
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        players: this.playerController.getPlayerManager().getPlayerCount(),
        maxPlayers: gameConfig.MAX_PLAYERS
      });
    });
  }

  setupControllers() {
    // Create player controller first (will need weapon controller later)
    this.playerController = new PlayerController(this.io, this.gameLoop); // Temporarily create without weaponController
    
    // Create weapon controller with player manager and game loop
    this.weaponController = new WeaponController(this.io, this.playerController.getPlayerManager(), this.gameLoop);

    // Create projectile controller with player manager and weapon controller
    this.projectileController = new ProjectileController(
      this.io, 
      this.playerController.getPlayerManager(),
      this.weaponController,
      this.gameLoop // Pass gameLoop instance
    );
    
    // Now update PlayerController with the WeaponController instance
    this.playerController.setWeaponController(this.weaponController);

    // Update game loop with managers
    this.gameLoop.playerManager = this.playerController.getPlayerManager();
    this.gameLoop.projectileManager = this.projectileController.getProjectileManager();
    this.gameLoop.projectileController = this.projectileController;
  }

  setupSocketConnection() {
    this.io.on('connection', (socket) => {
      // Handle player connection
      const player = this.playerController.handleConnection(socket);
      
      // If player connection was successful
      if (player) {
        // Setup event handlers for different controllers
        this.projectileController.setupSocketHandlers(socket);
        this.weaponController.setupSocketHandlers(socket);

        // Send the initial state of all pickup items to the new client
        const initialPickups = this.gameLoop.getInitialPickupState();
        console.log(`[Server] Sending initial pickup state (${initialPickups.length} items) to player ${socket.id}`);
        socket.emit('initialPickupState', initialPickups);

        // Handle weapon cleanup on disconnect
        socket.on('disconnect', () => {
          this.weaponController.removePlayer(socket.id);
        });
      }
    });
  }

  start() {
    // Start the game loop
    this.gameLoop.start();

    // Start the server
    this.server.listen(gameConfig.PORT, () => {
      console.log(`Server running on port ${gameConfig.PORT}`);
      console.log(`Node environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Max players: ${gameConfig.MAX_PLAYERS}`);
      console.log(`Tick rate: ${gameConfig.TICK_RATE}Hz`);
    });
  }

  stop() {
    // Stop the game loop
    this.gameLoop.stop();

    // Close the server
    this.server.close();
  }
}

// Export the server class and create an instance if run directly
if (require.main === module) {
  const gameServer = new GameServer();
  gameServer.start();
}

module.exports = GameServer;
