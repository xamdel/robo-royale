import * as THREE from 'three';

export class GPUParticleSystem extends THREE.Points {
    static async create(options = {}) {
        const {
            maxParticles = 1000,
            particleSize = 0.1,
            blending = THREE.AdditiveBlending,
            vertexShaderPath = '/src/shaders/explosion.vert',
            fragmentShaderPath = '/src/shaders/explosion.frag'
        } = options;

        // Load shaders first
        const [vertexShader, fragmentShader] = await Promise.all([
            fetch(vertexShaderPath).then(r => r.text()),
            fetch(fragmentShaderPath).then(r => r.text())
        ]);

        // Create geometry with particle attributes
        const geometry = new THREE.BufferGeometry();
        
        // Arrays to store particle data
        const positions = new Float32Array(maxParticles * 3);
        const velocities = new Float32Array(maxParticles * 3);
        const startTimes = new Float32Array(maxParticles);
        const lifetimes = new Float32Array(maxParticles);
        const indices = new Float32Array(maxParticles);

        // Initialize arrays
        for (let i = 0; i < maxParticles; i++) {
            indices[i] = i;
            startTimes[i] = -1; // Inactive particle
            lifetimes[i] = 1.0; // Default lifetime
        }

        // Add attributes to geometry
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        geometry.setAttribute('startTime', new THREE.BufferAttribute(startTimes, 1));
        geometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
        geometry.setAttribute('particleIndex', new THREE.BufferAttribute(indices, 1));

        // Create material with loaded shaders
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                size: { value: particleSize },
                origin: { value: new THREE.Vector3() },
                color: { value: new THREE.Color(0xffffff) }
            },
            vertexShader,
            fragmentShader,
            blending,
            transparent: true,
            depthWrite: false,
            vertexColors: true,
            side: THREE.DoubleSide
        });

        // Create instance
        const instance = new GPUParticleSystem(geometry, material, maxParticles);
        return instance;
    }

    constructor(geometry, material, maxParticles) {
        super(geometry, material);
        this.maxParticles = maxParticles;
        this.particleCount = 0;
        this.time = 0;
        this.frustumCulled = false;
    }

    emit(options = {}) {
        const {
            position = new THREE.Vector3(),
            count = 20,
            spread = 1.0,
            velocity = 5.0,
            color = new THREE.Color(0xffffff),
            lifetime = 1.0
        } = options;

        const positions = this.geometry.attributes.position;
        const velocities = this.geometry.attributes.velocity;
        const startTimes = this.geometry.attributes.startTime;
        const lifetimes = this.geometry.attributes.lifetime;

        const now = this.time;

        for (let i = 0; i < count; i++) {
            const index = this.findInactiveParticle();
            if (index === -1) break;

            // Position
            positions.array[index * 3] = position.x;
            positions.array[index * 3 + 1] = position.y;
            positions.array[index * 3 + 2] = position.z;

            // Random velocity in sphere
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = velocity * (0.5 + Math.random() * 0.5);
            
            velocities.array[index * 3] = r * Math.sin(phi) * Math.cos(theta) * spread;
            velocities.array[index * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * spread;
            velocities.array[index * 3 + 2] = r * Math.cos(phi) * spread;

            // Timing
            startTimes.array[index] = now;
            lifetimes.array[index] = lifetime;

            this.particleCount++;
        }

        // Update attributes
        positions.needsUpdate = true;
        velocities.needsUpdate = true;
        startTimes.needsUpdate = true;
        lifetimes.needsUpdate = true;

        // Update uniforms
        this.material.uniforms.origin.value.copy(position);
        this.material.uniforms.color.value.copy(color);
    }

    findInactiveParticle() {
        const startTimes = this.geometry.attributes.startTime;
        const lifetimes = this.geometry.attributes.lifetime;
        const now = this.time;

        for (let i = 0; i < this.maxParticles; i++) {
            const startTime = startTimes.array[i];
            const lifetime = lifetimes.array[i];

            if (startTime === -1 || now - startTime > lifetime) {
                return i;
            }
        }

        return -1; // No inactive particles found
    }

    update(deltaTime) {
        this.time += deltaTime;
        this.material.uniforms.time.value = this.time;

        // Clean up expired particles
        const startTimes = this.geometry.attributes.startTime;
        const lifetimes = this.geometry.attributes.lifetime;
        let activeCount = 0;

        for (let i = 0; i < this.maxParticles; i++) {
            const startTime = startTimes.array[i];
            const lifetime = lifetimes.array[i];

            if (startTime !== -1 && this.time - startTime <= lifetime) {
                activeCount++;
            }
        }

        this.particleCount = activeCount;
    }
}
