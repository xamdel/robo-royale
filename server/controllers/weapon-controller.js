const ValidationService = require('../services/validation');

class WeaponController {
  constructor(io) {
    this.io = io;
  }

  setupSocketHandlers(socket) {
    socket.on('weaponPickup', (data) => this.handleWeaponPickup(socket, data));
  }

  handleWeaponPickup(socket, data) {
    // Validate weapon pickup data
    if (!ValidationService.isValidWeaponPickupData(data)) {
      console.warn(`Invalid weapon pickup data from ${socket.id}`, data);
      return;
    }

    // Broadcast pickup to all players except the one who picked it up
    socket.broadcast.emit('weaponPickedUp', {
      weaponId: data.weaponId,
      weaponType: data.weaponType,
      socketName: data.socketName,
      playerId: socket.id
    });
  }
}

module.exports = WeaponController;
