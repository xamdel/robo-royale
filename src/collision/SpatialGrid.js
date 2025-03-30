import * as THREE from 'three';

/**
 * A simple grid-based spatial hash for efficient collision checking.
 */
export class SpatialGrid {
    /**
     * @param {number} worldWidth - The total width of the world space (X-axis).
     * @param {number} worldDepth - The total depth of the world space (Z-axis).
     * @param {number} cellSize - The size of each grid cell.
     */
    constructor(worldWidth, worldDepth, cellSize) {
        this.cellSize = cellSize;
        this.worldWidth = worldWidth;
        this.worldDepth = worldDepth; // Renamed from worldHeight for clarity in XZ plane
        this.halfWidth = worldWidth / 2;
        this.halfDepth = worldDepth / 2;

        this.cols = Math.ceil(worldWidth / cellSize);
        this.rows = Math.ceil(worldDepth / cellSize); // Use depth for rows

        // Initialize grid as an array of arrays (cells)
        this.grid = new Array(this.cols * this.rows);
        for (let i = 0; i < this.grid.length; i++) {
            this.grid[i] = []; // Each cell is an array of colliders
        }

        console.log(`[SpatialGrid] Initialized: ${this.cols}x${this.rows} grid, cell size ${cellSize}`);
    }

    /**
     * Converts world coordinates (X, Z) to grid cell indices (col, row).
     * @param {number} worldX - World X coordinate.
     * @param {number} worldZ - World Z coordinate.
     * @returns {{col: number, row: number}} Grid cell indices.
     */
    worldToGridIndices(worldX, worldZ) {
        // Shift origin from world center (-halfWidth, -halfDepth) to grid origin (0, 0)
        const gridX = worldX + this.halfWidth;
        const gridZ = worldZ + this.halfDepth;

        const col = Math.floor(gridX / this.cellSize);
        const row = Math.floor(gridZ / this.cellSize); // Use Z for row calculation

        // Clamp indices to be within grid bounds
        return {
            col: Math.max(0, Math.min(col, this.cols - 1)),
            row: Math.max(0, Math.min(row, this.rows - 1))
        };
    }

