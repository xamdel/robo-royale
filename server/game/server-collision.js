// Basic Vector3-like structure for server-side calculations
class Vec3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    clone() {
        return new Vec3(this.x, this.y, this.z);
    }

    add(v) {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z;
        return this;
    }

    sub(v) {
        this.x -= v.x;
        this.y -= v.y;
        this.z -= v.z;
        return this;
    }

    lengthSq() {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    distanceToSq(v) {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        const dz = this.z - v.z;
        return dx * dx + dy * dy + dz * dz;
    }

    normalize() {
        const len = Math.sqrt(this.lengthSq());
        if (len > 0.00001) {
            this.x /= len;
            this.y /= len;
            this.z /= len;
        }
        return this;
    }

     multiplyScalar(scalar) {
        this.x *= scalar;
        this.y *= scalar;
        this.z *= scalar;
        return this;
    }

    copy(v) {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;
        return this;
    }
}

/**
 * Server-side collision system using a spatial grid.
 * Operates on simplified data structures without Three.js dependencies.
 */
class ServerCollisionSystem { // Remove export keyword
    constructor(worldWidth, worldDepth, cellSize = 40) {
        this.worldWidth = worldWidth;
        this.worldDepth = worldDepth;
        this.cellSize = cellSize;
        this.halfWidth = worldWidth / 2;
        this.halfDepth = worldDepth / 2;

        this.cols = Math.ceil(worldWidth / cellSize);
        this.rows = Math.ceil(worldDepth / cellSize);

        // Initialize grid as a Map for potentially sparse population
        this.grid = new Map(); // Keys are "col,row", values are arrays of collider refs

        this.colliders = new Map(); // Map of objectId -> { colliderData, objectType }
        this.nextId = 1; // Simple ID generator

        console.log(`[ServerCollision] Initialized: ${this.cols}x${this.rows} grid, cell size ${cellSize}`);
    }

    // --- Grid Helper Methods ---

    worldToGridIndices(worldX, worldZ) {
        const gridX = worldX + this.halfWidth;
        const gridZ = worldZ + this.halfDepth;
        const col = Math.floor(gridX / this.cellSize);
        const row = Math.floor(gridZ / this.cellSize);
        return {
            col: Math.max(0, Math.min(col, this.cols - 1)),
            row: Math.max(0, Math.min(row, this.rows - 1))
        };
    }

    getCellKey(col, row) {
        return `${col},${row}`;
    }

    // --- Collider Registration ---

    /**
     * Registers a collider based on simplified data received from the client or generated server-side.
     * @param {object} colliderData - Plain object containing position, dimensions (radius, height, width, depth).
     * @param {string} objectType - 'tree', 'rock', 'building'.
     * @returns {string} The unique ID assigned to this collider.
     */
    registerCollider(colliderData, objectType) {
        const objectId = `${objectType}_${this.nextId++}`;
        // Ensure position is a Vec3
        if (!(colliderData.position instanceof Vec3)) {
             colliderData.position = new Vec3(colliderData.position.x, colliderData.position.y, colliderData.position.z);
        }

        // Calculate AABB on the server
        const aabb = this.calculateAABB(colliderData, objectType);
        if (!aabb) {
            console.error(`[ServerCollision] Failed to calculate AABB for ${objectType}`, colliderData);
            return null;
        }
        colliderData.aabb = aabb; // Store AABB with collider data

        this.colliders.set(objectId, { colliderData, objectType });

        // Add to spatial grid
        const minIndices = this.worldToGridIndices(aabb.min.x, aabb.min.z);
        const maxIndices = this.worldToGridIndices(aabb.max.x, aabb.max.z);

        for (let r = minIndices.row; r <= maxIndices.row; r++) {
            for (let c = minIndices.col; c <= maxIndices.col; c++) {
                const key = this.getCellKey(c, r);
                if (!this.grid.has(key)) {
                    this.grid.set(key, []);
                }
                this.grid.get(key).push({ objectId, objectType }); // Store refs in grid
            }
        }
        // console.log(`[ServerCollision] Registered ${objectId} (${objectType})`);
        return objectId;
    }

