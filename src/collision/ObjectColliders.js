import * as THREE from 'three';
import { CollisionSystem } from './CollisionSystem.js';
import { CylinderCollider, SphereCollider, BoxCollider } from './CollisionPrimitives.js';

/**
 * Handles the creation and registration of colliders for environmental objects and buildings.
 */
export class ObjectColliders {
    /**
     * @param {CollisionSystem} collisionSystem - The main collision system instance.
     */
    constructor(collisionSystem) {
        if (!collisionSystem) {
            throw new Error("[ObjectColliders] CollisionSystem instance is required.");
        }
        this.collisionSystem = collisionSystem;
        this.registeredObjectIds = new Set(); // Keep track of registered IDs if needed for cleanup
    }

    /**
     * Registers cylinder colliders for instanced trees.
     * @param {THREE.InstancedMesh} instancedTrees - The instanced mesh containing tree data.
     * @param {number} [baseRadius=0.5] - The base radius of the tree trunk collider.
     * @param {number} [baseHeight=8] - The base height of the tree trunk collider.
     */
    registerTreeColliders(instancedTrees, baseRadius = 0.5, baseHeight = 8) {
        if (!instancedTrees || !instancedTrees.instanceMatrix) {
            console.error("[ObjectColliders] Invalid instancedTrees data provided.");
            return;
        }

        const treeCount = instancedTrees.count;
        const dummyMatrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3();
        // Quaternion is not needed for cylinder alignment along Y

        console.log(`[ObjectColliders] Registering ${treeCount} tree colliders...`);

        for (let i = 0; i < treeCount; i++) {
            instancedTrees.getMatrixAt(i, dummyMatrix);
            position.setFromMatrixPosition(dummyMatrix);
            scale.setFromMatrixScale(dummyMatrix); // Assuming uniform scale affects radius/height

            // Create cylinder collider for the tree trunk
            // Adjust radius and height based on instance scale (assuming scale applies uniformly)
            const radius = baseRadius * Math.max(scale.x, scale.z); // Use max horizontal scale component
            const height = baseHeight * scale.y; // Use vertical scale component

            // Position the collider base at the instance's position
            const collider = new CylinderCollider(
                position.clone(), // Clone position to avoid reference issues
                radius,
                height
            );

            // Register with the collision system
            const objectId = this.collisionSystem.registerCollider(collider, 'tree');
            this.registeredObjectIds.add(objectId);
        }
        console.log(`[ObjectColliders] Finished registering tree colliders.`);
    }

    /**
     * Registers sphere colliders for instanced rocks.
     * @param {THREE.InstancedMesh} instancedRocks - The instanced mesh containing rock data.
     * @param {number} [baseRadius=1.2] - The base radius of the rock collider.
     */
    registerRockColliders(instancedRocks, baseRadius = 1.2) {
         if (!instancedRocks || !instancedRocks.instanceMatrix) {
            console.error("[ObjectColliders] Invalid instancedRocks data provided.");
            return;
        }

        const rockCount = instancedRocks.count;
        const dummyMatrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3();
        // Quaternion not needed for sphere

        console.log(`[ObjectColliders] Registering ${rockCount} rock colliders...`);

        for (let i = 0; i < rockCount; i++) {
            instancedRocks.getMatrixAt(i, dummyMatrix);
            position.setFromMatrixPosition(dummyMatrix);
            scale.setFromMatrixScale(dummyMatrix);

            // Create sphere collider for the rock
            // Adjust radius based on the maximum scale component
            const radius = baseRadius * Math.max(scale.x, scale.y, scale.z);

            const collider = new SphereCollider(
                position.clone(), // Clone position
                radius
            );

            // Register with the collision system
            const objectId = this.collisionSystem.registerCollider(collider, 'rock');
             this.registeredObjectIds.add(objectId);
        }
         console.log(`[ObjectColliders] Finished registering rock colliders.`);
    }

    /**
     * Registers a box collider for a single building instance.
     * @param {THREE.Object3D} building - The building's Object3D instance (e.g., the cloned scene).
     * @param {string} category - The category ('small', 'large', 'skyscraper') to determine dimensions.
     * @param {object} [dimensionsConfig] - Optional config for dimensions per category.
     */
    registerBuildingCollider(building, category, dimensionsConfig = {}) {
        if (!building) {
            console.error("[ObjectColliders] Invalid building object provided.");
            return;
        }

        const position = building.position.clone(); // Center of the building model base
        const quaternion = building.quaternion.clone(); // Orientation of the building

        // Define default dimensions or use config
        const defaults = {
            small: { width: 10, height: 15, depth: 10 },
            large: { width: 15, height: 30, depth: 15 },
            skyscraper: { width: 20, height: 80, depth: 20 }
        };
        const dims = dimensionsConfig[category] || defaults[category] || defaults.small;

        // Adjust position to be the center of the collider box
        // Assuming the building model's origin is at its base center
        const colliderCenterPosition = position.clone();
        colliderCenterPosition.y += dims.height / 2; // Move center up by half height

        // Apply building's scale to dimensions
        const scaledWidth = dims.width * building.scale.x;
        const scaledHeight = dims.height * building.scale.y;
        const scaledDepth = dims.depth * building.scale.z;

        const collider = new BoxCollider(
            colliderCenterPosition,
            scaledWidth,
            scaledHeight,
            scaledDepth,
            quaternion // Pass the building's rotation
        );

        // Register with the collision system
        const objectId = this.collisionSystem.registerCollider(collider, 'building');
        this.registeredObjectIds.add(objectId);
        // console.log(`[ObjectColliders] Registered building collider: ${objectId} (${category})`);
    }

    /**
     * Clears all registered colliders from the collision system.
     * Useful when regenerating the environment.
     */
    clearAllColliders() {
        console.log(`[ObjectColliders] Clearing ${this.registeredObjectIds.size} registered colliders...`);
        this.registeredObjectIds.forEach(id => {
            this.collisionSystem.unregisterCollider(id); // Assumes unregisterCollider is implemented
        });
        this.registeredObjectIds.clear();
        // It might be necessary to also clear/reset the spatial grid in CollisionSystem
        console.log(`[ObjectColliders] Colliders cleared.`);
    }
}
