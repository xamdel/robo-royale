  import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SceneManager } from './scene.js';
import { TerrainGenerator } from './terrainGenerator.js'; // Import TerrainGenerator
import { createNoise2D } from 'simplex-noise'; // For density noise

// Simple seeded pseudo-random number generator (Mulberry32) - Copied from TerrainGenerator
function mulberry32(seed) {
  return function() {
    var t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

// Helper to create a numeric seed from a string - Copied from TerrainGenerator
function createNumericSeed(str) {
  let seed = 0;
  for (let i = 0; i < str.length; i++) {
    seed = (seed * 31 + str.charCodeAt(i)) | 0; // Simple hash
  }
  return seed;
}


export const EnvironmentalObjectSystem = {
  models: {}, // To store loaded models { tree: model, rock: model } - Not used currently
  loader: new GLTFLoader(),
  // objectsInScene: [], // Removed - using InstancedMesh now
  treeInstances: null,
  rockInstances: null,
  densityNoise: null, // Will be initialized with seed
  // raycaster: new THREE.Raycaster(), // Removed - Reverting raycasting
  // downVector: new THREE.Vector3(0, -1, 0), // Removed - Reverting raycasting

  async init() {
    console.log('[EnvironmentalObjectSystem] Initializing...');

    // --- Seed Density Noise ---
    // Ensure TerrainGenerator has been initialized and has a seed
    if (!TerrainGenerator.isInitialized || !TerrainGenerator.mapSeed) {
        console.error("[EnvironmentalObjectSystem] TerrainGenerator not initialized or has no seed. Cannot seed density noise.");
        // Fallback to unseeded noise for now, or throw error?
        this.densityNoise = createNoise2D();
    } else {
        console.log(`[EnvironmentalObjectSystem] Seeding density noise using map seed: ${TerrainGenerator.mapSeed}`);
        const numericSeed = createNumericSeed(TerrainGenerator.mapSeed);
        const randomDensity = mulberry32(numericSeed + 2); // Use offset seed (+2)
        this.densityNoise = createNoise2D(randomDensity);
        console.log("[EnvironmentalObjectSystem] Density noise seeded.");
    }

    // Placeholder for loading models - adapt if using real models later
    // await this.loadModel('tree', 'assets/models/tree.glb');
    // await this.loadModel('rock', 'assets/models/rock.glb');
    console.log('[EnvironmentalObjectSystem] Models loaded (placeholder).');

    // --- Instanced Mesh Setup ---
    const maxTrees = 5000; // Estimate max number of trees
    const maxRocks = 2000; // Estimate max number of rocks

    // Define base geometries and materials (using placeholders)
    const treeGeometry = new THREE.ConeGeometry(0.4, 2.5, 5, 1); // Avg radius, height
    const treeMaterial = new THREE.MeshPhongMaterial({
        color: 0x228B22, // ForestGreen
        flatShading: true,
        shininess: 5
    });

    const rockGeometry = new THREE.IcosahedronGeometry(0.5, 0); // Avg radius
    const rockMaterial = new THREE.MeshPhongMaterial({
        color: 0x808080, // Gray
        flatShading: true,
        shininess: 5
    });

    // Create InstancedMesh
    this.treeInstances = new THREE.InstancedMesh(treeGeometry, treeMaterial, maxTrees);
    this.rockInstances = new THREE.InstancedMesh(rockGeometry, rockMaterial, maxRocks);

    // Enable shadows
    this.treeInstances.castShadow = true;
    this.treeInstances.receiveShadow = false; // Trees probably won't receive shadows from other small objects
    this.rockInstances.castShadow = true;
    this.rockInstances.receiveShadow = true;

    // Add to scene (will be populated in placeObjects)
    SceneManager.add(this.treeInstances);
    SceneManager.add(this.rockInstances);
    console.log('[EnvironmentalObjectSystem] InstancedMeshes created and added to scene.');

    this.placeObjects();
  },

  async loadModel(name, path) {
    // Keep this function for potential future use with GLB models
    // If using GLB, you'd extract the geometry/material for InstancedMesh
    return new Promise((resolve, reject) => {
      this.loader.load(path, (gltf) => {
        const model = gltf.scene;
        // ... (rest of the loading logic) ...
        this.models[name] = model; // Store base model if needed
        console.log(`[EnvironmentalObjectSystem] Loaded model: ${name}`);
        resolve(model);
      }, undefined, (error) => {
        console.error(`[EnvironmentalObjectSystem] Error loading model ${name}:`, error);
        reject(error);
      });
    });
  },

  placeObjects() {
    console.log('[EnvironmentalObjectSystem] Placing instanced objects based on terrain zones...');
    const terrainWidth = TerrainGenerator.generationParams.width;
    const terrainHeight = TerrainGenerator.generationParams.height;
    const placementGridStep = 5; // Check every 5 units for potential placement
    const densityNoiseScale = 0.03; // Scale for clumping noise
    const treeClumpThreshold = 0.4; // Noise value above which trees clump in hills
    const maxHillSlope = 1.5;       // Max slope for trees in hills
    const maxMountainSlope = 3.0;   // Increased: Max slope for objects in mountains
    const sparseMountainDensity = 0.1; // Increased: Chance to place an object in a valid mountain spot
    const absoluteSnowCapY = 45.0; // Use the actual threshold from TerrainGenerator
    const placementEmbedOffset = 0.05; // Small positive offset to slightly embed objects

    let treeIndex = 0;
    let rockIndex = 0;
    const matrix = new THREE.Matrix4(); // Reusable matrix for transformations
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (let x = -terrainWidth / 2; x < terrainWidth / 2; x += placementGridStep) {
      for (let z = -terrainHeight / 2; z < terrainHeight / 2; z += placementGridStep) {
        // Add some randomness to the exact position within the grid cell
        const jitterX = (Math.random() - 0.5) * placementGridStep;
        const jitterZ = (Math.random() - 0.5) * placementGridStep;
        const currentX = x + jitterX;
        const currentZ = z + jitterZ;

        // --- Get Terrain Info (Height is World Y) ---
        const terrainInfo = TerrainGenerator.getTerrainInfo(currentX, currentZ);
        // The height 'y' from getTerrainInfo already represents the world Y coordinate
        // due to how terrain generation applies height before rotation.
        const { height: terrainY, zone, slope } = terrainInfo;

        // --- DEBUG LOGGING ---
        const shouldLog = Math.abs(currentX) < 10 && Math.abs(currentZ) < 10; // Log near origin
        if (shouldLog) {
            console.log(`[EnvObjDebug] Coords: (${currentX.toFixed(2)}, ${currentZ.toFixed(2)})`);
            console.log(`  -> Terrain Info: Height=${terrainY.toFixed(2)}, Zone=${zone}, Slope=${slope.toFixed(2)}`);
        }
        // --- END DEBUG LOGGING ---


        // Basic placement conditions: above water level and not in FLAT zone
        if (terrainY < 0 || zone === 'FLAT') {
             if (shouldLog) console.log(`  -> Decision: Skip (Water or Flat)`);
             continue;
        }

        let placeTree = false;
        let placeRock = false;

        // --- Zone-Specific Logic ---
        if (zone === 'HILLS') {
          // Negate currentZ when sampling density noise to potentially fix mirroring
          const densityValue = (this.densityNoise(currentX * densityNoiseScale, -currentZ * densityNoiseScale) + 1) / 2; // Normalize to 0-1
          if (slope < maxHillSlope && densityValue > treeClumpThreshold) {
            // Higher chance within the clump threshold
            if (Math.random() < 0.8) { // 80% chance if conditions met
                 placeTree = true;
            }
          }
        } else if (zone === 'MOUNTAINS') {
          // Avoid steep slopes and absolute highest peaks (above snow line)
          if (slope < maxMountainSlope && terrainY < absoluteSnowCapY) {
            if (Math.random() < sparseMountainDensity) {
              // Randomly choose tree or rock in mountains
              if (Math.random() < 0.6) { // 60% tree, 40% rock
                placeTree = true;
              } else {
                placeRock = true;
              }
            }
          }
        }
        // No objects placed in FLAT zone in this configuration

        // --- DEBUG LOGGING ---
        if (shouldLog) {
            console.log(`  -> Decision: Place Tree=${placeTree}, Place Rock=${placeRock}`);
        }
        // --- END DEBUG LOGGING ---

        // --- Set Matrix for Placement ---
        if (placeTree && treeIndex < this.treeInstances.count) {
          const treeHeight = this.treeInstances.geometry.parameters.height;
          // Adjust Y: Place base at terrainY, accounting for cone origin and embed offset
          position.set(currentX, terrainY + treeHeight / 2 - placementEmbedOffset, currentZ);
          quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2); // Random Y rotation
          const randomScale = Math.random() * 0.4 + 0.8; // Scale 0.8 to 1.2
          scale.set(randomScale, randomScale, randomScale);

          matrix.compose(position, quaternion, scale);
          this.treeInstances.setMatrixAt(treeIndex++, matrix);

        } else if (placeRock && rockIndex < this.rockInstances.count) {
          const rockRadius = this.rockInstances.geometry.parameters.radius;
           // Adjust Y: Place base approx at terrainY, accounting for icosahedron origin and embed offset
          position.set(currentX, terrainY + rockRadius - placementEmbedOffset, currentZ);
          quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2); // Random Y rotation
          const randomScale = Math.random() * 0.5 + 0.7; // Scale 0.7 to 1.2
          scale.set(randomScale, randomScale, randomScale);

          matrix.compose(position, quaternion, scale);
          this.rockInstances.setMatrixAt(rockIndex++, matrix);
        }
      }
    }

    // Update InstancedMesh
    this.treeInstances.instanceMatrix.needsUpdate = true;
    this.rockInstances.instanceMatrix.needsUpdate = true;
    this.treeInstances.count = treeIndex; // Set the actual number of instances used
    this.rockInstances.count = rockIndex;

    console.log(`[EnvironmentalObjectSystem] Placed ${treeIndex} tree instances and ${rockIndex} rock instances.`);
  }
};
