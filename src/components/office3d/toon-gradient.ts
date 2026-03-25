import * as THREE from 'three';

// Singleton 3-step toon gradient texture shared across all components.
// Uses RGBA format (RGBFormat is deprecated in newer Three.js).
const data = new Uint8Array([
  60, 60, 60, 255,
  140, 140, 140, 255,
  255, 255, 255, 255,
]);
const toonGradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
toonGradient.minFilter = THREE.NearestFilter;
toonGradient.magFilter = THREE.NearestFilter;
toonGradient.needsUpdate = true;

export default toonGradient;
