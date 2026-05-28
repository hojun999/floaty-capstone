import * as THREE from 'three';

const MOVE_SPEED = 1.56;
const LOOK_SENSITIVITY = 0.0025;
const MAX_PITCH = Math.PI / 2 - 0.12;

export function createPedestrianControls(camera, domElement, options = {}) {
  const keys = new Set();
  const up = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();
  const target = new THREE.Vector3();
  const candidatePosition = new THREE.Vector3();

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let floorY = options.floorY ?? 0;
  let eyeHeight = options.eyeHeight ?? 0.05;
  let yaw = 0;
  let pitch = 0;

  const isEnabled = () => options.isEnabled?.() ?? true;

  const syncAnglesFromCamera = () => {
    camera.getWorldDirection(forward);
    yaw = Math.atan2(-forward.x, -forward.z);
    pitch = Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1));
  };

  const applyLook = () => {
    pitch = THREE.MathUtils.clamp(pitch, -MAX_PITCH, MAX_PITCH);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  };

  const syncTarget = () => {
    target.copy(camera.position);
    target.y = floorY;
    options.onTargetChange?.(target);
  };

  const setFloorY = (value = 0) => {
    floorY = value;
    camera.position.y = floorY + eyeHeight;
    syncTarget();
  };

  const setEyeHeight = (value = eyeHeight) => {
    eyeHeight = value;
    camera.position.y = floorY + eyeHeight;
    syncTarget();
  };

  const onKeyDown = (event) => {
    if (!isEnabled()) return;
    if (event.target?.tagName === 'INPUT' || event.target?.tagName === 'TEXTAREA') return;
    keys.add(event.code);
  };

  const onKeyUp = (event) => {
    keys.delete(event.code);
  };

  const onPointerDown = (event) => {
    if (!isEnabled() || event.button !== 0) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    domElement.setPointerCapture?.(event.pointerId);
    syncAnglesFromCamera();
  };

  const onPointerMove = (event) => {
    if (!dragging || !isEnabled()) return;

    const dx = event.movementX ?? event.clientX - lastX;
    const dy = event.movementY ?? event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;

    yaw -= dx * LOOK_SENSITIVITY;
    pitch -= dy * LOOK_SENSITIVITY;
    applyLook();
  };

  const stopDragging = (event) => {
    dragging = false;
    if (event?.pointerId != null && domElement.hasPointerCapture?.(event.pointerId)) {
      domElement.releasePointerCapture(event.pointerId);
    }
  };

  const update = (deltaSeconds = 0) => {
    if (!isEnabled()) return;

    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);
    forward.normalize();
    right.crossVectors(forward, up).normalize();

    move.set(0, 0, 0);
    if (keys.has('KeyW')) move.add(forward);
    if (keys.has('KeyS')) move.sub(forward);
    if (keys.has('KeyA')) move.sub(right);
    if (keys.has('KeyD')) move.add(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(MOVE_SPEED * deltaSeconds);
      candidatePosition.copy(camera.position).add(move);
      candidatePosition.y = floorY + eyeHeight;
      if (options.canMoveTo?.(candidatePosition) ?? true) {
        camera.position.copy(candidatePosition);
      }
    }

    camera.position.y = floorY + eyeHeight;
    syncTarget();
  };

  const dispose = () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    domElement.removeEventListener('pointerdown', onPointerDown);
    domElement.removeEventListener('pointermove', onPointerMove);
    domElement.removeEventListener('pointerup', stopDragging);
    domElement.removeEventListener('pointercancel', stopDragging);
  };

  syncAnglesFromCamera();
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', stopDragging);
  domElement.addEventListener('pointercancel', stopDragging);

  return {
    update,
    dispose,
    setFloorY,
    setEyeHeight,
    syncAnglesFromCamera,
  };
}
