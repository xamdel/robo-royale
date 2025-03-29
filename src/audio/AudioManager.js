import * as THREE from 'three';

class AudioManager {
    constructor() {
        this.listener = null; // Needs to be set externally
        this.audioLoader = new THREE.AudioLoader();
        this.sounds = {}; // Cache for loaded audio buffers
        this.activeSounds = new Map(); // Track active positional sounds by object ID + path
        console.log("AudioManager instance created.");
    }

    // Must be called after scene camera is created
    init(camera) {
        if (!camera) {
            console.error("AudioManager: Camera is required for initialization.");
            return;
        }
        if (!this.listener) {
            this.listener = new THREE.AudioListener();
            camera.add(this.listener);
            console.log("AudioManager initialized with AudioListener on camera.");
        } else {
            console.warn("AudioManager: Already initialized.");
        }
    }

    // Preload a sound
    loadSound(path, callback) {
        const fullPath = `assets/audio/${path}`; // Assuming sounds are in assets/audio/
        if (!path) {
            console.warn("AudioManager: loadSound called with empty path.");
            return;
        }
        if (this.sounds[fullPath]) {
            // console.log(`AudioManager: Sound already loaded: ${fullPath}`);
            if (callback) callback(this.sounds[fullPath]);
            return;
        }
        console.log(`AudioManager: Loading sound: ${fullPath}`);
        this.audioLoader.load(fullPath, (buffer) => {
            console.log(`AudioManager: Successfully loaded ${fullPath}`);
            this.sounds[fullPath] = buffer;
            if (callback) callback(buffer);
        }, undefined, (err) => console.error(`AudioManager: Error loading ${fullPath}`, err));
    }

    // Get a unique key for tracking sounds attached to objects
    _getSoundKey(object3D, soundPath) {
        return `${object3D.uuid}-${soundPath}`;
    }

    // Play a one-shot positional sound attached to an object
    playEffect(soundPath, object3D) {
        const fullPath = `assets/audio/${soundPath}`;
        if (!this.listener || !this.sounds[fullPath] || !object3D) {
            console.warn(`AudioManager: Cannot play effect ${soundPath}. Listener ready: ${!!this.listener}, Sound loaded: ${!!this.sounds[fullPath]}, Object valid: ${!!object3D}`);
            return null;
        }

        // Stop existing sound with the same key if it's playing (prevents rapid overlap)
        const soundKey = this._getSoundKey(object3D, fullPath);
        this.stopSoundByKey(soundKey); // Stop any previous instance

        const sound = new THREE.PositionalAudio(this.listener);
        sound.setBuffer(this.sounds[fullPath]);
        sound.setRefDistance(20); // Adjust as needed
        sound.setRolloffFactor(1.0); // Adjust as needed
        sound.setVolume(0.8); // Adjust volume as needed
        sound.setLoop(false);

        object3D.add(sound); // Attach sound to the object
        this.activeSounds.set(soundKey, sound); // Track it

        sound.onEnded = () => {
            // console.log(`AudioManager: Sound effect ended: ${soundKey}`);
            if (sound.parent) {
                sound.parent.remove(sound);
            }
            this.activeSounds.delete(soundKey); // Untrack it
            sound.disconnect(); // Ensure disconnection
        };

        // console.log(`AudioManager: Playing effect ${soundKey}`);
        sound.play();
        return sound; // Return instance if needed externally (e.g., for gatling spindown tracking)
    }

