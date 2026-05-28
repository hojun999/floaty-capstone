import * as THREE from 'three';

const ARROW_FORWARD_OFFSET = 0.06;
const ARROW_FLOOR_LIFT = 0.055;
const PEDESTRIAN_VISIBLE_DISTANCE = 10;
const FORWARD_DOT_THRESHOLD = -0.25;

const _dir = new THREE.Vector3();
const _arrowPos = new THREE.Vector3();
const _cameraDir = new THREE.Vector3();
const _toArrow = new THREE.Vector3();

export function createFloorArrowMesh(nodeIdOrOptions, maybeOptions = {}) {
  const options = typeof nodeIdOrOptions === 'object' && nodeIdOrOptions !== null
    ? nodeIdOrOptions
    : maybeOptions;
  const nodeId = typeof nodeIdOrOptions === 'object' && nodeIdOrOptions !== null
    ? options.nodeId
    : nodeIdOrOptions;

  const group = new THREE.Group();
  group.userData.isSvArrow = true;
  group.userData.nodeId = nodeId;
  group.userData.kind = options.kind ?? 'adjacent';

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.03, 20),
    new THREE.MeshBasicMaterial({
      color: options.discColor ?? 0x0ea5e9,
      transparent: true,
      opacity: 0.35,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.renderOrder = 5;
  disc.userData.isPulse = true;
  disc.userData.isSvArrow = true;
  disc.userData.nodeId = nodeId;
  disc.userData.kind = group.userData.kind;
  group.add(disc);

  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.018, 0.045, 3),
    new THREE.MeshBasicMaterial({
      color: options.coneColor ?? 0x38bdf8,
      depthTest: false,
      depthWrite: false,
    }),
  );
  cone.renderOrder = 6;
  cone.userData.isSvArrow = true;
  cone.userData.nodeId = nodeId;
  cone.userData.kind = group.userData.kind;
  group.add(cone);

  if (options.scale) group.scale.setScalar(options.scale);

  return group;
}

export function updateArrowTransform(arrow, fromNodePosition, toNodePosition, floorY, options = {}) {
  _dir
    .subVectors(toNodePosition, fromNodePosition)
    .setY(0);

  if (_dir.lengthSq() < 1e-8) {
    arrow.visible = false;
    return;
  }

  _dir.normalize();
  const forwardOffset = options.forwardOffset ?? ARROW_FORWARD_OFFSET;
  const floorLift = options.floorLift ?? ARROW_FLOOR_LIFT;
  _arrowPos.set(
    fromNodePosition.x + _dir.x * forwardOffset,
    floorY + floorLift,
    fromNodePosition.z + _dir.z * forwardOffset,
  );

  arrow.position.copy(_arrowPos);
  arrow.visible = true;

  arrow.traverse(obj => {
    if (obj.isMesh) obj.position.set(0, 0, 0);
    if (obj.geometry?.type === 'ConeGeometry') {
      obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _dir);
    }
  });
}

export function updateArrowVisibility(target, camera, options = {}) {
  if (!target || !camera) return;

  const viewMode = typeof options === 'string' ? options : options.viewMode;
  const maxDistance = typeof options === 'string'
    ? PEDESTRIAN_VISIBLE_DISTANCE
    : options.maxDistance ?? PEDESTRIAN_VISIBLE_DISTANCE;

  if (viewMode !== 'pedestrian') {
    target.visible = true;
    target.traverse(obj => {
      if (obj.userData?.isSvArrow) obj.visible = true;
    });
    return;
  }

  camera.getWorldDirection(_cameraDir);
  _cameraDir.y = 0;
  if (_cameraDir.lengthSq() < 1e-8) _cameraDir.set(0, 0, -1);
  _cameraDir.normalize();

  const arrows = target.children?.length ? target.children : [target];
  target.visible = true;
  arrows.forEach(arrow => {
    _toArrow.subVectors(arrow.position, camera.position);
    _toArrow.y = 0;

    const distance = _toArrow.length();
    const inRange = distance <= maxDistance;
    const inFront = distance < 1e-8 || _toArrow.normalize().dot(_cameraDir) > FORWARD_DOT_THRESHOLD;
    arrow.visible = inRange && inFront;
  });
}