     /**
     * Calculates the Axis-Aligned Bounding Box for a given collider data.
     * @param {object} colliderData - Contains position and dimensions.
     * @param {string} objectType - 'tree', 'rock', 'building'.
     * @returns {{min: Vec3, max: Vec3}|null} The AABB or null if type is unknown.
     */
    calculateAABB(colliderData, objectType) {
        const pos = colliderData.position;
        let min = new Vec3();
        let max = new Vec3();

        switch (objectType) {
            case 'tree': // Cylinder
                min.x = pos.x - colliderData.radius;
                min.y = pos.y;
                min.z = pos.z - colliderData.radius;
                max.x = pos.x + colliderData.radius;
                max.y = pos.y + colliderData.height;
                max.z = pos.z + colliderData.radius;
                break;
            case 'rock': // Sphere
                min.x = pos.x - colliderData.radius;
                min.y = pos.y - colliderData.radius;
                min.z = pos.z - colliderData.radius;
                max.x = pos.x + colliderData.radius;
                max.y = pos.y + colliderData.radius;
                max.z = pos.z + colliderData.radius;
                break;
            case 'building': // Box (assuming AABB for now on server)
                const halfW = colliderData.width / 2;
                const halfH = colliderData.height / 2;
                const halfD = colliderData.depth / 2;
                min.x = pos.x - halfW;
                min.y = pos.y - halfH; // Assumes position is center
                min.z = pos.z - halfD;
                max.x = pos.x + halfW;
                max.y = pos.y + halfH;
                max.z = pos.z + halfD;
                break;
            default:
                console.error(`[ServerCollision] Unknown object type for AABB calculation: ${objectType}`);
                return null;
        }
        return { min, max };
    }


    // --- Collision Checking ---

    /**
     * Checks player collision against nearby objects.
     * @param {Vec3} playerPosition - Player's current position.
     * @param {number} playerRadius - Player's collision radius.
     * @returns {Array<object>} Array of colliding object references { objectId, objectType, colliderData }.
     */
    checkPlayerCollision(playerPosition, playerRadius) {
        const centerIndices = this.worldToGridIndices(playerPosition.x, playerPosition.z);
        const searchRadius = Math.ceil(playerRadius / this.cellSize);
        const collisions = [];
        const checkedIds = new Set();

        for (let r = centerIndices.row - searchRadius; r <= centerIndices.row + searchRadius; r++) {
            for (let c = centerIndices.col - searchRadius; c <= centerIndices.col + searchRadius; c++) {
                const key = this.getCellKey(c, r);
                if (this.grid.has(key)) {
                    const cellColliders = this.grid.get(key);
                    for (const { objectId, objectType } of cellColliders) {
                        if (checkedIds.has(objectId)) continue;

                        const { colliderData } = this.colliders.get(objectId);

                        // Broad phase AABB check first
                        if (!this.checkAABBOverlap(playerPosition, playerRadius, colliderData.aabb)) {
                             checkedIds.add(objectId);
                             continue;
                        }

                        // Narrow phase check
                        if (this.performCollisionCheck(playerPosition, playerRadius, colliderData, objectType)) {
                            collisions.push({ objectId, objectType, colliderData });
                        }
                        checkedIds.add(objectId);
        }
    }
}
        }
        return collisions;
    }

