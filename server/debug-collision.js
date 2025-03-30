/**
 * Debug script to test server-side collisions in isolation
 */
const { ServerCollisionSystem, Vec3 } = require('./game/server-collision');
const terrainGenerator = require('./environment/terrain-generator');
const EnvironmentGenerator = require('./environment/environment-generator');

// Create a simple mocked player controller to simulate movement
const createMockPlayer = (id, x, z) => {
    return {
        id,
        position: { x, y: 2, z },
        radius: 1.0,
        move: function(newX, newZ) {
            console.log(`Player ${this.id} attempting to move from (${this.position.x}, ${this.position.z}) to (${newX}, ${newZ})`);
            
            // Create Vec3 objects for collision check
            const currentPos = new Vec3(this.position.x, this.position.y, this.position.z);
            const desiredPos = new Vec3(newX, this.position.y, newZ);
            
            // Check for collisions
            const collisions = collisionSystem.checkPlayerCollision(desiredPos, this.radius);
            
            if (collisions.length > 0) {
                console.log(`Found ${collisions.length} collisions`);
                collisions.forEach((col, idx) => {
                    console.log(`  Collision ${idx + 1}: ${col.objectType} at (${col.colliderData.position.x.toFixed(2)}, ${col.colliderData.position.z.toFixed(2)})`);
                });
                
                // Resolve collisions
                const originalDesired = desiredPos.clone();
                collisionSystem.resolvePlayerCollision(currentPos, desiredPos, this.radius, collisions);
                
                console.log(`Movement resolved: (${newX}, ${newZ}) -> (${desiredPos.x.toFixed(2)}, ${desiredPos.z.toFixed(2)})`);
                
                // Update position with resolved position
                this.position.x = desiredPos.x;
                this.position.z = desiredPos.z;
            } else {
                // No collisions, allow movement
                console.log(`No collisions, movement allowed`);
                this.position.x = newX;
                this.position.z = newZ;
            }
            
            return { position: this.position, hadCollision: collisions.length > 0 };
        }
    };
};

// Initialize terrain and environment generator
console.log("Initializing terrain generator...");
const mapSeed = "test_debug_seed";
terrainGenerator.init(mapSeed);
terrainGenerator.generationParams.width = 800;
terrainGenerator.generationParams.height = 800;

// Initialize environment generator
console.log("Initializing environment generator...");
const envGenerator = new EnvironmentGenerator(terrainGenerator);

// Generate trees and buildings
console.log("Generating environment objects...");
const { trees, rocks } = envGenerator.generateEnvironmentalObjects();
const { buildings } = envGenerator.generateBuildings();

console.log(`Generated ${trees.length} trees, ${rocks.length} rocks, and ${buildings.length} buildings`);

// Initialize collision system
console.log("Initializing collision system...");
const collisionSystem = new ServerCollisionSystem(
    terrainGenerator.generationParams.width,
    terrainGenerator.generationParams.height,
    40 // cell size
);

// Register colliders
console.log("Registering colliders...");
let treeCount = 0;
let rockCount = 0;
let buildingCount = 0;

// Register trees
for (const tree of trees) {
    collisionSystem.registerCollider({
        position: tree.position,
        radius: tree.radius,
        height: tree.height
    }, 'tree');
    treeCount++;
}

// Register rocks
for (const rock of rocks) {
    collisionSystem.registerCollider({
        position: rock.position,
        radius: rock.radius
    }, 'rock');
    rockCount++;
}

// Register buildings
for (const building of buildings) {
    collisionSystem.registerCollider({
        position: building.position,
        width: building.width,
        height: building.height,
        depth: building.depth
    }, 'building');
    buildingCount++;
}

console.log(`Registered ${treeCount} trees, ${rockCount} rocks, and ${buildingCount} buildings with collision system`);

// Create a direct test tree at a known position
console.log("Creating test objects at fixed positions...");

// Create a test object away from origin to avoid spawn point issues
const testTreePosition = { x: 10, y: 0, z: 10 };
const testTreeRadius = 2.0;
const testTreeHeight = 8.0;

// Register the test tree with the collision system
const testTreeId = collisionSystem.registerCollider({
    position: testTreePosition,
    radius: testTreeRadius,
    height: testTreeHeight
}, 'tree');

console.log(`Created test tree at (${testTreePosition.x}, ${testTreePosition.z}) with radius ${testTreeRadius}`);

// Create test player starting 10 units away from the tree
const startX = -10;
const startZ = 0;
const player = createMockPlayer("test1", startX, startZ);

console.log(`Created test player at (${startX}, ${startZ})`);

// Move player close to target object
console.log("\n--- APPROACHING TARGET ---");

// Place player at starting position
player.position.x = startX;
player.position.z = startZ;
console.log(`Positioned player at (${player.position.x.toFixed(2)}, ${player.position.z.toFixed(2)})`);

// Test series of movements toward the tree at origin
console.log("\n--- MOVEMENT TESTS ---");

// Move in 1-unit steps toward and through the tree at origin
const steps = 15; // Move from -10 to +5 (through the tree at 0)

// Attempt to move through the object step by step
for (let i = 1; i <= steps; i++) {
    const nextX = startX + i;
    const nextZ = 0; // Stay on the same Z-axis
    
    console.log(`\nStep ${i} of ${steps}: Moving to (${nextX}, ${nextZ})`);
    const result = player.move(nextX, nextZ);
    
    if (result.hadCollision) {
        console.log(`COLLISION DETECTED - Player position after collision resolution: (${result.position.x.toFixed(2)}, ${result.position.z.toFixed(2)})`);
    } else {
        console.log(`Movement completed - Player position: (${result.position.x.toFixed(2)}, ${result.position.z.toFixed(2)})`);
    }
}

// Try a direct collision test
console.log("\n--- DIRECT COLLISION TEST ---");
const testPosition = new Vec3(0, 2, 0); // Directly at the tree position
const playerRadius = 1.0;

console.log(`Testing position (${testPosition.x}, ${testPosition.y}, ${testPosition.z}) with radius ${playerRadius}`);
const collisions = collisionSystem.checkPlayerCollision(testPosition, playerRadius);

console.log(`Direct test result: Found ${collisions.length} collisions`);
if (collisions.length > 0) {
    collisions.forEach((col, idx) => {
        console.log(`  Collision ${idx + 1}: ${col.objectType} at (${col.colliderData.position.x.toFixed(2)}, ${col.colliderData.position.y.toFixed(2)}, ${col.colliderData.position.z.toFixed(2)})`);
        
        // Print specific details about the collider
        const collider = col.colliderData;
        if (col.objectType === 'tree') {
            console.log(`  Tree details: Radius=${collider.radius}, Height=${collider.height}`);
        } else if (col.objectType === 'building') {
            console.log(`  Building details: Width=${collider.width}, Height=${collider.height}, Depth=${collider.depth}`);
        }
    });
}

console.log("\nTest completed");