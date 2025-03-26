const fs = require('fs').promises;
const path = require('path');

// Simple Vector3 class for server-side math
class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    clone() {
        return new Vector3(this.x, this.y, this.z);
    }

    copy(v) {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;
        return this;
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

    multiplyScalar(scalar) {
        this.x *= scalar;
        this.y *= scalar;
        this.z *= scalar;
        return this;
    }

    cross(v) {
        const x = this.y * v.z - this.z * v.y;
        const y = this.z * v.x - this.x * v.z;
        const z = this.x * v.y - this.y * v.x;
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    }

    dot(v) {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }

    lengthSq() {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    length() {
        return Math.sqrt(this.lengthSq());
    }

    normalize() {
        const length = this.length();
        if (length > 0) {
            this.multiplyScalar(1 / length);
        }
        return this;
    }

    distanceTo(v) {
        return Math.sqrt(this.distanceToSquared(v));
    }

    distanceToSquared(v) {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        const dz = this.z - v.z;
        return dx * dx + dy * dy + dz * dz;
    }
}

// Placeholder constants - adjust as needed
const PLAYER_HEIGHT = 1.8; // Assumed player height
const PLAYER_RADIUS = 0.5; // Assumed player radius
const GROUND_CHECK_DISTANCE = 200.0; // Increased significantly to handle initial drop
const WALL_CHECK_OFFSET = 0.1; // Small offset to avoid starting ray inside geometry
const STEP_HEIGHT = 0.4; // How high the player can step up
// Removed DEBUG_Y_OFFSET

class CollisionService {
    constructor() {
        this.vertices = null;
        this.indices = null;
        this.isInitialized = false;
    }

    async initialize() {
        try {
            const filePath = path.join(__dirname, '..', 'assets', 'world-collision.json');
            const data = await fs.readFile(filePath, 'utf8');
            const collisionData = JSON.parse(data);

            this.vertices = collisionData.vertices;
            this.indices = collisionData.indices;
            this.isInitialized = true;

            // Debug: Log information about the loaded collision data
            console.log('Collision data loaded successfully:'); // Removed "(after offset)"
            console.log(` - Vertices: ${this.vertices.length / 3}`);
            console.log(` - Triangles: ${this.indices.length / 3}`);

            // Debug: Calculate bounding box from vertices
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

            for (let i = 0; i < this.vertices.length; i += 3) {
              const x = this.vertices[i];
              const y = this.vertices[i+1];
              const z = this.vertices[i+2];

              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              minZ = Math.min(minZ, z);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
              maxZ = Math.max(maxZ, z);
            }

            console.log(' - Bounds:',
              { min: {x: minX, y: minY, z: minZ},
                max: {x: maxX, y: maxY, z: maxZ},
                size: {
                  x: maxX - minX,
                  y: maxY - minY,
                  z: maxZ - minZ
                }
              }
            );

            return true;
        } catch (error) {
            console.error('Failed to load collision data for CollisionService:', error);
            this.isInitialized = false;
            return false;
        }
    }

    getTriangleVertices(index) {
        const i0 = this.indices[index * 3];
        const i1 = this.indices[index * 3 + 1];
        const i2 = this.indices[index * 3 + 2];

        return [
            new Vector3(this.vertices[i0 * 3], this.vertices[i0 * 3 + 1], this.vertices[i0 * 3 + 2]),
            new Vector3(this.vertices[i1 * 3], this.vertices[i1 * 3 + 1], this.vertices[i1 * 3 + 2]),
            new Vector3(this.vertices[i2 * 3], this.vertices[i2 * 3 + 1], this.vertices[i2 * 3 + 2])
        ];
    }

    // Moller-Trumbore ray-triangle intersection algorithm
    rayIntersectsTriangle(rayOrigin, rayDir, v0, v1, v2) {
        const EPSILON = 0.000001;
        const edge1 = new Vector3().copy(v1).sub(v0);
        const edge2 = new Vector3().copy(v2).sub(v0);
        const h = new Vector3().copy(rayDir).cross(edge2);
        const a = edge1.dot(h);

        if (a > -EPSILON && a < EPSILON) {
            return null; // Ray is parallel to the triangle
        }

        const f = 1.0 / a;
        const s = new Vector3().copy(rayOrigin).sub(v0);
        const u = f * s.dot(h);

        if (u < 0.0 || u > 1.0) {
            return null;
        }

        const q = s.cross(edge1);
        const v = f * rayDir.dot(q);

        if (v < 0.0 || u + v > 1.0) {
            return null;
        }

        // At this stage, we can compute t to find out where the intersection point is on the line.
        const t = f * edge2.dot(q);

        if (t > EPSILON) { // Ray intersection
            const intersectionPoint = new Vector3().copy(rayDir).multiplyScalar(t).add(rayOrigin);
            // Calculate normal (assuming counter-clockwise vertex order)
            const normal = new Vector3().copy(edge1).cross(edge2).normalize();
            return { distance: t, point: intersectionPoint, normal: normal };
        } else { // This means that there is a line intersection but not a ray intersection.
            return null;
        }
    }

    performRaycast(rayOrigin, rayDir, maxDistance) {
        if (!this.isInitialized) return null;

        // Debug: Log ray information
        console.log(`Server raycast: Origin(${rayOrigin.x.toFixed(4)}, ${rayOrigin.y.toFixed(4)}, ${rayOrigin.z.toFixed(4)}), Dir(${rayDir.x.toFixed(2)}, ${rayDir.y.toFixed(2)}, ${rayDir.z.toFixed(2)}), MaxDist: ${maxDistance}`);

        let closestHit = null;
        const numTriangles = this.indices.length / 3;
        let trianglesChecked = 0;

        // WARNING: Iterating through all triangles is slow for large meshes.
        // A BVH (Bounding Volume Hierarchy) is needed for performance.
        for (let i = 0; i < numTriangles; i++) {
            trianglesChecked++;
            const [v0, v1, v2] = this.getTriangleVertices(i);
            const hit = this.rayIntersectsTriangle(rayOrigin, rayDir, v0, v1, v2);

            if (hit && hit.distance <= maxDistance) {
                if (!closestHit || hit.distance < closestHit.distance) {
                    closestHit = hit;
                }
            }
        }

        // Debug: Log raycast results
        if (closestHit) {
          console.log(`Ground found at distance ${closestHit.distance.toFixed(4)}, point(${closestHit.point.x.toFixed(4)}, ${closestHit.point.y.toFixed(4)}, ${closestHit.point.z.toFixed(4)})`);
        } else {
          console.log(`No ground found after checking ${trianglesChecked} triangles`);

          // Debug: Log a few triangles from the mesh to verify data
          if (trianglesChecked > 0) {
            console.log('Sample triangles:');
            for (let i = 0; i < Math.min(3, numTriangles); i++) {
              const [v0, v1, v2] = this.getTriangleVertices(i);
              console.log(`Triangle ${i}: [${v0.x.toFixed(2)},${v0.y.toFixed(2)},${v0.z.toFixed(2)}], [${v1.x.toFixed(2)},${v1.y.toFixed(2)},${v1.z.toFixed(2)}], [${v2.x.toFixed(2)},${v2.y.toFixed(2)},${v2.z.toFixed(2)}]`);
            }
          }
        }

        return closestHit;
    }

    checkMovement(currentPosVec, desiredPosVec) {
        if (!this.isInitialized) {
            // If collision data isn't loaded, allow movement but log error
            console.error("CollisionService not initialized, allowing movement.");
            return { isValid: true, correctedPos: desiredPosVec };
        }

        const currentPos = new Vector3(currentPosVec.x, currentPosVec.y, currentPosVec.z);
        const desiredPos = new Vector3(desiredPosVec.x, desiredPosVec.y, desiredPosVec.z);
        let correctedPos = desiredPos.clone();
        let isValid = true;

        // Debug log current and desired positions
        console.log(`Movement check: current(${currentPos.x.toFixed(4)}, ${currentPos.y.toFixed(4)}, ${currentPos.z.toFixed(4)}), desired(${desiredPos.x.toFixed(4)}, ${desiredPos.y.toFixed(4)}, ${desiredPos.z.toFixed(4)})`);

        // --- Ground Check ---
        const groundRayOrigin = desiredPos.clone();
        // Try a higher starting point for the ray
        groundRayOrigin.y += PLAYER_HEIGHT + 0.5; // Start from higher above
        console.log(`Ground ray starting at y=${groundRayOrigin.y.toFixed(4)} (${PLAYER_HEIGHT + 0.5} above desired y=${desiredPos.y.toFixed(4)})`);

        const groundRayDir = new Vector3(0, -1, 0);
        const groundHit = this.performRaycast(groundRayOrigin, groundRayDir, GROUND_CHECK_DISTANCE);

        let currentGroundY = -Infinity; // Find ground below current pos for step check
        const currentGroundRayOrigin = currentPos.clone();
        currentGroundRayOrigin.y += 0.1;
        const currentGroundHit = this.performRaycast(currentGroundRayOrigin, groundRayDir, GROUND_CHECK_DISTANCE);
        if (currentGroundHit) {
            currentGroundY = currentGroundHit.point.y;
        }


        if (groundHit) {
            const heightDiff = groundHit.point.y - currentGroundY;
            if (heightDiff > STEP_HEIGHT) {
                 // Trying to step up too high
                 isValid = false;
                  // Stay at current horizontal position, adjusted to current ground height
                  correctedPos.x = currentPos.x;
                  correctedPos.z = currentPos.z;
                  // Assume origin is at feet
                  correctedPos.y = currentGroundY;
             } else {
                  // Valid ground found, adjust Y position
                  // Assume origin is at feet
                  correctedPos.y = groundHit.point.y;
             }
         } else {
            // No ground found below - potentially falling? Or invalid move?
            // For simplicity now, let's invalidate the move if no ground is near
            // A more robust solution would handle falling state.
            console.warn(`No ground found below desired pos: ${desiredPos.x}, ${desiredPos.y}, ${desiredPos.z}`);
            isValid = false;
            correctedPos = currentPos.clone(); // Revert to current position
        }

        // --- Wall Check (only if ground check was initially valid) ---
        if (isValid) {
            const moveVec = new Vector3().copy(correctedPos).sub(currentPos);
            moveVec.y = 0; // Horizontal movement only
            const moveDist = moveVec.length();

            if (moveDist > 0.01) { // Only check if there's horizontal movement
                const moveDir = moveVec.normalize();
                // Ray starts slightly offset from center and slightly above ground
                const wallRayOrigin = currentPos.clone();
                wallRayOrigin.y = correctedPos.y; // Use the potentially adjusted Y
                wallRayOrigin.add(moveDir.clone().multiplyScalar(WALL_CHECK_OFFSET)); // Offset slightly

                const wallHit = this.performRaycast(wallRayOrigin, moveDir, moveDist + WALL_CHECK_OFFSET);

                if (wallHit && wallHit.distance <= moveDist) {
                    // Hit a wall! Stop just before it.
                    // Simple stop - no sliding implemented here.
                    correctedPos = wallRayOrigin.add(moveDir.multiplyScalar(wallHit.distance - WALL_CHECK_OFFSET * 1.1)); // Move up to just before hit
                     // Keep the Y position determined by ground check
                     // Assume origin is at feet
                     correctedPos.y = groundHit ? groundHit.point.y : currentPos.y;
                     // Optionally set isValid = false if you want to completely block movement on collision
                     // isValid = false;
                }
            }
        }


        return {
            isValid: isValid,
            // Return corrected position as a plain object
            correctedPos: { x: correctedPos.x, y: correctedPos.y, z: correctedPos.z }
        };
    }
}

// Singleton instance
const collisionServiceInstance = new CollisionService();

module.exports = collisionServiceInstance;
