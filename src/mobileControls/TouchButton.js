export class TouchButton {
    constructor(options = {}) {
        this.element = options.element; // The DOM element representing the button
        this.action = options.action; // String identifier for the action (e.g., 'firePrimary', 'jump')
        this.onPress = options.onPress || function() {}; // Callback when button is pressed: onPress(action)
        this.onRelease = options.onRelease || function() {}; // Callback when button is released: onRelease(action)

        this.active = false;
        this.touchId = null;

        this.addEventListeners();
    }

    addEventListeners() {
        this.element.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        // Add touchmove listener to handle finger sliding off the button
        this.element.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.element.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
        this.element.addEventListener('touchcancel', this.handleTouchEnd.bind(this), { passive: false });
    }

    handleTouchStart(event) {
        event.preventDefault();
        if (this.active) return; // Already tracking a touch on this button

        const touch = event.changedTouches[0];
        this.active = true;
        this.touchId = touch.identifier;
        this.element.classList.add('active'); // Add visual feedback
        this.onPress(this.action);
        // console.log(`Button ${this.action} pressed`); // Debug
    }

    handleTouchMove(event) {
        event.preventDefault();
        if (!this.active) return;

        const touch = Array.from(event.changedTouches).find(t => t.identifier === this.touchId);
        if (!touch) return; // Not our touch moving

        // Check if the touch has moved outside the button's bounds
        const rect = this.element.getBoundingClientRect();
        const isOutside = (
            touch.clientX < rect.left ||
            touch.clientX > rect.right ||
            touch.clientY < rect.top ||
            touch.clientY > rect.bottom
        );

        if (isOutside) {
            // If touch moved outside, treat it as a release
            // console.log(`Touch moved outside button ${this.action}, releasing.`); // Debug
            this.release();
        }
    }

    handleTouchEnd(event) {
        event.preventDefault();
        if (!this.active) return;

        const touch = Array.from(event.changedTouches).find(t => t.identifier === this.touchId);
        if (!touch) return; // Not our touch ending

        // console.log(`Button ${this.action} released`); // Debug
        this.release();
    }

    release() {
        if (!this.active) return;
        this.active = false;
        this.touchId = null;
        this.element.classList.remove('active'); // Remove visual feedback
        this.onRelease(this.action);
    }

    destroy() {
        // Remove event listeners if necessary
    }
}
