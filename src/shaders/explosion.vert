uniform float time;
uniform float size;
uniform vec3 origin;

attribute float particleIndex;
attribute vec3 velocity;
attribute float startTime;
attribute float lifetime;

varying float vOpacity;
varying vec2 vUv;

void main() {
    float age = time - startTime;
    float normalizedAge = age / lifetime;
    
    // Only show particles during their lifetime
    vOpacity = 1.0 - normalizedAge;
    
    // Basic physics simulation
    vec3 pos = origin + (velocity * age) + vec3(0.0, -4.9, 0.0) * age * age; // Apply gravity
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Size attenuation
    gl_PointSize = size * (1.0 - normalizedAge) * (300.0 / length(mvPosition.xyz));
    
    // Pass UV coordinates for circular particles
    vUv = vec2(gl_PointSize) * 0.5;
}
