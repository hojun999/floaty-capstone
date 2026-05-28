/**
 * 3D 등축 투영 (프로토타입용)
 * 실제 서비스에서는 Three.js 카메라로 대체
 */
export function project3D(x, z, yOff, rx, ry, cx, cy, scale) {
  const cosR = Math.cos(ry);
  const sinR = Math.sin(ry);
  const x2 = x * cosR - z * sinR;
  const z2 = x * sinR + z * cosR;

  const cosP = Math.cos(rx);
  const sinP = Math.sin(rx);
  const y2 = yOff * cosP - z2 * sinP;

  return {
    x: cx + x2 * scale,
    y: cy - y2 * scale,
  };
}

/**
 * POI 좌표(0~1 정규화)를 도면 캔버스 좌표로 변환
 */
export function poiToFloorCoord(poi, margin, floorWidth, floorHeight) {
  return {
    x: margin + poi.x * floorWidth,
    y: margin + poi.y * floorHeight,
  };
}

/**
 * POI 좌표를 3D 공간 좌표로 변환
 */
export function poiTo3DCoord(poi) {
  return {
    x: (poi.x - 0.5) * 4,
    z: (poi.y - 0.5) * 4,
  };
}

/**
 * Affine 변환 행렬 적용
 * 백엔드에서 받은 affine matrix를 사용해 3D→2D 좌표 변환
 * matrix: [a, b, tx, c, d, ty] (2x3)
 */
export function applyAffine(point3D, matrix) {
  const [a, b, tx, c, d, ty] = matrix;
  return {
    x: a * point3D.x + b * point3D.z + tx,
    y: c * point3D.x + d * point3D.z + ty,
  };
}

/**
 * 두 점 사이 거리
 */
export function distance(p1, p2) {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}
