import * as THREE from 'three';
import { modelManager } from './ModelManager.js'; // Import the model manager


// Simple seeded pseudo-random number generator (Mulberry32)
function mulberry32(seed) {
  return function() {
    var t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

// Helper function to check if a grid cell is within bounds and 'FLAT'
function isCellFlat(c, r, gridCols, gridRows, terrainGenerator) {
    if (c < 0 || c >= gridCols || r < 0 || r >= gridRows) {
        return false; // Out of bounds
    }
    const cellCenterX = (c - gridCols / 2 + 0.5) * GRID_CELL_SIZE;
    const cellCenterZ = (r - gridRows / 2 + 0.5) * GRID_CELL_SIZE;
    const terrainInfo = terrainGenerator.getTerrainInfo(cellCenterX, cellCenterZ);
    return terrainInfo.zone === 'FLAT';
}


// --- Grid Parameters ---
const GRID_CELL_SIZE = 20; // Increased cell size for wider streets/plots
const STREET_WIDTH = 8;    // Increased street width
const BUILDING_PLOT_SIZE = GRID_CELL_SIZE - STREET_WIDTH; // Recalculated plot size

// --- City Structure Parameters ---
const HORIZONTAL_STREET_INTERVAL = 5; // Place a horizontal street every N rows
const VERTICAL_STREET_INTERVAL = 4;   // Place a vertical street every N columns
const PLACEMENT_PROBABILITY = 0.85; // Increased chance to place something (building or road segment)
const ROAD_COLOR = new THREE.Color(0x282828); // Dark grey for roads
const ROAD_HEIGHT_OFFSET = 0.1; // Place roads slightly above terrain to avoid z-fighting

// --- Building Distribution Parameters ---
// Define radii for different building zones (adjust as needed)
const SKYSCRAPER_ZONE_RADIUS = 50;
const LARGE_BUILDING_ZONE_RADIUS = 120;
// Small buildings will be placed outside the large building zone

export const BuildingPlacer = {
  // Add modelManager and objectColliders to the parameters
  placeBuildings: (scene, terrainGenerator, modelManager, objectColliders, maxBuildings = 500, placementAttemptsMultiplier = 4) => {
    if (!terrainGenerator || !terrainGenerator.isInitialized) {
      console.error("[BuildingPlacer] TerrainGenerator not initialized.");
      return;
    }
    if (!modelManager || !modelManager.isLoaded) {
        console.error("[BuildingPlacer] ModelManager not initialized or models not loaded.");
        return;
    }
    // Add check for objectColliders
    if (!objectColliders) {
        console.error("[BuildingPlacer] ObjectColliders instance not provided.");
        return { roads: null }; // Return empty object or handle error appropriately
    }
    if (!modelManager || !modelManager.isLoaded) {
        console.error("[BuildingPlacer] ModelManager not initialized or models not loaded.");
        return;
    }

    console.log("[BuildingPlacer] Placing buildings using grid system...");

    const { width: terrainWidth, height: terrainHeight } = terrainGenerator.generationParams;

    // Use a fixed seed for deterministic placement
    let placementSeed = 0;
    for (let i = 0; i < terrainGenerator.mapSeed.length; i++) {
        placementSeed = (placementSeed * 31 + terrainGenerator.mapSeed.charCodeAt(i)) | 0;
    }
    const random = mulberry32(placementSeed + 100);

    // --- Instanced Mesh Setup ---
    // We'll create separate InstancedMesh objects for roads and each building category later.
    // For now, let's just prepare the common variables.
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    // We will use specific quaternions for roads later
    const scale = new THREE.Vector3(1, 1, 1); // Default scale, will be adjusted per model
    const color = new THREE.Color(); // Reused for road color

    const minSlopeThreshold = 0.15; // Keep slope check

    // Calculate grid dimensions
    const gridCols = Math.floor(terrainWidth / GRID_CELL_SIZE);
    const gridRows = Math.floor(terrainHeight / GRID_CELL_SIZE);
    const totalGridCells = gridCols * gridRows;
    const placementAttempts = totalGridCells * placementAttemptsMultiplier; // Try more attempts relative to grid size

    // Keep track of occupied grid cells to avoid overlap
    const occupiedCells = new Set(); // Keep track of occupied cells (for buildings)
    const roadCells = new Set(); // Keep track of cells designated as roads

    let placedBuildingCount = 0;
    let placedRoadSegmentCount = 0;

    console.log(`[BuildingPlacer] Grid dimensions: ${gridCols}x${gridRows} (${totalGridCells} cells)`);
    console.log(`[BuildingPlacer] Max buildings: ${maxBuildings}, Placement attempts: ${placementAttempts}`);

    // --- Initialize InstancedMesh for Roads ---
    // Use geometry representing a strip of STREET_WIDTH width, spanning the GRID_CELL_SIZE length.
    // We will rotate this geometry for vertical segments.
    const roadStripGeometry = new THREE.PlaneGeometry(GRID_CELL_SIZE, STREET_WIDTH);
    const roadMaterial = new THREE.MeshPhongMaterial({ color: ROAD_COLOR, side: THREE.DoubleSide }); // Use defined road color
    // Allocate potentially double the instances for intersections
    const roadInstancedMesh = new THREE.InstancedMesh(roadStripGeometry, roadMaterial, totalGridCells * 2);
    roadInstancedMesh.receiveShadow = true; // Roads should receive shadows
    scene.add(roadInstancedMesh); // Add to scene immediately

    // --- Building Placement Setup ---
    // We will now place individual cloned models instead of using InstancedMesh for buildings.

    // --- Placement Loop ---
    // Iterate through all grid cells systematically first to define roads
    console.log("[BuildingPlacer] Defining road layout...");

    // --- Pre-calculate Road Orientations ---
    // Horizontal: Plane flat on XZ, length along X. Rotate default XY plane -90 deg around X.
    const qHorizontal = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    // Vertical: Plane flat on XZ, length along Z. Start with horizontal and rotate 90 deg around Y.
    const qVertical = qHorizontal.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));


    for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
            const cellKey = `${c},${r}`;
            const isVerticalStreetColumn = (c % VERTICAL_STREET_INTERVAL === 0);
            const isHorizontalStreetRow = (r % HORIZONTAL_STREET_INTERVAL === 0);

            // Check if this cell *could* be part of a horizontal or vertical street
            if (isVerticalStreetColumn || isHorizontalStreetRow) {
                // Calculate world coordinates for the center of the potential road cell
                const roadCellCenterX = (c - gridCols / 2 + 0.5) * GRID_CELL_SIZE;
                const roadCellCenterZ = (r - gridRows / 2 + 0.5) * GRID_CELL_SIZE;

                // Get terrain info at the center of the cell
                const roadTerrainInfo = terrainGenerator.getTerrainInfo(roadCellCenterX, roadCellCenterZ);

                // We'll just use the existing zone check for this iteration.
                if (roadTerrainInfo.zone === 'FLAT') { // Only place roads in the FLAT zone
                    let placedSegmentInCell = false; // Track if we placed anything in this cell

                    // Set base position slightly above terrain
                    position.set(roadCellCenterX, roadTerrainInfo.height + ROAD_HEIGHT_OFFSET, roadCellCenterZ);
                    // Use default scale (1,1,1)
                    scale.set(1, 1, 1);

                    // Place Horizontal Segment if it's a horizontal street row AND neighbors are FLAT
                    if (isHorizontalStreetRow) {
                        // Check horizontal neighbors
                        const leftNeighborFlat = isCellFlat(c - 1, r, gridCols, gridRows, terrainGenerator);
                        const rightNeighborFlat = isCellFlat(c + 1, r, gridCols, gridRows, terrainGenerator);
                        if (leftNeighborFlat && rightNeighborFlat) { // Only place if neighbors are also flat
                            matrix.compose(position, qHorizontal, scale); // Use pre-calculated horizontal quaternion
                            if (placedRoadSegmentCount < roadInstancedMesh.count) { // Check bounds
                                roadInstancedMesh.setMatrixAt(placedRoadSegmentCount++, matrix);
                                placedSegmentInCell = true;
                            }
                        }
                    }

                    // Place Vertical Segment if it's a vertical street column AND neighbors are FLAT
                    if (isVerticalStreetColumn) {
                         // Check vertical neighbors
                        const topNeighborFlat = isCellFlat(c, r - 1, gridCols, gridRows, terrainGenerator);
                        const bottomNeighborFlat = isCellFlat(c, r + 1, gridCols, gridRows, terrainGenerator);
                         if (topNeighborFlat && bottomNeighborFlat) { // Only place if neighbors are also flat
                            matrix.compose(position, qVertical, scale); // Use pre-calculated vertical quaternion
                            if (placedRoadSegmentCount < roadInstancedMesh.count) { // Check bounds
                                roadInstancedMesh.setMatrixAt(placedRoadSegmentCount++, matrix);
                                placedSegmentInCell = true;
                            }
                        }
                    }

                    // If we placed *any* segment (horizontal or vertical) in this cell, mark it as a road cell
                    if (placedSegmentInCell) {
                        roadCells.add(cellKey);
                    }
                }
                // --- End of zone check ---
            }
        }
    }
    console.log(`[BuildingPlacer] Defined ${roadCells.size} road cells, placed ${placedRoadSegmentCount} road segments.`);
    // Update the count and instance matrix buffer for the roads
    roadInstancedMesh.count = placedRoadSegmentCount;
    roadInstancedMesh.instanceMatrix.needsUpdate = true;


    // Now attempt to place buildings in non-road cells
    console.log("[BuildingPlacer] Placing buildings...");
    // Use a temporary quaternion for buildings, separate from road quaternions
    const buildingQuaternion = new THREE.Quaternion();
    for (let attempt = 0; attempt < placementAttempts && placedBuildingCount < maxBuildings; attempt++) {
        // Pick a random grid cell for potential building placement
        const gridX = Math.floor(random() * gridCols);
        const gridZ = Math.floor(random() * gridRows);
        const cellKey = `${gridX},${gridZ}`;

        // Check if cell is already occupied by a building OR is designated as a road
        if (occupiedCells.has(cellKey) || roadCells.has(cellKey)) {
            continue;
        }

        // Calculate world coordinates for the center of the *grid cell*
        const cellCenterX = (gridX - gridCols / 2 + 0.5) * GRID_CELL_SIZE;
        const cellCenterZ = (gridZ - gridRows / 2 + 0.5) * GRID_CELL_SIZE;

        // Get terrain info at the center of the cell
        const terrainInfo = terrainGenerator.getTerrainInfo(cellCenterX, cellCenterZ);

        // Check if terrain is suitable (flat enough)
        const isFlatZone = terrainInfo.zone === 'FLAT'; // Check if it's the designated flat city zone
        const isLowSlope = terrainInfo.slope < minSlopeThreshold;
        const canPlaceOnTerrain = isFlatZone && isLowSlope; // Must be FLAT *and* low slope

        // Check terrain suitability (flat zone, low slope) *and* placement probability
        if (canPlaceOnTerrain && random() < PLACEMENT_PROBABILITY) {

            // --- Add Neighbor Check for Edge Avoidance ---
            const leftNeighborFlat = isCellFlat(gridX - 1, gridZ, gridCols, gridRows, terrainGenerator);
            const rightNeighborFlat = isCellFlat(gridX + 1, gridZ, gridCols, gridRows, terrainGenerator);
            const topNeighborFlat = isCellFlat(gridX, gridZ - 1, gridCols, gridRows, terrainGenerator);
            const bottomNeighborFlat = isCellFlat(gridX, gridZ + 1, gridCols, gridRows, terrainGenerator);

            // Only place if the cell AND its neighbors are flat
            if (leftNeighborFlat && rightNeighborFlat && topNeighborFlat && bottomNeighborFlat) {

                // --- Determine Building Category based on Distance ---
                const distFromCenter = Math.sqrt(cellCenterX * cellCenterX + cellCenterZ * cellCenterZ);
            let category = 'small'; // Default to small
            if (distFromCenter <= SKYSCRAPER_ZONE_RADIUS) {
                category = 'skyscraper';
            } else if (distFromCenter <= LARGE_BUILDING_ZONE_RADIUS) {
                category = 'large';
            }

            // --- Get Model and Place Cloned Instance ---
            const modelData = modelManager.getRandomModel(category);

            if (modelData && modelData.scene) {
                // Clone the model's scene to create an independent instance
                const clonedBuilding = modelData.scene.clone();

                // Calculate position: Place base at terrain height.
                position.set(cellCenterX, terrainInfo.height, cellCenterZ);

                // Calculate scale: Set to 10x the original size.
                // Consider adding random scale variations later if desired.
                scale.set(10, 10, 10);

                // Calculate rotation: Align with grid (identity quaternion).
                // Consider adding random rotation later if desired.
                buildingQuaternion.set(0, 0, 0, 1); // Identity

                // Apply transform directly to the cloned object
                clonedBuilding.position.copy(position);
                clonedBuilding.quaternion.copy(buildingQuaternion);
                clonedBuilding.scale.copy(scale);

                // Enable shadows for all meshes within the clone
                clonedBuilding.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        // Optional: Check/fix material properties if transparency issues persist
                        // if (child.material) {
                        //     child.material.transparent = false;
                        //     child.material.opacity = 1.0;
                        //     child.material.needsUpdate = true;
                        // }
                    }
                });

                // Add the cloned building directly to the scene
                scene.add(clonedBuilding);

                // --- Register Building Collider ---
                if (objectColliders) {
                    objectColliders.registerBuildingCollider(clonedBuilding, category);
                }
                // --- End Collider Registration ---


                // Mark cell as occupied and increment counts
                occupiedCells.add(cellKey);
                placedBuildingCount++; // Increment total placed count

            } else {
                 if (!modelData) console.warn(`[BuildingPlacer] No model found for category: ${category}`);
                 else console.warn(`[BuildingPlacer] Model data for category ${category} missing scene object.`);
                }
            } // End neighbor check block
        }
    }

    // --- No need to update InstancedMesh counts for buildings anymore ---

    console.log(`[BuildingPlacer] Placed ${placedBuildingCount} total buildings on the grid.`);
    // Return only the road mesh, as buildings are added directly to the scene
    return {
        roads: roadInstancedMesh
    };
  }
};
