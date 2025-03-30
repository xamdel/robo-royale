import * as THREE from 'three';

/**
 * Represents a cylinder collision shape.
 */
export class CylinderCollider {
    /**
     * @param {THREE.Vector3} position - Center of the cylinder base.
     * @param {number} radius - Radius of the cylinder.
     * @param {number} height - Height of the cylinder along the Y-axis.
     */
    constructor(position, radius, height) {
        this.position = position;
        this.radius = radius;
        this.height = height;
        this.type = 'cylinder';
        this.aabb = this._calculateAABB(); // Axis-Aligned Bounding Box for broad phase checks
    }

    _calculateAABB() {
        const halfHeight = this.height / 2;
        const min = new THREE.Vector3(
            this.position.x - this.radius,
            this.position.y, // Base of the cylinder
            this.position.z - this.radius
        );
        const max = new THREE.Vector3(
            this.position.x + this.radius,
            this.position.y + this.height, // Top of the cylinder
            this.position.z + this.radius
        );
        return new THREE.Box3(min, max);
    }

    /**
     * Checks collision with a point (simplified for player check).
     * @param {THREE.Vector3} point - The point to check.
     * @param {number} pointRadius - Optional radius around the point.
     * @returns {boolean} True if collision occurs.
     */
    checkCollision(point, pointRadius = 0) {
        // Basic AABB check first
        if (!this.aabb.containsPoint(point)) { // Use AABB for quick exit
             // More precise check needed if pointRadius > 0, but let's skip for now
             if (pointRadius === 0) return false;
        }

        // Check height
        if (point.y < this.position.y || point.y > this.position.y + this.height) {
            return false;
        }

        // Check horizontal distance (squared for efficiency)
        const dx = point.x - this.position.x;
        const dz = point.z - this.position.z;
        const distSq = dx * dx + dz * dz;
        const totalRadius = this.radius + pointRadius;

        return distSq <= totalRadius * totalRadius;
    }

    /**
     * Checks intersection with a ray.
     * @param {THREE.Ray} ray - The ray to test.
     * @param {number} maxDistance - Maximum distance to check.
     * @returns {object|null} Intersection point, distance, and normal, or null if no hit.
     */
    checkRayIntersection(ray, maxDistance) {
        // Placeholder for Ray-Cylinder intersection logic
        // This is mathematically complex, will implement later if needed or simplify
        console.warn("Ray-Cylinder intersection not yet implemented.");
        return null;
    }
}

/**
 * Represents a sphere collision shape.
 */
export class SphereCollider {
    /**
     * @param {THREE.Vector3} position - Center of the sphere.
     * @param {number} radius - Radius of the sphere.
     */
    constructor(position, radius) {
        this.position = position;
        this.radius = radius;
        this.type = 'sphere';
        this.aabb = this._calculateAABB();
    }

     _calculateAABB() {
        const min = new THREE.Vector3(
            this.position.x - this.radius,
            this.position.y - this.radius,
            this.position.z - this.radius
        );
        const max = new THREE.Vector3(
            this.position.x + this.radius,
            this.position.y + this.radius,
            this.position.z + this.radius
        );
        return new THREE.Box3(min, max);
    }


    /**
     * Checks collision with a point.
     * @param {THREE.Vector3} point - The point to check.
     * @param {number} pointRadius - Optional radius around the point.
     * @returns {boolean} True if collision occurs.
     */
    checkCollision(point, pointRadius = 0) {
         // Basic AABB check first
        if (!this.aabb.containsPoint(point)) {
             if (pointRadius === 0) return false;
             // A more robust AABB check considering pointRadius might be needed
        }

        const totalRadius = this.radius + pointRadius;
        return this.position.distanceToSquared(point) <= totalRadius * totalRadius;
    }

    /**
     * Checks intersection with a ray using THREE.Ray's intersectSphere.
     * @param {THREE.Ray} ray - The ray to test.
     * @param {number} maxDistance - Maximum distance to check.
     * @returns {object|null} Intersection point, distance, and normal, or null if no hit.
     */
    checkRayIntersection(ray, maxDistance) {
        const sphere = new THREE.Sphere(this.position, this.radius);
        const intersectionPoint = new THREE.Vector3();
        const hit = ray.intersectSphere(sphere, intersectionPoint);

        if (hit) {
            const distance = ray.origin.distanceTo(intersectionPoint);
            if (distance <= maxDistance) {
                const normal = intersectionPoint.clone().sub(this.position).normalize();
                return { point: intersectionPoint, distance: distance, normal: normal };
            }
        }
        return null;
    }
}

