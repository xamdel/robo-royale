export class TouchLookArea {
    constructor(options = {}) {
        this.zone = options.zone; // The DOM element representing the look area
        this.onLook = options.onLook || function() {}; // Callback with delta movement: onLook({ deltaX, deltaY })
        this.onTouchStart = options.onTouchStart || function() {}; // Optional callback on touch start
        this.onTouchEnd = options.onTouchEnd || function() {}; // Optional callback on touch end

        this.active = false;
        this.touchId = null;
        this.lastPos = { x: 0, y: 0 };

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
        // Allow multiple touches in the zone, but only track the first one for looking
        if (this.active) return;

        const touch = event.changedTouches[0];
        this.active = true;
        this.touchId = touch.identifier;
        this.lastPos.x = touch.clientX;
        this.lastPos.y = touch.clientY;
        this.onTouchStart(); // Notify manager
    }

    handleTouchMove(event) {
        event.preventDefault();
        if (!this.active) return;

        const touch = Array.from(event.changedTouches).find(t => t.identifier === this.touchId);
        if (!touch) return; // Not our touch moving

        const currentX = touch.clientX;
        const currentY = touch.clientY;

        const deltaX = currentX - this.lastPos.x;
        const deltaY = currentY - this.lastPos.y;

        // Update last position for next move event
        this.lastPos.x = currentX;
        this.lastPos.y = currentY;

        // Trigger callback with delta values
        this.onLook({ deltaX, deltaY });
    }

    handleTouchEnd(event) {
        event.preventDefault();
        if (!this.active) return;

        const touch = Array.from(event.changedTouches).find(t => t.identifier === this.touchId);
        if (!touch) return; // Not our touch ending

        this.active = false;
        this.touchId = null;
        this.onTouchEnd(); // Notify manager
    }

    destroy() {
        // Remove event listeners if necessary
    }
}
