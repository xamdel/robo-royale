import * as THREE from 'three';
import { SpatialGrid } from './SpatialGrid.js';
// Primitives are used implicitly via the collider objects passed in
// import { CylinderCollider, SphereCollider, BoxCollider } from './CollisionPrimitives.js';

/**
 * Manages collision detection using a spatial grid and primitive shapes.
 */
export class CollisionSystem {
    /**
     * @param {number} worldWidth - The total width of the world space (X-axis).
     * @param {number} worldDepth - The total depth of the world space (Z-axis).
     * @param {number} [cellSize=40] - The size of each cell in the spatial grid.
     */
    constructor(worldWidth, worldDepth, cellSize = 40) {
        this.spatialGrid = new SpatialGrid(worldWidth, worldDepth, cellSize);
        this.colliders = new Map(); // Map of objectId -> { collider, objectType }
        this.nextId = 1; // Simple ID generator
        this.tempRay = new THREE.Ray(); // Reusable ray object
    }

    /**
     * Registers a new collider with the system.
     * @param {object} collider - An instance of CylinderCollider, SphereCollider, or BoxCollider.
     * @param {string} objectType - The type of object ('tree', 'rock', 'building', etc.).
     * @returns {string} The unique ID assigned to this collider instance.
     */
    registerCollider(collider, objectType) {
        // Generate a unique ID (simple incrementing for now)
        const objectId = `${objectType}_${this.nextId++}`;

        // Store the collider reference
        this.colliders.set(objectId, {
            collider,
            objectType
        });

        // Add the collider to the spatial grid
        this.spatialGrid.addCollider(collider, objectId, objectType);

        // console.log(`[CollisionSystem] Registered ${objectType} collider: ${objectId}`);
        return objectId;
    }

    /**
     * Unregisters a collider (e.g., if an object is destroyed).
     * Note: Removing from the spatial grid efficiently is complex if objects span cells.
     * For static environments, this might not be needed frequently.
     * @param {string} objectId - The ID of the collider to remove.
     */
    unregisterCollider(objectId) {
        if (this.colliders.has(objectId)) {
            // TODO: Implement removal from spatial grid if necessary.
            // This requires finding all cells the collider was added to.
            console.warn(`[CollisionSystem] unregisterCollider needs implementation for SpatialGrid removal.`);
            this.colliders.delete(objectId);
            // console.log(`[CollisionSystem] Unregistered collider: ${objectId}`);
        } else {
            console.warn(`[CollisionSystem] Attempted to unregister non-existent collider: ${objectId}`);
        }
    }

    /**
     * Checks for collisions between a point (representing the player) and nearby environmental objects.
     * @param {THREE.Vector3} position - The world position to check (e.g., player's position).
     * @param {number} checkRadius - The radius around the position to check (e.g., player's collision radius).
     * @returns {Array<object>} An array of collision results, each containing { objectId, objectType, collider }.
     */
    checkPlayerCollision(position, checkRadius) {
        // Get potential colliders from nearby grid cells
        const nearbyColliders = this.spatialGrid.getNearbyCellColliders(
            position.x, position.z,
            Math.ceil(checkRadius / this.spatialGrid.cellSize) // Search radius based on checkRadius
        );

        const collisions = [];
        for (const { collider, objectId, objectType } of nearbyColliders) {
            // Perform precise collision check between the collider and the check sphere (position + radius)
            if (collider.checkCollision(position, checkRadius)) {
                collisions.push({ objectId, objectType, collider });
            }
        }

        return collisions;
    }

    /**
     * Performs a raycast against all registered colliders, optimized by the spatial grid.
     * @param {THREE.Vector3} origin - The starting point of the ray.
     * @param {THREE.Vector3} direction - The normalized direction of the ray.
     * @param {number} maxDistance - The maximum distance the ray should travel.
     * @returns {object|null} The closest hit result { point, distance, normal, objectId, objectType }, or null if no hit.
     */
    raycast(origin, direction, maxDistance) {
        this.tempRay.set(origin, direction); // Use the reusable ray object

        // Get all grid cells the ray potentially intersects
        const cellsToCheck = this.spatialGrid.getRayIntersectingCells(this.tempRay, maxDistance);

        let closestHit = null;
        let minDistance = maxDistance;
        const checkedColliderIds = new Set(); // Avoid checking the same collider multiple times if it spans cells

        // Iterate through the cells the ray might hit
        for (const { col, row } of cellsToCheck) {
            const cellIndex = this.spatialGrid.getCellIndex(col, row);
            if (cellIndex === -1) continue; // Skip invalid cells

            const cellColliders = this.spatialGrid.grid[cellIndex];

            // Check each collider in the cell
            for (const { collider, objectId, objectType } of cellColliders) {
                // Skip if we've already checked this specific collider instance
                if (checkedColliderIds.has(objectId)) {
                    continue;
                }

                // Perform the ray-collider intersection test
                const hitResult = collider.checkRayIntersection(this.tempRay, minDistance); // Pass current minDistance for optimization

                if (hitResult && hitResult.distance < minDistance) {
                    // Found a closer hit
                    minDistance = hitResult.distance;
                    closestHit = {
                        point: hitResult.point,
                        distance: hitResult.distance,
                        normal: hitResult.normal,
                        objectId: objectId,
                        objectType: objectType,
                        collider: collider // Include collider reference if needed
                    };
                }
                // Mark this collider as checked for this raycast
                checkedColliderIds.add(objectId);
            }
        }

        return closestHit;
    }


