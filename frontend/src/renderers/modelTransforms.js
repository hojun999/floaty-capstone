import * as THREE from 'three';

export const MODEL_ROTATION_X = -Math.PI / 2;

export const SPLAT_MODEL_TRANSFORM = {
  position: [0, 0, 0],
  rotation: new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(MODEL_ROTATION_X, 0, 0))
    .toArray(),
  scale: [1, 1, 1],
};
