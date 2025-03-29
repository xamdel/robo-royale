import * as THREE from 'three';
import { TerrainGenerator } from './terrainGenerator.js'; // Assuming TerrainGenerator is initialized elsewhere
import { createNoise2D } from 'simplex-noise'; // Import noise for clumping

// Simple seeded pseudo-random number generator (Mulberry32) - Reuse from TerrainGenerator for consistency
function mulberry32(seed) {
  return function() {
    var t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

// Helper to create a numeric seed from a string - Reuse from TerrainGenerator
function createNumericSeed(str) {
  let seed = 0;
  for (let i = 0; i < str.length; i++) {
    seed = (seed * 31 + str.charCodeAt(i)) | 0; // Simple hash
  }
  return seed;
}


class EnvironmentalObjectSystem {
    constructor(scene, terrainGenerator) {
        this.scene = scene;
        this.terrainGenerator = terrainGenerator;
        this.instancedTrees = null;
        this.instancedRocks = null;
        this.isInitialized = false;
        this.noiseFunctions = { clumpNoise: null }; // Add noise functions storage

        // Use the same seed as the terrain for consistent placement
        if (!this.terrainGenerator.isInitialized || !this.terrainGenerator.mapSeed) {
            console.error("[EnvSystem] TerrainGenerator must be initialized with a seed first!");
            return; // Or handle error appropriately
        }
        const numericSeed = createNumericSeed(this.terrainGenerator.mapSeed + '_env'); // Use derived seed for general randomness
        const clumpSeed = createNumericSeed(this.terrainGenerator.mapSeed + '_clump'); // Separate seed for clumping noise
        this.random = mulberry32(numericSeed);
        this.noiseFunctions.clumpNoise = createNoise2D(mulberry32(clumpSeed)); // Initialize clump noise
        console.log(`[EnvSystem] Initialized with derived seeds for placement and clumping.`);
    }

    async initialize(config = {}) {
        if (this.isInitialized) {
            console.warn("[EnvSystem] Already initialized.");
            return;
        }

        const {
            // Removed model paths
            treeCount = 15000, // Significantly increased max instances
            rockCount = 5000, // Keep rock count the same for now
            hillsBaseTreeDensity = 0.05, // Doubled base density for hills
            hillsClumpThreshold = 0.4, // Keep threshold the same
            hillsClumpDensityMultiplier = 50.0, // Increased clump multiplier
            clumpNoiseScale = 0.03, // Keep scale the same
            mountainsTreeDensity = 0.2, // Doubled density
            mountainsRockDensity = 0.2, // Keep rock density the same
            placementGridSize = 8, // Keep grid size
            maxPlacementSlope = 0.5, // Maximum slope allowed for placement
            maxMountainObjectHeight = 20.0 // Max height for objects in mountains
        } = config;

        console.log("[EnvSystem] Initializing with placeholder geometry...");

        try {
            // 1. Create Placeholder Geometry and Materials
            // Tree (Cone)
            const treeHeight = 5; // Adjust size as needed
            const treeRadius = 1.5;
            const treeGeometry = new THREE.ConeGeometry(treeRadius, treeHeight, 6); // Low poly cone (6 radial segments)
            const treeMaterial = new THREE.MeshPhongMaterial({
                color: 0x228B22, // Forest Green
                flatShading: true,
                shininess: 0
            });
            console.log("[EnvSystem] Tree placeholder geometry created.");

            // Rock (Icosahedron)
            const rockRadius = 1.2;
            const rockGeometry = new THREE.IcosahedronGeometry(rockRadius, 0); // Detail level 0 for faceted look
            const rockMaterial = new THREE.MeshPhongMaterial({
                color: 0x888888, // Gray
                flatShading: true,
                shininess: 10
            });
            console.log("[EnvSystem] Rock placeholder geometry created.");


            // 2. Create Instanced Meshes
            this.instancedTrees = new THREE.InstancedMesh(treeGeometry, treeMaterial, treeCount);
            this.instancedRocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockCount);

            this.instancedTrees.castShadow = true;
            this.instancedTrees.receiveShadow = false; // Trees usually don't receive shadows on themselves significantly
            this.instancedRocks.castShadow = true;
            this.instancedRocks.receiveShadow = true;

            // 3. Placement Logic
            const terrainWidth = this.terrainGenerator.generationParams.width;
            const terrainHeight = this.terrainGenerator.generationParams.height; // This is depth in world space
            const halfWidth = terrainWidth / 2;
            const halfHeight = terrainHeight / 2;

            let treeInstanceIndex = 0;
            let rockInstanceIndex = 0;
            const dummy = new THREE.Object3D(); // Reusable object for matrix calculation
            const { clumpNoise } = this.noiseFunctions; // Get the noise function

            console.log(`[EnvSystem] Starting placement sampling (Grid: ${placementGridSize}x${placementGridSize})...`);

            for (let x = -halfWidth; x < halfWidth; x += placementGridSize) {
                for (let z = -halfHeight; z < halfHeight; z += placementGridSize) {
                    // Add some random offset within the grid cell to avoid perfect grid look
                    const sampleX = x + (this.random() - 0.5) * placementGridSize;
                    const sampleZ = z + (this.random() - 0.5) * placementGridSize;

                    const terrainInfo = this.terrainGenerator.getTerrainInfo(sampleX, sampleZ);

                    // Skip placement on very steep slopes
                    if (terrainInfo.slope > maxPlacementSlope) {
                        continue;
                    }

                    let placeTree = false;
                    let placeRock = false;
                    const currentHeight = terrainInfo.height; // Store height for checks

                    // --- Zone-based Placement ---
                    if (terrainInfo.zone === 'HILLS') {
                        const clumpValue = (clumpNoise(sampleX * clumpNoiseScale, sampleZ * clumpNoiseScale) + 1) / 2; // Normalize noise to 0-1
                        let currentHillsDensity = hillsBaseTreeDensity;
                        if (clumpValue > hillsClumpThreshold) {
                            // Significantly increase density in clump areas
                            currentHillsDensity *= hillsClumpDensityMultiplier * ((clumpValue - hillsClumpThreshold) / (1 - hillsClumpThreshold)); // Scale multiplier by how far into clump threshold
                        }

                        if (this.random() < currentHillsDensity && treeInstanceIndex < treeCount) {
                            placeTree = true;
                        }
                    } else if (terrainInfo.zone === 'MOUNTAINS') {
                        // Check height limit first
                        if (currentHeight < maxMountainObjectHeight) {
                            const rand = this.random();
                            if (rand < mountainsTreeDensity && treeInstanceIndex < treeCount) {
                                placeTree = true;
                            } else if (rand < mountainsTreeDensity + mountainsRockDensity && rockInstanceIndex < rockCount) {
                                // Check combined probability, but only place rock if tree wasn't placed
                                placeRock = true;
                            }
                        }
                    }

                    // --- Set Instance Matrix ---
                    if (placeTree) {
                        dummy.position.set(sampleX, currentHeight, sampleZ); // Use stored height
                        // Random rotation around Y axis
                        dummy.rotation.y = this.random() * Math.PI * 2;
                        // Random scale variation (optional)
                        const scale = 0.8 + this.random() * 0.4; // e.g., 0.8 to 1.2
                        dummy.scale.set(scale, scale, scale);
                        dummy.updateMatrix();
                        this.instancedTrees.setMatrixAt(treeInstanceIndex++, dummy.matrix);
                    } else if (placeRock) {
                        dummy.position.set(sampleX, currentHeight, sampleZ); // Use stored height
                        // Random rotation around Y axis
                        dummy.rotation.y = this.random() * Math.PI * 2;
                        // Random scale variation (optional)
                        const scale = 0.6 + this.random() * 0.8; // e.g., 0.6 to 1.4
                        dummy.scale.set(scale, scale, scale);
                        dummy.updateMatrix();
                        this.instancedRocks.setMatrixAt(rockInstanceIndex++, dummy.matrix);
                    }
                }
            }

            // Update instance counts
            this.instancedTrees.count = treeInstanceIndex;
            this.instancedRocks.count = rockInstanceIndex;

            // Mark matrices as needing update
            this.instancedTrees.instanceMatrix.needsUpdate = true;
            this.instancedRocks.instanceMatrix.needsUpdate = true;

            // 4. Add to Scene
            this.scene.add(this.instancedTrees);
            this.scene.add(this.instancedRocks);

            this.isInitialized = true;
            console.log(`[EnvSystem] Initialization complete. Placed ${treeInstanceIndex} trees and ${rockInstanceIndex} rocks.`);

        } catch (error) {
            console.error("[EnvSystem] Initialization failed:", error);
            // Clean up partially added objects?
            if (this.instancedTrees) this.scene.remove(this.instancedTrees);
            if (this.instancedRocks) this.scene.remove(this.instancedRocks);
            this.instancedTrees = null;
            this.instancedRocks = null;
        }
    }

    // Optional: Method to remove objects if needed
    dispose() {
        if (this.instancedTrees) {
            this.scene.remove(this.instancedTrees);
            this.instancedTrees.geometry.dispose();
            // Dispose material if it's unique to this system
            // this.instancedTrees.material.dispose();
        }
        if (this.instancedRocks) {
            this.scene.remove(this.instancedRocks);
            this.instancedRocks.geometry.dispose();
            // this.instancedRocks.material.dispose();
        }
        this.instancedTrees = null;
        this.instancedRocks = null;
        this.isInitialized = false;
        console.log("[EnvSystem] Disposed.");
    }
}

export { EnvironmentalObjectSystem };