/**
 * Represents an Axis-Aligned Bounding Box (AABB) collision shape initially.
 * Can be extended for Oriented Bounding Boxes (OBB) if needed.
 */
export class BoxCollider {
    /**
     * @param {THREE.Vector3} position - Center of the box.
     * @param {number} width - Width along X-axis.
     * @param {number} height - Height along Y-axis.
     * @param {number} depth - Depth along Z-axis.
     * @param {THREE.Quaternion} [quaternion] - Optional rotation (for OBB). If not provided, it's AABB.
     */
    constructor(position, width, height, depth, quaternion) {
        this.position = position; // Center
        this.width = width;
        this.height = height;
        this.depth = depth;
        this.quaternion = quaternion || new THREE.Quaternion(); // Identity if not provided (AABB)
        this.isOBB = !this.quaternion.equals(new THREE.Quaternion()); // Check if it's rotated
        this.type = 'box';

        // Calculate AABB corners based on center and dimensions
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const halfDepth = depth / 2;
        const min = new THREE.Vector3(
            position.x - halfWidth,
            position.y - halfHeight,
            position.z - halfDepth
        );
        const max = new THREE.Vector3(
            position.x + halfWidth,
            position.y + halfHeight,
            position.z + halfDepth
        );
        // Store the THREE.Box3 representation as aabb
        this.aabb = new THREE.Box3(min, max);

        // If OBB, we might need additional properties like axes, vertices in world space
        if (this.isOBB) {
            // TODO: Precompute OBB properties if needed for complex checks
        }
    }

    /**
     * Checks collision with a point. Currently uses AABB check.
     * @param {THREE.Vector3} point - The point to check.
     * @param {number} pointRadius - Optional radius around the point (makes it sphere vs box).
     * @returns {boolean} True if collision occurs.
     */
    checkCollision(point, pointRadius = 0) {
        if (this.isOBB) {
            // OBB vs Point/Sphere collision is more complex
            console.warn("OBB collision check not fully implemented, using AABB.");
            // Fallback to AABB check for now
        }

        if (pointRadius > 0) {
            // Sphere vs AABB check
            return this.aabb.intersectsSphere(new THREE.Sphere(point, pointRadius));
        } else {
            // Point vs AABB check
            return this.aabb.containsPoint(point);
        }
    }

    /**
     * Checks intersection with a ray using THREE.Ray's intersectBox.
     * @param {THREE.Ray} ray - The ray to test.
     * @param {number} maxDistance - Maximum distance to check.
     * @returns {object|null} Intersection point, distance, and normal, or null if no hit.
     */
    checkRayIntersection(ray, maxDistance) {
         if (this.isOBB) {
            // Ray vs OBB intersection is more complex
            console.warn("Ray-OBB intersection not yet implemented, using AABB.");
            // Fallback to AABB check for now
        }

        const intersectionPoint = new THREE.Vector3();
        const hit = ray.intersectBox(this.aabb, intersectionPoint); // Use aabb here

        if (hit) {
            const distance = ray.origin.distanceTo(intersectionPoint);
            if (distance <= maxDistance) {
                // Calculate normal based on which face was hit (approximate for AABB)
                const boxCenter = new THREE.Vector3();
                this.aabb.getCenter(boxCenter); // Use aabb here
                const hitRelativeToCenter = intersectionPoint.clone().sub(boxCenter);
                const absRelative = hitRelativeToCenter.clone().abs();

                let normal = new THREE.Vector3();
                if (absRelative.x > absRelative.y && absRelative.x > absRelative.z) {
                    normal.set(Math.sign(hitRelativeToCenter.x), 0, 0);
                } else if (absRelative.y > absRelative.z) {
                    normal.set(0, Math.sign(hitRelativeToCenter.y), 0);
                } else {
                    normal.set(0, 0, Math.sign(hitRelativeToCenter.z));
                }

                return { point: intersectionPoint, distance: distance, normal: normal };
            }
        }
        return null;
    }
}