    /**
     * Resolves player collisions by adjusting the player's proposed position.
     * This is a basic example; more sophisticated resolution might be needed.
     * @param {THREE.Vector3} playerPosition - The player's current/proposed position (will be modified).
     * @param {number} playerRadius - The collision radius of the player.
     * @param {THREE.Vector3} originalPosition - The player's position *before* the movement attempt.
     * @param {THREE.Vector3} desiredPosition - The position the player *tried* to move to (will be modified).
     * @param {number} playerRadius - The collision radius of the player.
     * @param {Array<object>} collisions - The array of collision results from checkPlayerCollision at the desiredPosition.
     * @returns {boolean} True if the position was successfully resolved (even if it means no movement), false otherwise (shouldn't happen).
     */
    resolvePlayerCollision(originalPosition, desiredPosition, playerRadius, collisions) {
        if (collisions.length === 0) {
            return true; // No collisions, desiredPosition is fine
        }

        // --- Simple Sliding Attempt ---
        // Try moving only along X, then only along Z from the original position.

        const movementVector = desiredPosition.clone().sub(originalPosition);
        let resolved = false;

        // 1. Try moving only along X-axis
        const posX = originalPosition.clone().add(new THREE.Vector3(movementVector.x, 0, 0));
        const collisionsX = this.checkPlayerCollision(posX, playerRadius);
        if (collisionsX.length === 0) {
            // console.log("[Collision] Sliding along X");
            desiredPosition.copy(posX); // Allow X movement
            resolved = true;
        } else {
             // 2. If X failed, try moving only along Z-axis
            const posZ = originalPosition.clone().add(new THREE.Vector3(0, 0, movementVector.z));
            const collisionsZ = this.checkPlayerCollision(posZ, playerRadius);
            if (collisionsZ.length === 0) {
                 // console.log("[Collision] Sliding along Z");
                desiredPosition.copy(posZ); // Allow Z movement
                resolved = true;
            }
        }

        // 3. If both X and Z attempts failed, stay at the original position
        if (!resolved) {
             // console.log("[Collision] Blocked");
            desiredPosition.copy(originalPosition);
            resolved = true; // Resolved by not moving
        }

        // Note: This simple sliding can get stuck on corners.
        // A more robust solution involves projecting movement onto collision planes using normals.
        return resolved;
    }

     // --- Debugging ---
    /**
     * Creates visual helpers for all registered colliders.
     * @param {THREE.Scene} scene - The scene to add helpers to.
     * @returns {Array<object>} Array of created THREE.js helper objects.
     */
    createDebugColliderHelpers(scene) {
        const helpers = [];
        this.colliders.forEach(({ collider, objectType }) => {
            let helper = null;
            let color = 0x00ff00; // Default green

            if (objectType === 'tree') color = 0x008000; // Darker green
            else if (objectType === 'rock') color = 0x808080; // Grey
            else if (objectType === 'building') color = 0x0000ff; // Blue

            if (collider.type === 'box' && collider.box) {
                helper = new THREE.Box3Helper(collider.box, color);
            } else if (collider.type === 'sphere') {
                // No default sphere helper, create wireframe mesh
                const geometry = new THREE.SphereGeometry(collider.radius, 16, 8);
                const material = new THREE.WireframeGeometry(geometry);
                helper = new THREE.LineSegments(material, new THREE.LineBasicMaterial({ color: color, depthTest: false, opacity: 0.5, transparent: true }));
                helper.position.copy(collider.position);
            } else if (collider.type === 'cylinder') {
                 // No default cylinder helper, create wireframe mesh
                const geometry = new THREE.CylinderGeometry(collider.radius, collider.radius, collider.height, 16);
                const material = new THREE.WireframeGeometry(geometry);
                helper = new THREE.LineSegments(material, new THREE.LineBasicMaterial({ color: color, depthTest: false, opacity: 0.5, transparent: true }));
                // Position helper at the center of the cylinder height
                helper.position.copy(collider.position);
                helper.position.y += collider.height / 2;
            }

            if (helper) {
                scene.add(helper);
                helpers.push(helper);
            }
        });
        return helpers;
    }
}
