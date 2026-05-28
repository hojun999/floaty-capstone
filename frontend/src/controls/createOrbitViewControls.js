import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function createOrbitViewControls(camera, domElement, options = {}) {
  const controls = new OrbitControls(camera, domElement);
  const keys = new Set();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  controls.enabled = true;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.enableDamping = true;

  const isKeyboardEnabled = () => options.isKeyboardEnabled?.() ?? controls.enabled;

  const onKeyDown = (event) => {
    if (!isKeyboardEnabled()) return;
    if (event.target?.tagName === 'INPUT' || event.target?.tagName === 'TEXTAREA') return;
    keys.add(event.code);
  };

  const onKeyUp = (event) => {
    keys.delete(event.code);
  };

  controls.updateKeyboardMovement = (deltaSeconds = 0) => {
    if (!isKeyboardEnabled()) return;
    const active = keys.has('KeyW') || keys.has('KeyS') || keys.has('KeyA') || keys.has('KeyD');
    if (!active) return;

    const distance = camera.position.distanceTo(controls.target);
    const speed = Math.max(0.01, distance * 0.03) * deltaSeconds * 60;

    forward.subVectors(controls.target, camera.position);
    forward.y = 0;
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);
    forward.normalize();
    right.crossVectors(forward, up).normalize();

    move.set(0, 0, 0);
    if (keys.has('KeyW')) move.addScaledVector(forward, speed);
    if (keys.has('KeyS')) move.addScaledVector(forward, -speed);
    if (keys.has('KeyA')) move.addScaledVector(right, -speed);
    if (keys.has('KeyD')) move.addScaledVector(right, speed);

    camera.position.add(move);
    controls.target.add(move);
  };

  controls.disposeKeyboardMovement = () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    keys.clear();
  };

  const baseDispose = controls.dispose.bind(controls);
  controls.dispose = () => {
    controls.disposeKeyboardMovement();
    baseDispose();
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  return controls;
}
