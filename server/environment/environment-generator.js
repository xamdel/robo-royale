/**
 * Server-side environment generator that mirrors client-side logic
 * but uses only node-compatible code (no THREE.js dependencies)
 */

const { createNoise2D } = require('simplex-noise');

// Simple seeded pseudo-random number generator (Mulberry32)
function mulberry32(seed) {
  return function() {
    var t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

// Helper to create a numeric seed from a string
function createNumericSeed(str) {
  let seed = 0;
  for (let i = 0; i < str.length; i++) {
    seed = (seed * 31 + str.charCodeAt(i)) | 0; // Simple hash
  }
  return seed;
}

// --- Grid Parameters for Buildings ---
const GRID_CELL_SIZE = 20;
const HORIZONTAL_STREET_INTERVAL = 5;
const VERTICAL_STREET_INTERVAL = 4;
const PLACEMENT_PROBABILITY = 0.85;
const SKYSCRAPER_ZONE_RADIUS = 50;
const LARGE_BUILDING_ZONE_RADIUS = 120;

class EnvironmentGenerator {
  constructor(terrainGenerator) {
    this.terrainGenerator = terrainGenerator;
    
    if (!this.terrainGenerator || !this.terrainGenerator.isInitialized || !this.terrainGenerator.mapSeed) {
      console.error("[EnvGenerator] TerrainGenerator must be initialized with a seed first!");
      return;
    }
    
    // Create seeds from the terrain seed
    const envSeed = createNumericSeed(this.terrainGenerator.mapSeed + '_env');
    const clumpSeed = createNumericSeed(this.terrainGenerator.mapSeed + '_clump');
    const buildingSeed = createNumericSeed(this.terrainGenerator.mapSeed + '_buildings');
    
    // Initialize random generators
    this.envRandom = mulberry32(envSeed);
    this.clumpNoise = createNoise2D(mulberry32(clumpSeed));
    this.buildingRandom = mulberry32(buildingSeed);
    
    console.log(`[Server-EnvGenerator] Initialized with seed derivatives from '${this.terrainGenerator.mapSeed}'`);
    this.isInitialized = true;
    
    // Use the same world dimensions as the terrain generator
    this.worldWidth = this.terrainGenerator.generationParams.width;
    this.worldHeight = this.terrainGenerator.generationParams.height;
  }

  /**
   * Generate environmental objects (trees and rocks) with the same
   * placement logic as the client
   */
  generateEnvironmentalObjects(config = {}) {
    if (!this.isInitialized) {
      console.error("[EnvGenerator] Not initialized properly, cannot generate objects");
      return { trees: [], rocks: [] };
    }

    const {
      placementGridSize = 8,
      maxPlacementSlope = 0.5,
      hillsBaseTreeDensity = 0.05,
      hillsClumpThreshold = 0.4,
      hillsClumpDensityMultiplier = 50.0,
      clumpNoiseScale = 0.03,
      mountainsTreeDensity = 0.2,
      mountainsRockDensity = 0.2,
      maxMountainObjectHeight = 20.0,
      protectedSpawnRadius = 20.0 // Add protected spawn radius parameter
    } = config;

    console.log("[Server-EnvGenerator] Generating environmental objects...");

    const trees = [];
    const rocks = [];
    
    const terrainWidth = this.terrainGenerator.generationParams.width;
    const terrainHeight = this.terrainGenerator.generationParams.height;
    const halfWidth = terrainWidth / 2;
    const halfHeight = terrainHeight / 2;
    
    // Define a protected spawn area around the origin (0,0,0)
    const PROTECTED_SPAWN_RADIUS = protectedSpawnRadius;

    // Use the same sampling pattern as the client
    for (let x = -halfWidth; x < halfWidth; x += placementGridSize) {
      for (let z = -halfHeight; z < halfHeight; z += placementGridSize) {
        // Add random offset within the grid cell to avoid a perfect grid look
        const sampleX = x + (this.envRandom() - 0.5) * placementGridSize;
        const sampleZ = z + (this.envRandom() - 0.5) * placementGridSize;

        // Check if this position is within the protected spawn radius
        const distFromOrigin = Math.sqrt(sampleX * sampleX + sampleZ * sampleZ);
        if (distFromOrigin < PROTECTED_SPAWN_RADIUS) {
          continue; // Skip placement in spawn area
        }

        const terrainInfo = this.terrainGenerator.getTerrainInfo(sampleX, sampleZ);

        // Skip placement on very steep slopes
        if (terrainInfo.slope > maxPlacementSlope) {
          continue;
        }

        let placeTree = false;
        let placeRock = false;
        const currentHeight = terrainInfo.height;

        // --- Zone-based Placement ---
        if (terrainInfo.zone === 'HILLS') {
          const clumpValue = (this.clumpNoise(sampleX * clumpNoiseScale, sampleZ * clumpNoiseScale) + 1) / 2;
          let currentHillsDensity = hillsBaseTreeDensity;
          
          if (clumpValue > hillsClumpThreshold) {
            // Significantly increase density in clump areas
            currentHillsDensity *= hillsClumpDensityMultiplier * 
              ((clumpValue - hillsClumpThreshold) / (1 - hillsClumpThreshold));
          }

          if (this.envRandom() < currentHillsDensity) {
            placeTree = true;
          }
        } 
        else if (terrainInfo.zone === 'MOUNTAINS') {
          // Check height limit first
          if (currentHeight < maxMountainObjectHeight) {
            const rand = this.envRandom();
            if (rand < mountainsTreeDensity) {
              placeTree = true;
            } else if (rand < mountainsTreeDensity + mountainsRockDensity) {
              // Only place rock if tree wasn't placed
              placeRock = true;
            }
          }
        }

        if (placeTree) {
          // Random scale variation (matching client)
          const scale = 0.8 + this.envRandom() * 0.4; // 0.8 to 1.2
          const rotation = this.envRandom() * Math.PI * 2; // Random rotation
          
          // Create tree data with the same properties the client uses
          trees.push({
            position: { x: sampleX, y: currentHeight, z: sampleZ },
            scale,
            rotation,
            radius: 1.5 * scale, // Base radius of cone * scale
            height: 8 * scale    // Base height of cone * scale
          });
        } 
        else if (placeRock) {
          // Random scale variation (matching client)
          const scale = 0.6 + this.envRandom() * 0.8; // 0.6 to 1.4
          const rotation = this.envRandom() * Math.PI * 2; // Random rotation
          
          // Create rock data with the same properties the client uses
          rocks.push({
            position: { x: sampleX, y: currentHeight, z: sampleZ },
            scale,
            rotation,
            radius: 1.2 * scale // Base radius of icosahedron * scale
          });
        }
      }
    }

    console.log(`[Server-EnvGenerator] Generated ${trees.length} trees and ${rocks.length} rocks`);
    return { trees, rocks };
  }

  /**
   * Generate buildings with the same placement logic as the client
   */
  generateBuildings(maxBuildings = 500, placementAttemptsMultiplier = 4) {
    if (!this.isInitialized) {
      console.error("[EnvGenerator] Not initialized properly, cannot generate buildings");
      return { buildings: [] };
    }

    console.log("[Server-EnvGenerator] Generating buildings...");
    const buildings = [];
    
    const terrainWidth = this.terrainGenerator.generationParams.width;
    const terrainHeight = this.terrainGenerator.generationParams.height;
    
    const minSlopeThreshold = 0.15;
    const gridCols = Math.floor(terrainWidth / GRID_CELL_SIZE);
    const gridRows = Math.floor(terrainHeight / GRID_CELL_SIZE);
    const totalGridCells = gridCols * gridRows;
    const placementAttempts = totalGridCells * placementAttemptsMultiplier;

    // Keep track of occupied and road cells
    const occupiedCells = new Set();
    const roadCells = new Set();

    // First define road cells exactly as client does
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const cellKey = `${c},${r}`;
        const isVerticalStreetColumn = (c % VERTICAL_STREET_INTERVAL === 0);
        const isHorizontalStreetRow = (r % HORIZONTAL_STREET_INTERVAL === 0);

        if (isVerticalStreetColumn || isHorizontalStreetRow) {
          const roadCellCenterX = (c - gridCols / 2 + 0.5) * GRID_CELL_SIZE;
          const roadCellCenterZ = (r - gridRows / 2 + 0.5) * GRID_CELL_SIZE;
          const roadTerrainInfo = this.terrainGenerator.getTerrainInfo(roadCellCenterX, roadCellCenterZ);

          if (roadTerrainInfo.zone === 'FLAT') {
            let placedSegmentInCell = false;
            
            if (isHorizontalStreetRow) {
              const leftNeighborFlat = this.isCellFlat(c - 1, r, gridCols, gridRows);
              const rightNeighborFlat = this.isCellFlat(c + 1, r, gridCols, gridRows);
              if (leftNeighborFlat && rightNeighborFlat) {
                placedSegmentInCell = true;
              }
            }

            if (isVerticalStreetColumn) {
              const topNeighborFlat = this.isCellFlat(c, r - 1, gridCols, gridRows);
              const bottomNeighborFlat = this.isCellFlat(c, r + 1, gridCols, gridRows);
              if (topNeighborFlat && bottomNeighborFlat) {
                placedSegmentInCell = true;
              }
            }

            if (placedSegmentInCell) {
              roadCells.add(cellKey);
            }
          }
        }
      }
    }

    // Define a protected spawn area at the origin
    const PROTECTED_SPAWN_RADIUS = 20; // 20 units around origin (0,0) are protected
    
    // Now place buildings in non-road cells
    let placedBuildingCount = 0;
    for (let attempt = 0; attempt < placementAttempts && placedBuildingCount < maxBuildings; attempt++) {
      const gridX = Math.floor(this.buildingRandom() * gridCols);
      const gridZ = Math.floor(this.buildingRandom() * gridRows);
      const cellKey = `${gridX},${gridZ}`;
      
      // Convert grid coordinates to world coordinates
      const cellCenterX = (gridX - gridCols / 2 + 0.5) * GRID_CELL_SIZE;
      const cellCenterZ = (gridZ - gridRows / 2 + 0.5) * GRID_CELL_SIZE;
      
      // Distance from origin (spawn point)
      const distFromOrigin = Math.sqrt(cellCenterX * cellCenterX + cellCenterZ * cellCenterZ);

      // Skip if in protected spawn area, or already occupied, or a road
      if (distFromOrigin < PROTECTED_SPAWN_RADIUS || 
          occupiedCells.has(cellKey) || 
          roadCells.has(cellKey)) {
        continue;
      }

      // Get terrain info for this cell (we already have cellCenterX and cellCenterZ)
      const terrainInfo = this.terrainGenerator.getTerrainInfo(cellCenterX, cellCenterZ);

      const isFlatZone = terrainInfo.zone === 'FLAT';
      const isLowSlope = terrainInfo.slope < minSlopeThreshold;
      const canPlaceOnTerrain = isFlatZone && isLowSlope;

      if (canPlaceOnTerrain && this.buildingRandom() < PLACEMENT_PROBABILITY) {
        const leftNeighborFlat = this.isCellFlat(gridX - 1, gridZ, gridCols, gridRows);
        const rightNeighborFlat = this.isCellFlat(gridX + 1, gridZ, gridCols, gridRows);
        const topNeighborFlat = this.isCellFlat(gridX, gridZ - 1, gridCols, gridRows);
        const bottomNeighborFlat = this.isCellFlat(gridX, gridZ + 1, gridCols, gridRows);

        if (leftNeighborFlat && rightNeighborFlat && topNeighborFlat && bottomNeighborFlat) {
          const distFromCenter = Math.sqrt(cellCenterX * cellCenterX + cellCenterZ * cellCenterZ);
          let category = 'small';
          
          if (distFromCenter <= SKYSCRAPER_ZONE_RADIUS) {
            category = 'skyscraper';
          } else if (distFromCenter <= LARGE_BUILDING_ZONE_RADIUS) {
            category = 'large';
          }

          // Define building dimensions - these match the client-side dimensions
          const dimensionsByCategory = {
            small: { width: 10, height: 15, depth: 10 },
            large: { width: 15, height: 30, depth: 15 },
            skyscraper: { width: 20, height: 80, depth: 20 }
          };
          const dimensions = dimensionsByCategory[category];

          // Create building data with the same properties client uses
          buildings.push({
            position: { x: cellCenterX, y: terrainInfo.height, z: cellCenterZ },
            rotation: 0, // Buildings use identity quaternion (no rotation)
            scale: 10, // Buildings use standard scale 10
            width: dimensions.width,
            height: dimensions.height,
            depth: dimensions.depth,
            category
          });

          occupiedCells.add(cellKey);
          placedBuildingCount++;
        }
      }
    }

    console.log(`[Server-EnvGenerator] Generated ${buildings.length} buildings`);
    return { buildings };
  }

  /**
   * Helper method to check if a grid cell is within bounds and in 'FLAT' zone
   */
  isCellFlat(c, r, gridCols, gridRows) {
    if (c < 0 || c >= gridCols || r < 0 || r >= gridRows) {
      return false; // Out of bounds
    }
    const cellCenterX = (c - gridCols / 2 + 0.5) * GRID_CELL_SIZE;
    const cellCenterZ = (r - gridRows / 2 + 0.5) * GRID_CELL_SIZE;
    const terrainInfo = this.terrainGenerator.getTerrainInfo(cellCenterX, cellCenterZ);
    return terrainInfo.zone === 'FLAT';
  }
}

module.exports = EnvironmentGenerator;