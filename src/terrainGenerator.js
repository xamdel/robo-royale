import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

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


export const TerrainGenerator = {
  isInitialized: false,
  mapSeed: null, // Will be set by the server
  noiseFunctions: { heightNoise: null, controlNoise: null },
  generationParams: {
    width: 0, height: 0, segments: 0, heightScale: 0, controlScale: 0,
    zones: {}, snowCapThreshold: 0, minMountainRawHeight: 0
  },
  terrainMesh: null, // Store the generated mesh

  // Initialize noise functions and parameters based on a seed
  initialize(
    mapSeed,
    heightScale = 0.015,
    controlScale = 0.0015
  ) {
    if (this.isInitialized) {
      console.warn("[TerrainGenerator] Already initialized. Ignoring subsequent initialization.");
      return;
    }
    if (mapSeed === null || mapSeed === undefined) {
        console.error("[TerrainGenerator] Initialization requires a valid mapSeed.");
        // Use a default seed for offline/testing? Or throw error?
        // For now, let's use a default to avoid breaking things immediately.
        mapSeed = 'default_seed';
        console.warn(`[TerrainGenerator] Using default seed: ${mapSeed}`);
    }

    console.log(`[TerrainGenerator] Initializing with seed: ${mapSeed}`);
    this.mapSeed = mapSeed;

    // Create a numeric seed from the mapSeed string
    const numericSeed = createNumericSeed(this.mapSeed);

    // Create seeded random number generators for noise functions
    const randomHeight = mulberry32(numericSeed); // Use base seed
    const randomControl = mulberry32(numericSeed + 1); // Slightly different seed for control

    // Create noise functions using the seeded random generators
    this.noiseFunctions = {
      heightNoise: createNoise2D(randomHeight),
      controlNoise: createNoise2D(randomControl)
    };

    // Store core parameters (zones defined below)
    this.generationParams = {
      ...this.generationParams, // Keep potential defaults like width/height if needed elsewhere
      heightScale,
      controlScale,
      zones: {}, // Will be populated below
      snowCapThreshold: 0,
      minMountainRawHeight: 0
    };

    // Define and store zones and thresholds
    const zones = {
      FLAT: { threshold: -0.3, amplitude: 0.5, stepSize: 2.0, baseColor: '#878787' },
      HILLS: { threshold: 0.4, amplitude: 6.0, stepSize: 1.5, baseColor: '#228B22' },
      MOUNTAINS: { amplitude: 42.0, stepSize: 2.0, baseColor: '#1B5E20' }
    };
    this.generationParams.zones = zones;
    this.generationParams.snowCapThreshold = 35.0;
    this.generationParams.minMountainRawHeight = 4.0;

    this.isInitialized = true;
    console.log("[TerrainGenerator] Initialization complete.");
  },

  // Generate the terrain mesh using the initialized parameters
  generateTerrainMesh(width = 600, height = 600, segments = 80) { // Removed debugZones flag
    if (!this.isInitialized) {
      console.error("[TerrainGenerator] Must initialize with a seed before generating mesh.");
      // Return a default flat plane or throw error?
      return new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: 0xff0000 })); // Error indicator
    }

    // Store/update dimensions used for this specific mesh generation
    this.generationParams.width = width;
    this.generationParams.height = height;
    this.generationParams.segments = segments;

    console.log(`[TerrainGenerator] Generating terrain mesh (${width}x${height}, ${segments} seg)...`);
    const geometry = new THREE.PlaneGeometry(width, height, segments, segments);

    // Use the PREVIOUSLY INITIALIZED noise functions and parameters
    const { heightNoise, controlNoise } = this.noiseFunctions;
    const { heightScale, controlScale, zones, snowCapThreshold, minMountainRawHeight } = this.generationParams;

    const colors = []; // Array to store vertex colors
    const color = new THREE.Color(); // Reusable color object

    // Define height-based color gradient stops
    const colorStops = [
      { height: 0.0, color: new THREE.Color('#808080') }, // Grey (Concrete Base)
      { height: 2.0, color: new THREE.Color('#228B22') }, // Dark Green (Start of Hills/Grass)
      { height: 5.0, color: new THREE.Color('#55AE3A') }, // Lighter Green
      { height: 15.0, color: new THREE.Color('#8B4513') }, // Brown (Lower Mountains/Hills)
      { height: 30.0, color: new THREE.Color('#A0A0A0') }, // Grey (Higher Mountains)
      { height: snowCapThreshold, color: new THREE.Color('#CCCCCC') }, // Just below snow
      { height: snowCapThreshold + 0.1, color: new THREE.Color('#FFFFFF') } // Snow Cap Start
    ];
    // Find min/max possible height for normalization (approximate)
    // Note: This is a simplification; true min/max depends on noise seed.
    // Using amplitude gives a reasonable range.
    const maxHeight = zones.MOUNTAINS.amplitude; // Max possible height approx
    const minHeight = 0; // Assuming min height is around 0

    // --- Mesh Generation Logic (using initialized parameters) ---
    const vertices = geometry.attributes.position.array;
    for (let i = 0; i <= segments; i++) {
      for (let j = 0; j <= segments; j++) {
        const index = (i * (segments + 1) + j) * 3;
        const x = vertices[index];
        const zPos = vertices[index + 1]; // Corresponds to Z in world space after rotation

        // Calculate height and zone using the consistent helper function
        const { height: quantizedHeight, zone: currentZone } = this.getQuantizedHeightAndZone(x, zPos); // Use helper

        vertices[index + 2] = quantizedHeight; // Apply height to vertex Z (becomes Y)

        // --- Enhanced Color Calculation based on Zone and Height ---
        if (currentZone === zones.FLAT) {
            // Force flat zones to be grey
            color.set('#808080'); // Concrete Grey
        } else {
            // Apply height gradient for Hills and Mountains
            let calculatedColor = colorStops[1].color; // Default to lowest non-flat color (Dark Green)
            for (let k = 1; k < colorStops.length - 1; k++) { // Start loop from index 1 (green)
              const lowerStop = colorStops[k];
              const upperStop = colorStops[k + 1];
              // Adjust height check to be relative to the start of non-flat terrain if needed,
              // but using absolute height should be fine here as flat zones are handled separately.
              if (quantizedHeight >= lowerStop.height && quantizedHeight < upperStop.height) {
                // Ensure denominator is not zero
                const heightRange = upperStop.height - lowerStop.height;
                const t = heightRange > 0 ? (quantizedHeight - lowerStop.height) / heightRange : 0;
                calculatedColor = lowerStop.color.clone().lerp(upperStop.color, t);
                break; // Found the correct range
              }
            }
            // Handle heights above the last stop (snow) - applies only to non-flat zones now
            if (quantizedHeight >= colorStops[colorStops.length - 1].height) {
              calculatedColor = colorStops[colorStops.length - 1].color; // Snow color
            }
             // Ensure hills start green even if low
            if (currentZone === zones.HILLS && quantizedHeight < colorStops[1].height) {
                 calculatedColor = colorStops[1].color; // Use dark green if below the first green stop in hills
            }

            color.copy(calculatedColor);
        }
        // --- End Enhanced Color Calculation ---

        colors.push(color.r, color.g, color.b);
      }
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals(); // Recompute normals after height changes for better lighting

    const material = new THREE.MeshPhongMaterial({
      vertexColors: true,
      flatShading: true,
      shininess: 0,
    });

    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.terrainMesh.rotation.x = -Math.PI / 2;
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.castShadow = true;

    console.log("[TerrainGenerator] Terrain mesh generated.");
    return this.terrainMesh;
  },

  // Helper function to get both quantized height and zone (used internally by generateTerrainMesh)
  getQuantizedHeightAndZone(x, z) {
    if (!this.noiseFunctions.heightNoise || !this.noiseFunctions.controlNoise) return { height: 0, zone: this.generationParams.zones.FLAT }; // Default to FLAT

    const { heightScale, controlScale, zones, minMountainRawHeight } = this.generationParams;
    const { heightNoise, controlNoise } = this.noiseFunctions;

    // Determine Zone
    const controlValue = controlNoise(x * controlScale, z * controlScale);
    let currentZone;
    if (controlValue <= zones.FLAT.threshold) currentZone = zones.FLAT;
    else if (controlValue < zones.HILLS.threshold) currentZone = zones.HILLS;
    else currentZone = zones.MOUNTAINS;

    // Calculate Height based on Zone
    const heightNoiseValue = heightNoise(x * heightScale, z * heightScale);
    let rawHeight = heightNoiseValue * currentZone.amplitude;
    if (currentZone === zones.MOUNTAINS) {
        rawHeight = Math.max(rawHeight, minMountainRawHeight);
    }
    const quantizedHeight = Math.round(rawHeight / currentZone.stepSize) * currentZone.stepSize;

    return { height: quantizedHeight, zone: currentZone };
  },

  // Helper function to get quantized height at any point (used by getTerrainInfo and slope calculation)
  getQuantizedHeight(worldX, worldZ) { // Renamed params for clarity
    if (!this.noiseFunctions.heightNoise || !this.noiseFunctions.controlNoise) return 0;

    const { heightScale, controlScale, zones, minMountainRawHeight } = this.generationParams;
    const { heightNoise, controlNoise } = this.noiseFunctions;

    // Transform world coordinates to original plane coordinates for noise sampling
    const planeX = worldX;
    const planeY = -worldZ; // The key transformation

    const controlValue = controlNoise(planeX * controlScale, planeY * controlScale); // Use transformed coords
    let currentZone;
    if (controlValue <= zones.FLAT.threshold) currentZone = zones.FLAT;
    else if (controlValue < zones.HILLS.threshold) currentZone = zones.HILLS;
    else currentZone = zones.MOUNTAINS;

    const heightNoiseValue = heightNoise(planeX * heightScale, planeY * heightScale); // Use transformed coords
    let rawHeight = heightNoiseValue * currentZone.amplitude;
    if (currentZone === zones.MOUNTAINS) {
        rawHeight = Math.max(rawHeight, minMountainRawHeight);
    }
    return Math.round(rawHeight / currentZone.stepSize) * currentZone.stepSize;
  },

  // Get terrain details (height, zone, slope) at world coordinates (x, z)
  getTerrainInfo(worldX, worldZ) { // Renamed params for clarity
    if (!this.noiseFunctions.heightNoise || !this.noiseFunctions.controlNoise) {
      console.warn("Terrain noise functions not initialized for getTerrainInfo.");
      return { height: 0, zone: 'FLAT', slope: 0 }; // Default values
    }

    const { controlScale, zones } = this.generationParams;
    const { controlNoise } = this.noiseFunctions;

    // Transform world coordinates to original plane coordinates for noise sampling
    const planeX = worldX;
    const planeY = -worldZ; // The key transformation

    // 1. Determine Zone using transformed coordinates
    const controlValue = controlNoise(planeX * controlScale, planeY * controlScale);
    let zoneName;
    if (controlValue <= zones.FLAT.threshold) {
      zoneName = 'FLAT';
    } else if (controlValue < zones.HILLS.threshold) {
      zoneName = 'HILLS';
    } else {
      zoneName = 'MOUNTAINS';
    }

    // 2. Calculate Height (using the helper which now handles transformation)
    const quantizedHeight = this.getQuantizedHeight(worldX, worldZ);

    // 3. Calculate Slope (approximate using finite differences)
    //    Pass world coordinates to getQuantizedHeight, it will handle the transformation internally.
    const delta = 0.5; // Small distance to sample neighbors
    const heightXPlus = this.getQuantizedHeight(worldX + delta, worldZ);
    const heightXMinus = this.getQuantizedHeight(worldX - delta, worldZ);
    const heightZPlus = this.getQuantizedHeight(worldX, worldZ + delta);
    const heightZMinus = this.getQuantizedHeight(worldX, worldZ - delta);

    // Calculate gradient components
    const slopeX = (heightXPlus - heightXMinus) / (2 * delta);
    const slopeZ = (heightZPlus - heightZMinus) / (2 * delta);

    // Slope is the magnitude of the gradient vector
    const slope = Math.sqrt(slopeX * slopeX + slopeZ * slopeZ);

    return { height: quantizedHeight, zone: zoneName, slope: slope };
  }
};