    /**
     * Calculates the 1D array index for a given grid cell (col, row).
     * @param {number} col - Column index.
     * @param {number} row - Row index.
     * @returns {number} The 1D index in the grid array.
     */
    getCellIndex(col, row) {
        // Ensure indices are within bounds before calculating index
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
            console.warn(`[SpatialGrid] getCellIndex received out-of-bounds indices: (${col}, ${row})`);
            return -1; // Indicate an invalid index
        }
        return row * this.cols + col;
    }

    /**
     * Adds a collider object to the appropriate grid cell(s).
     * If a collider spans multiple cells, it's added to all of them.
     * @param {object} collider - The collider object (e.g., CylinderCollider, SphereCollider).
     * @param {string} objectId - A unique identifier for the object associated with the collider.
     * @param {string} objectType - The type of the object ('tree', 'rock', 'building').
     */
    addCollider(collider, objectId, objectType) {
        if (!collider.aabb) {
            console.error("[SpatialGrid] Collider missing AABB for grid placement:", collider);
            return;
        }

        // Determine the grid cell range the collider's AABB overlaps
        const minIndices = this.worldToGridIndices(collider.aabb.min.x, collider.aabb.min.z);
        const maxIndices = this.worldToGridIndices(collider.aabb.max.x, collider.aabb.max.z);

        // Add the collider reference to all cells it overlaps
        for (let r = minIndices.row; r <= maxIndices.row; r++) {
            for (let c = minIndices.col; c <= maxIndices.col; c++) {
                const cellIndex = this.getCellIndex(c, r);
                if (cellIndex !== -1) {
                    this.grid[cellIndex].push({
                        collider,
                        objectId,
                        objectType
                    });
                }
            }
        }
    }

    /**
     * Retrieves all collider references from cells surrounding a given world position.
     * @param {number} worldX - World X coordinate.
     * @param {number} worldZ - World Z coordinate.
     * @param {number} searchRadius - How many cells out to search (0 = only current cell, 1 = 3x3 area, etc.).
     * @returns {Array<object>} An array of collider references { collider, objectId, objectType }. Duplicates are possible if colliders span cells.
     */
    getNearbyCellColliders(worldX, worldZ, searchRadius = 1) {
        const centerIndices = this.worldToGridIndices(worldX, worldZ);
        let nearbyColliders = [];
        const addedColliderIds = new Set(); // To avoid returning duplicates of the same collider

        // Iterate through the search area around the center cell
        for (let r = centerIndices.row - searchRadius; r <= centerIndices.row + searchRadius; r++) {
            for (let c = centerIndices.col - searchRadius; c <= centerIndices.col + searchRadius; c++) {
                // Check if the cell indices are valid
                if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) {
                    const cellIndex = this.getCellIndex(c, r);
                    const cellContent = this.grid[cellIndex];
                    // Add unique colliders from this cell
                    for (const colliderRef of cellContent) {
                        if (!addedColliderIds.has(colliderRef.objectId)) {
                            nearbyColliders.push(colliderRef);
                            addedColliderIds.add(colliderRef.objectId);
                        }
                    }
                }
            }
        }

        return nearbyColliders;
    }

    /**
     * Retrieves all grid cells that a ray potentially intersects.
     * Uses a simplified grid traversal algorithm (like DDA or Amanatides-Woo).
     * @param {THREE.Ray} ray - The ray to trace.
     * @param {number} maxDistance - The maximum distance the ray travels.
     * @returns {Array<{col: number, row: number}>} An array of grid cell indices {col, row}.
     */
    getRayIntersectingCells(ray, maxDistance) {
        const cells = [];
        const startIndices = this.worldToGridIndices(ray.origin.x, ray.origin.z);
        let currentCol = startIndices.col;
        let currentRow = startIndices.row;

        // Ray direction components
        const stepX = Math.sign(ray.direction.x);
        const stepZ = Math.sign(ray.direction.z); // Use Z for depth/row direction

        // Calculate distance to next vertical/horizontal grid line
        const nextVerticalBoundary = (currentCol + (stepX > 0 ? 1 : 0)) * this.cellSize - this.halfWidth;
        const nextHorizontalBoundary = (currentRow + (stepZ > 0 ? 1 : 0)) * this.cellSize - this.halfDepth;

        // Calculate tMaxX and tMaxZ (parameter t at which ray crosses next grid line)
        // Avoid division by zero
        let tMaxX = (ray.direction.x === 0) ? Infinity : (nextVerticalBoundary - ray.origin.x) / ray.direction.x;
        let tMaxZ = (ray.direction.z === 0) ? Infinity : (nextHorizontalBoundary - ray.origin.z) / ray.direction.z; // Use Z

        // Calculate tDeltaX and tDeltaZ (parameter t needed to travel one cell width/height)
        const tDeltaX = (ray.direction.x === 0) ? Infinity : this.cellSize / Math.abs(ray.direction.x);
        const tDeltaZ = (ray.direction.z === 0) ? Infinity : this.cellSize / Math.abs(ray.direction.z); // Use Z

        let currentDistance = 0;

        while (currentDistance <= maxDistance) {
            // Add current cell if valid
            if (currentCol >= 0 && currentCol < this.cols && currentRow >= 0 && currentRow < this.rows) {
                 // Check if cell already added to prevent duplicates in edge cases
                const cellExists = cells.some(cell => cell.col === currentCol && cell.row === currentRow);
                if (!cellExists) {
                    cells.push({ col: currentCol, row: currentRow });
                }
            } else {
                break; // Ray went out of bounds
            }

            // Move to the next cell
            if (tMaxX < tMaxZ) {
                currentDistance = tMaxX;
                tMaxX += tDeltaX;
                currentCol += stepX;
            } else {
                currentDistance = tMaxZ;
                tMaxZ += tDeltaZ;
                currentRow += stepZ;
            }

             // Safety break if somehow stuck
             if (cells.length > this.cols * this.rows) {
                 console.warn("[SpatialGrid] Ray traversal exceeded max cells, breaking.");
                 break;
             }
        }

        return cells;
    }

    // --- Debugging Methods ---

    /**
     * Creates visual representations of the grid cells for debugging.
     * @param {THREE.Scene} scene - The scene to add the debug visuals to.
     * @param {THREE.Color} color - The color of the grid lines.
     * @returns {THREE.LineSegments} The created grid helper object.
     */
    createDebugGridHelper(scene, color = 0x888888) {
        const divisions = Math.max(this.cols, this.rows); // Use max divisions for a square helper
        const size = Math.max(this.worldWidth, this.worldDepth); // Use max dimension

        // THREE.GridHelper aligns to XZ plane by default
        const gridHelper = new THREE.GridHelper(size, divisions, color, color);

        // Adjust position if world center is not (0,0,0) - assuming it is for now
        // gridHelper.position.set(0, 0.1, 0); // Slightly above ground

        scene.add(gridHelper);
        return gridHelper; // Return if removal is needed later
    }

     /**
     * Creates visual representations of the AABBs of colliders in a specific cell.
     * @param {THREE.Scene} scene - The scene to add the debug visuals to.
     * @param {number} col - Column index of the cell.
     * @param {number} row - Row index of the cell.
     * @param {THREE.Color} color - Color for the AABB helpers.
     * @returns {Array<THREE.Box3Helper>} Array of created helpers.
     */
    createDebugCellContentHelper(scene, col, row, color = 0xff0000) {
        const cellIndex = this.getCellIndex(col, row);
        const helpers = [];
        if (cellIndex !== -1) {
            const cellContent = this.grid[cellIndex];
            for (const { collider } of cellContent) {
                if (collider.aabb) {
                    const helper = new THREE.Box3Helper(collider.aabb, color);
                    scene.add(helper);
                    helpers.push(helper);
                }
            }
        }
        return helpers;
    }
}
