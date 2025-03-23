uniform vec3 color;

varying float vOpacity;

void main() {
    // Calculate distance from center for circular shape
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    
    // Soft circle with fade at edges
    float alpha = smoothstep(0.5, 0.1, dist) * vOpacity;
    
    // Brighter core for more realistic fire/explosion
    vec3 finalColor = color;
    if (dist < 0.2) {
        finalColor = mix(vec3(1.0, 1.0, 0.7), color, dist * 5.0);
    }
    
    gl_FragColor = vec4(finalColor, alpha);
    
    // Discard transparent pixels
    if (alpha < 0.01) {
        discard;
    }
}