     /**
     * Checks if a sphere (player) overlaps with an AABB.
     * @param {Vec3} sphereCenter - Center of the sphere.
     * @param {number} sphereRadius - Radius of the sphere.
     * @param {{min: Vec3, max: Vec3}} aabb - The Axis-Aligned Bounding Box.
     * @returns {boolean} True if they overlap.
     */
    checkAABBOverlap(sphereCenter, sphereRadius, aabb) {
        // Find the closest point on the AABB to the sphere center
        const closestPoint = new Vec3(
            Math.max(aabb.min.x, Math.min(sphereCenter.x, aabb.max.x)),
            Math.max(aabb.min.y, Math.min(sphereCenter.y, aabb.max.y)),
            Math.max(aabb.min.z, Math.min(sphereCenter.z, aabb.max.z))
        );

        // Check if the distance squared from sphere center to closest point is less than radius squared
        const distanceSq = sphereCenter.distanceToSq(closestPoint);
        return distanceSq < (sphereRadius * sphereRadius);
    }


    /**
     * Performs the specific collision check based on object type.
     * @param {Vec3} playerPosition
     * @param {number} playerRadius
     * @param {object} colliderData
     * @param {string} objectType
     * @returns {boolean} True if collision occurs.
     */
    performCollisionCheck(playerPosition, playerRadius, colliderData, objectType) {
        const objPos = colliderData.position;

        switch (objectType) {
            case 'tree': // Cylinder check (horizontal circle + height)
                if (playerPosition.y < objPos.y || playerPosition.y > objPos.y + colliderData.height) {
                    return false; // Outside height range
                }
                const dxCyl = playerPosition.x - objPos.x;
                const dzCyl = playerPosition.z - objPos.z;
                const distSqCyl = dxCyl * dxCyl + dzCyl * dzCyl;
                const totalRadiusCyl = colliderData.radius + playerRadius;
                return distSqCyl <= totalRadiusCyl * totalRadiusCyl;

            case 'rock': // Sphere check
                const totalRadiusSph = colliderData.radius + playerRadius;
                return objPos.distanceToSq(playerPosition) <= totalRadiusSph * totalRadiusSph;

            case 'building': // Box check (AABB for now on server)
                // Using the AABB check function which is sufficient here
                return this.checkAABBOverlap(playerPosition, playerRadius, colliderData.aabb);

            default:
                return false;
        }
    }

    /**
     * Performs a raycast check (simplified for server).
     * @param {Vec3} origin
     * @param {Vec3} direction - Normalized direction vector.
     * @param {number} maxDistance
     * @returns {object|null} Closest hit { distance, point, objectId, objectType } or null.
     */
    raycast(origin, direction, maxDistance) {
        // TODO: Implement server-side raycasting
        // 1. Grid traversal (similar to client, but using cell keys)
        // 2. For each collider in traversed cells:
        //    - Ray-AABB intersection test (broad phase)
        //    - If AABB hit, perform precise Ray-Primitive intersection (Sphere, Cylinder, Box)
        // 3. Keep track of the closest hit.
        console.warn("[ServerCollision] Raycast not yet implemented.");
        return null;
    }

    /**
     * Resolves player collision (basic pushback/slide).
     * Modifies the desiredPosition vector.
     * @param {Vec3} originalPosition
     * @param {Vec3} desiredPosition - Will be modified.
     * @param {number} playerRadius
     * @param {Array<object>} collisions
     */
    resolvePlayerCollision(originalPosition, desiredPosition, playerRadius, collisions) {
         if (collisions.length === 0) return;

        // Attempt simple slide first
        const movementVector = desiredPosition.clone().sub(originalPosition);
        let resolved = false;

        // Try X only
        const posX = originalPosition.clone().add(new Vec3(movementVector.x, 0, 0));
        if (this.checkPlayerCollision(posX, playerRadius).length === 0) {
            desiredPosition.copy(posX);
            resolved = true;
        } else {
            // Try Z only
            const posZ = originalPosition.clone().add(new Vec3(0, 0, movementVector.z));
            if (this.checkPlayerCollision(posZ, playerRadius).length === 0) {
                desiredPosition.copy(posZ);
                resolved = true;
            }
        }

        // If still not resolved, block movement
        if (!resolved) {
            desiredPosition.copy(originalPosition);
        }
    }
}

// Export both classes using CommonJS syntax
module.exports = {
    Vec3,
    ServerCollisionSystem
};
