/**
 * Debug script to verify environment generator and collision system
 */
const terrainGenerator = require('./terrain-generator');
const EnvironmentGenerator = require('./environment-generator');
const { ServerCollisionSystem, Vec3 } = require('../game/server-collision');

// Initialize system with a fixed seed
const mapSeed = "test_seed_debug";
console.log(`Initializing debug environment with seed: ${mapSeed}`);

// Initialize terrain generator with fixed dimensions
terrainGenerator.init(mapSeed);
terrainGenerator.generationParams.width = 800;
terrainGenerator.generationParams.height = 800;

// Initialize environment generator
const envGenerator = new EnvironmentGenerator(terrainGenerator);

// Generate environmental objects
const { trees, rocks } = envGenerator.generateEnvironmentalObjects();
const { buildings } = envGenerator.generateBuildings();

console.log(`Generated ${trees.length} trees, ${rocks.length} rocks, and ${buildings.length} buildings`);

// Initialize collision system
const collisionSystem = new ServerCollisionSystem(
  terrainGenerator.generationParams.width,
  terrainGenerator.generationParams.height,
  40 // cell size
);

// Register objects with collision system
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

// Test collision detection at different points
function testCollision(x, z, y = 2) {
  const playerPosition = new Vec3(x, y, z);
  const playerRadius = 1.0;
  const collisions = collisionSystem.checkPlayerCollision(playerPosition, playerRadius);
  
  console.log(`Collision test at (${x}, ${y}, ${z}):`);
  if (collisions.length === 0) {
    console.log('  No collisions detected');
  } else {
    console.log(`  Found ${collisions.length} collisions:`);
    collisions.forEach((col, index) => {
      console.log(`  ${index + 1}. ${col.objectType} at (${col.colliderData.position.x.toFixed(1)}, ${col.colliderData.position.y.toFixed(1)}, ${col.colliderData.position.z.toFixed(1)})`);
    });
  }
  return collisions;
}

// Test several locations
console.log('\n--- COLLISION TESTS ---');
testCollision(0, 0);  // Center of map
testCollision(100, 100);  // Quadrant 1
testCollision(-100, 100);  // Quadrant 2
testCollision(-100, -100);  // Quadrant 3
testCollision(100, -100);  // Quadrant 4

// Test collision resolution
console.log('\n--- COLLISION RESOLUTION TESTS ---');
function testResolution(startX, startZ, endX, endZ) {
  const startPos = new Vec3(startX, 2, startZ);
  const endPos = new Vec3(endX, 2, endZ);
  const playerRadius = 1.0;
  
  // Check if there would be a collision at end position
  const collisions = collisionSystem.checkPlayerCollision(endPos, playerRadius);
  
  console.log(`Movement test from (${startX}, ${startZ}) to (${endX}, ${endZ}):`);
  if (collisions.length === 0) {
    console.log('  No collision at end position, movement allowed');
    return endPos;
  }
  
  // Resolve collision
  const resolvedPos = endPos.clone();
  collisionSystem.resolvePlayerCollision(startPos, resolvedPos, playerRadius, collisions);
  
  console.log(`  Collision detected, resolved to (${resolvedPos.x.toFixed(1)}, ${resolvedPos.z.toFixed(1)})`);
  return resolvedPos;
}

// Find a nearby tree or building to test resolution
if (trees.length > 0) {
  const tree = trees[0];
  console.log(`Testing collision resolution with tree at (${tree.position.x.toFixed(1)}, ${tree.position.z.toFixed(1)})`);
  
  // Test approaching from different directions
  testResolution(tree.position.x - 10, tree.position.z, tree.position.x - 2, tree.position.z); // From left
  testResolution(tree.position.x + 10, tree.position.z, tree.position.x + 2, tree.position.z); // From right
  testResolution(tree.position.x, tree.position.z - 10, tree.position.x, tree.position.z - 2); // From below
  testResolution(tree.position.x, tree.position.z + 10, tree.position.x, tree.position.z + 2); // From above
}

if (buildings.length > 0) {
  const building = buildings[0];
  console.log(`Testing collision resolution with building at (${building.position.x.toFixed(1)}, ${building.position.z.toFixed(1)})`);
  
  // Test approaching from different directions
  testResolution(building.position.x - 20, building.position.z, building.position.x - 5, building.position.z); // From left
  testResolution(building.position.x + 20, building.position.z, building.position.x + 5, building.position.z); // From right
  testResolution(building.position.x, building.position.z - 20, building.position.x, building.position.z - 5); // From below
  testResolution(building.position.x, building.position.z + 20, building.position.x, building.position.z + 5); // From above
}

console.log('Debug tests complete');