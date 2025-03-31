import * as THREE from 'three';

export class Joystick {
    constructor(options = {}) {
        this.zone = options.zone; // The DOM element representing the joystick zone
        this.stick = options.stick; // The DOM element representing the joystick stick
        this.maxDistance = options.maxDistance || 50; // Max distance stick can move from center (pixels)
        this.deadzone = options.deadzone || 5; // Pixels from center before movement registers
        this.onMove = options.onMove || function() {}; // Callback when joystick moves: onMove(vector)
        this.onEnd = options.onEnd || function() {}; // Callback when touch ends

        this.active = false;
        this.touchId = null;
        this.center = { x: 0, y: 0 };
        this.currentPos = { x: 0, y: 0 };
        this.outputVector = new THREE.Vector2(0, 0); // Normalized output vector (-1 to 1)

        this.stick.style.position = 'absolute';
        this.stick.style.display = 'none'; // Initially hidden

        this.addEventListeners();
    }

    addEventListeners() {
        this.zone.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.zone.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.zone.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
        this.zone.addEventListener('touchcancel', this.handleTouchEnd.bind(this), { passive: false });
    }

    handleTouchStart(event) {
        event.preventDefault();
        if (this.active) return; // Already tracking a touch

        const touch = event.changedTouches[0];
        this.active = true;
        this.touchId = touch.identifier;

        const zoneRect = this.zone.getBoundingClientRect();
        this.center.x = zoneRect.left + zoneRect.width / 2;
        this.center.y = zoneRect.top + zoneRect.height / 2;

        // Position the stick visually at the touch start point (or center)
        // For simplicity, let's center it initially
        this.stick.style.left = `${zoneRect.width / 2 - this.stick.offsetWidth / 2}px`;
        this.stick.style.top = `${zoneRect.height / 2 - this.stick.offsetHeight / 2}px`;
        this.stick.style.display = 'block';

        this.updateStickPosition(touch.clientX, touch.clientY);
    }

    handleTouchMove(event) {
        event.preventDefault();
        if (!this.active) return;

        const touch = Array.from(event.changedTouches).find(t => t.identifier === this.touchId);
        if (!touch) return; // Not our touch

        this.updateStickPosition(touch.clientX, touch.clientY);
    }

    handleTouchEnd(event) {
        event.preventDefault();
        if (!this.active) return;

        const touch = Array.from(event.changedTouches).find(t => t.identifier === this.touchId);
        if (!touch) return; // Not our touch ending

        this.active = false;
        this.touchId = null;
        this.stick.style.display = 'none'; // Hide stick
        this.outputVector.set(0, 0);
        this.onMove(this.outputVector); // Send zero vector
        this.onEnd();
    }

    updateStickPosition(touchX, touchY) {
        const zoneRect = this.zone.getBoundingClientRect();
        const relativeX = touchX - zoneRect.left;
        const relativeY = touchY - zoneRect.top;

        const centerX = zoneRect.width / 2;
        const centerY = zoneRect.height / 2;

        let dx = relativeX - centerX;
        let dy = relativeY - centerY;
        let distance = Math.sqrt(dx * dx + dy * dy);

        let stickX = centerX + dx - this.stick.offsetWidth / 2;
        let stickY = centerY + dy - this.stick.offsetHeight / 2;

        // Clamp stick position within maxDistance
        if (distance > this.maxDistance) {
            const angle = Math.atan2(dy, dx);
            dx = Math.cos(angle) * this.maxDistance;
            dy = Math.sin(angle) * this.maxDistance;
            stickX = centerX + dx - this.stick.offsetWidth / 2;
            stickY = centerY + dy - this.stick.offsetHeight / 2;
            distance = this.maxDistance; // Update distance for normalization
        }

        this.stick.style.left = `${stickX}px`;
        this.stick.style.top = `${stickY}px`;

        // Calculate output vector
        if (distance < this.deadzone) {
            this.outputVector.set(0, 0);
        } else {
            // Normalize based on maxDistance (not deadzone) for smooth control
            this.outputVector.set(dx / this.maxDistance, dy / this.maxDistance);
            // Invert Y-axis for typical game coordinates (up is positive Y)
            this.outputVector.y *= -1;
        }

        // Trigger callback
        this.onMove(this.outputVector);
    }

    get value() {
        return this.outputVector;
    }

    destroy() {
        // Remove event listeners if necessary (though usually managed by removing the element)
    }
}
