# Robo Royale Server

## Project Structure

```
server/
├── config/           # Configuration files
│   └── game-config.js
├── models/           # Data models and managers
│   ├── player.js
│   └── projectile.js
├── services/         # Utility services
│   ├── validation.js
│   └── ...
├── controllers/      # Socket event handlers
│   ├── player-controller.js
│   ├── projectile-controller.js
│   └── weapon-controller.js
├── game/             # Game loop and core game logic
│   └── game-loop.js
└── index.js          # Main server entry point
```

## Server Architecture

The server has been modularized to improve:
- Code organization
- Maintainability
- Scalability
- Separation of concerns

### Key Components

- **Config**: Centralized game configuration
- **Models**: Data structures for players and projectiles
- **Services**: Validation and utility functions
- **Controllers**: Socket event handlers for different game aspects
- **Game Loop**: Server-side game state management

## Running the Server

### Development Mode
```bash
# Start the Vite development server for the client
npm run dev

# Start the server in development mode with hot reloading
npm run dev:server
```

### Production
```bash
# Build the client
npm run build

# Start the server
npm run start:server
```

## Configuration

Game parameters can be adjusted in `server/config/game-config.js`, including:
- Tick rate
- Maximum players
- Projectile configurations
- Server port

## Dependencies

- Express
- Socket.IO
- Vite (for client-side development)
- Nodemon (for server development)

## Contributing

Please read through the modular structure and maintain the separation of concerns when adding new features.
