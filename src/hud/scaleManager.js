export function initializeScaleManager() {
  window.addEventListener('resize', updateScale);
  updateScale(); // Initial scale update
}

export function updateScale() {
  // Get screen dimensions
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Calculate appropriate scale based on screen size
  const baseSize = Math.min(width, height);
  const scale = baseSize / 1000; // 1000px is our reference size

  // Apply scale to root element for CSS variables
  document.documentElement.style.setProperty('--hud-scale', scale.toFixed(2));

  // Removed direct style manipulation for scanner-display.
  // CSS rule using --hud-scale will now handle the scaling.
}
