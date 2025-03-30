/**
 * Server-side terrain generator that mirrors the essential functionality
 * of client-side TerrainGenerator without THREE.js dependencies
 */

const { createNoise2D, createNoise3D } = require('simplex-noise');

// Simple seeded pseudo-random number generator (Mulberry32)
function mulberry32(seed) {
  return function() {
    var t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Helper to create a numeric seed from a string
function createNumericSeed(str) {
  let seed = 0;
  for (let i = 0; i < str.length; i++) {
    seed = (seed * 31 + str.charCodeAt(i)) | 0; // Simple hash
  }
  return seed;
}

class TerrainGenerator {
  constructor() {
    this.isInitialized = false;
    this.mapSeed = null;
    this.generationParams = {
      width: 800,
      height: 800, // This is depth in world space
      heightScale: 30,
      noiseScale: 0.005,
      hillsNoiseScale: 0.01,
      mountainsNoiseScale: 0.008
    };

    // These will be initialized in init()
    this.noise2D = null;
    this.noise3D = null;
    this.random = null;
  }

  /**
   * Initialize the terrain generator with a seed
   * @param {string} seed - The seed string for deterministic generation
   */
  init(seed) {
    if (this.isInitialized) {
      console.warn("[Server-TerrainGenerator] Already initialized.");
      return this;
    }

    if (!seed) {
      seed = 'default_seed_' + Date.now();
      console.warn(`[Server-TerrainGenerator] No seed provided, using: ${seed}`);
    }

    this.mapSeed = seed;
    console.log(`[Server-TerrainGenerator] Initializing with seed: ${seed}`);

    // Create numeric seeds for different noise functions
    const baseSeed = createNumericSeed(seed);
    const noiseSeed = createNumericSeed(seed + '_noise');
    const noise3DSeed = createNumericSeed(seed + '_noise3d');
    
    // Initialize noise generators
    this.random = mulberry32(baseSeed);
    this.noise2D = createNoise2D(mulberry32(noiseSeed));
    this.noise3D = createNoise3D(mulberry32(noise3DSeed));
    
    this.isInitialized = true;
    return this;
  }

  /**
   * Get terrain information at a specific world position
   * @param {number} x - World X coordinate
   * @param {number} z - World Z coordinate
   * @returns {object} Object with height, normal, and zone data
   */
  getTerrainInfo(x, z) {
    if (!this.isInitialized) {
      console.error("[Server-TerrainGenerator] Not initialized. Call init() first.");
      return { height: 0, normal: { x: 0, y: 1, z: 0 }, slope: 0, zone: 'FLAT' };
    }

    // Normalize coordinates to [0,1] for noise sampling
    const nx = (x / this.generationParams.width) + 0.5;
    const nz = (z / this.generationParams.height) + 0.5;

    // Base elevation using 2D simplex noise
    let elevation = this.noise2D(
      nx * this.generationParams.noiseScale * 1000, 
      nz * this.generationParams.noiseScale * 1000
    );
    elevation = (elevation + 1) / 2; // Normalize to [0,1]

    // Add hills in a ring around the center
    const distFromCenter = Math.sqrt(x * x + z * z);
    const hillsDistMin = 100;
    const hillsDistMax = 300;
    
    // Hills zone
    if (distFromCenter > hillsDistMin && distFromCenter < hillsDistMax) {
      // How far into the hills zone (0 to 1)
      const hillsT = Math.min(1, (distFromCenter - hillsDistMin) / (hillsDistMax - hillsDistMin));
      
      // Hill intensity increases as you move outward, peaks at middle of zone
      const hillsIntensity = hillsT < 0.5 ? hillsT * 2 : (1 - hillsT) * 2;
      
      // Sample hills noise
      const hillsNoise = this.noise2D(
        nx * this.generationParams.hillsNoiseScale * 1000, 
        nz * this.generationParams.hillsNoiseScale * 1000
      );
      
      // Add hills contribution to base elevation
      elevation += (hillsNoise + 0.1) * hillsIntensity * 0.5;
    }
    
    // Mountains at the outer edge
    const mountainsDistMin = 300;
    const mountainsDistMax = 380;
    
    let zone = 'FLAT';
    
    if (distFromCenter > mountainsDistMin) {
      // How far into the mountains zone (0 to 1), capped at 1
      const mountainsT = Math.min(1, (distFromCenter - mountainsDistMin) / 
                                  (mountainsDistMax - mountainsDistMin));
      
      // Mountain intensity increases with distance from center
      const mountainIntensity = mountainsT;
      
      // Sample mountain noise
      const mountainNoise = this.noise2D(
        nx * this.generationParams.mountainsNoiseScale * 1000, 
        nz * this.generationParams.mountainsNoiseScale * 1000
      );
      
      // Add mountains contribution to elevation
      elevation += (mountainNoise + 0.5) * mountainIntensity * 1.5;
      
      // Set zone to mountains if we're in the mountains range and it's elevated
      if (mountainNoise * mountainIntensity > 0.1) {
        zone = 'MOUNTAINS';
      }
    }
    
    // Set zone based on distance from center and elevation
    if (zone !== 'MOUNTAINS') {
      if (distFromCenter > hillsDistMin && distFromCenter < hillsDistMax && elevation > 0.15) {
        zone = 'HILLS';
      } else {
        zone = 'FLAT';
      }
    }
    
    // Calculate final height by applying height scale
    const height = elevation * this.generationParams.heightScale;
    
    // Estimate slope by sampling nearby points (simplified for server)
    const sampleDist = 1.0; // Small distance for sampling
    const heightPosX = this.getHeightAt(x + sampleDist, z);
    const heightNegX = this.getHeightAt(x - sampleDist, z);
    const heightPosZ = this.getHeightAt(x, z + sampleDist);
    const heightNegZ = this.getHeightAt(x, z - sampleDist);
    
    // Calculate approximatee slope as maximum derivative in any direction
    const slopeX = Math.abs(heightPosX - heightNegX) / (2 * sampleDist);
    const slopeZ = Math.abs(heightPosZ - heightNegZ) / (2 * sampleDist);
    const slope = Math.max(slopeX, slopeZ);
    
    return {
      height,
      normal: { x: 0, y: 1, z: 0 }, // Simplified normal for server (not used for visuals)
      slope,
      zone
    };
  }
  
  /**
   * Get just the height at a specific position - helper for slope calculation
   */
  getHeightAt(x, z) {
    // Normalize coordinates to [0,1] for noise sampling
    const nx = (x / this.generationParams.width) + 0.5;
    const nz = (z / this.generationParams.height) + 0.5;

    // Base elevation using 2D simplex noise
    let elevation = this.noise2D(
      nx * this.generationParams.noiseScale * 1000, 
      nz * this.generationParams.noiseScale * 1000
    );
    elevation = (elevation + 1) / 2; // Normalize to [0,1]

    // Add hills and mountains - same logic as getTerrainInfo but simplified
    const distFromCenter = Math.sqrt(x * x + z * z);
    const hillsDistMin = 100;
    const hillsDistMax = 300;
    
    if (distFromCenter > hillsDistMin && distFromCenter < hillsDistMax) {
      const hillsT = Math.min(1, (distFromCenter - hillsDistMin) / (hillsDistMax - hillsDistMin));
      const hillsIntensity = hillsT < 0.5 ? hillsT * 2 : (1 - hillsT) * 2;
      const hillsNoise = this.noise2D(
        nx * this.generationParams.hillsNoiseScale * 1000, 
        nz * this.generationParams.hillsNoiseScale * 1000
      );
      elevation += (hillsNoise + 0.1) * hillsIntensity * 0.5;
    }
    
    const mountainsDistMin = 300;
    const mountainsDistMax = 380;
    
    if (distFromCenter > mountainsDistMin) {
      const mountainsT = Math.min(1, (distFromCenter - mountainsDistMin) / 
                                 (mountainsDistMax - mountainsDistMin));
      const mountainIntensity = mountainsT;
      const mountainNoise = this.noise2D(
        nx * this.generationParams.mountainsNoiseScale * 1000, 
        nz * this.generationParams.mountainsNoiseScale * 1000
      );
      elevation += (mountainNoise + 0.5) * mountainIntensity * 1.5;
    }
    
    return elevation * this.generationParams.heightScale;
  }
}

module.exports = new TerrainGenerator();