    // Play a looping positional sound attached to an object
    playLoop(soundPath, object3D) {
        const fullPath = `assets/audio/${soundPath}`;
        if (!this.listener || !this.sounds[fullPath] || !object3D) {
             console.warn(`AudioManager: Cannot play loop ${soundPath}. Listener ready: ${!!this.listener}, Sound loaded: ${!!this.sounds[fullPath]}, Object valid: ${!!object3D}`);
            return null;
        }

        const soundKey = this._getSoundKey(object3D, fullPath);

        // If a sound with this key is already playing, don't start another
        if (this.activeSounds.has(soundKey) && this.activeSounds.get(soundKey).isPlaying) {
            // console.log(`AudioManager: Loop already playing: ${soundKey}`);
            return this.activeSounds.get(soundKey);
        }

        // Stop any previous instance just in case it wasn't cleaned up
        this.stopSoundByKey(soundKey);

        const sound = new THREE.PositionalAudio(this.listener);
        sound.setBuffer(this.sounds[fullPath]);
        sound.setLoop(true);
        sound.setRefDistance(20); // Adjust as needed
        sound.setRolloffFactor(1.0); // Adjust as needed
        sound.setVolume(0.7); // Adjust volume

        object3D.add(sound);
        this.activeSounds.set(soundKey, sound); // Track it

        // console.log(`AudioManager: Playing loop ${soundKey}`);
        sound.play();
        return sound; // Return instance to allow stopping
    }

    // Stop a specific sound instance and remove it
    stopSound(soundInstance) {
        if (!soundInstance) return;

        // Find the key associated with this instance
        let soundKey = null;
        for (const [key, value] of this.activeSounds.entries()) {
            if (value === soundInstance) {
                soundKey = key;
                break;
            }
        }

        // Only stop if it's actually playing
        if (soundInstance.isPlaying) {
            // console.log(`AudioManager: Stopping sound instance: ${soundKey || 'unknown key'}`);
            try {
                // stop() can sometimes throw if context is closed, though unlikely here
                soundInstance.stop();
            } catch (e) {
                console.warn(`AudioManager: Error stopping sound ${soundKey || 'unknown key'}:`, e);
            }
        }

        // Remove from parent if it's still attached (might have been removed by onEnded)
        if (soundInstance.parent) {
            soundInstance.parent.remove(soundInstance);
        }

        // Untrack it if it's still tracked (might have been untracked by onEnded)
        if (soundKey && this.activeSounds.has(soundKey)) {
            this.activeSounds.delete(soundKey);
        }

        // Avoid calling disconnect here.
        // For one-shot sounds (effects), the onEnded handler should manage disconnection.
        // For loops, removing from the scene graph is usually sufficient cleanup.
        // soundInstance.disconnect(); // REMOVED to prevent InvalidAccessError
    }


    // Stop a sound using its tracking key
    stopSoundByKey(soundKey) {
        const soundInstance = this.activeSounds.get(soundKey);
        if (soundInstance) {
            // console.log(`AudioManager: Stopping sound by key: ${soundKey}`);
            this.stopSound(soundInstance); // Use the common stop logic
        }
    }

    // Stop all sounds associated with a specific 3D object
    stopSoundsByObject(object3D) {
        if (!object3D) return;
        const keysToRemove = [];
        for (const [key, soundInstance] of this.activeSounds.entries()) {
            // Check if the sound is a child of the object (more robust than UUID matching if object is cloned/recreated)
            let parent = soundInstance.parent;
            let found = false;
            while(parent) {
                if (parent === object3D) {
                    found = true;
                    break;
                }
                parent = parent.parent;
            }

            if (found) {
            // if (key.startsWith(object3D.uuid)) { // Original check - might fail if UUID changes
                // console.log(`AudioManager: Stopping sound ${key} associated with object ${object3D.uuid}`);
                this.stopSound(soundInstance); // This will also remove the key from activeSounds
                // keysToRemove.push(key); // No need to collect keys if stopSound removes them
            }
        }
        // This loop is now redundant if stopSound correctly removes the key
        // keysToRemove.forEach(key => this.activeSounds.delete(key));
    }

    // Stop all sounds managed by the AudioManager
    stopAllSounds() {
        console.log("AudioManager: Stopping all sounds.");
        // Iterate over a copy of the values, as stopSound modifies the map
        const soundsToStop = [...this.activeSounds.values()];
        soundsToStop.forEach(sound => this.stopSound(sound));
        this.activeSounds.clear(); // Ensure the map is empty
    }
}

// Export a singleton instance
export const audioManager = new AudioManager();
