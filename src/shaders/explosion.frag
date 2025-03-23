uniform vec3 color;

varying float vOpacity;
varying vec2 vUv;

void main() {
    // Calculate distance from center for circular shape
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    
    // Soft circle shape with falloff
    float alpha = smoothstep(0.5, 0.2, dist) * vOpacity;
    
    // Apply color with additive blending
    gl_FragColor = vec4(color, alpha);
    
    // Discard pixels outside the particle circle
    if (dist > 0.5) {
        discard;
    }
}
