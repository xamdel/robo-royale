uniform float time;
uniform float size;

attribute float particleIndex;
attribute vec3 velocity;
attribute float startTime;
attribute float lifetime;

varying float vOpacity;

void main() {
    float age = time - startTime;
    float normalizedAge = clamp(age / lifetime, 0.0, 1.0);
    
    // Simple fade out
    vOpacity = 1.0 - normalizedAge;
    
    // Basic physics
    vec3 pos = position + (velocity * age);
    pos.y -= 2.0 * age * age; // Simple gravity
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Size decreases over time
    gl_PointSize = size * (1.0 - 0.7 * normalizedAge) * (300.0 / length(mvPosition.xyz));
}