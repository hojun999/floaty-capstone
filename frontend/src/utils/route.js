import { POI_DATA } from '../data/poiData';

/**
 * 경로 생성 (클라이언트 사이드 폴백)
 * 실제 서비스에서는 백엔드 A* API를 호출
 *
 * @param {object} start - 출발 POI
 * @param {object} dest - 도착 POI
 * @returns {{ steps: string[], pathPoints: {x,y,floor}[], estimatedTime: number }}
 */
export function generateRoute(start, dest) {
  const steps = [];
  const pathPoints = [];

  if (!start || !dest) return { steps: [], pathPoints: [], estimatedTime: 0 };

  // 같은 층
  if (start.floor === dest.floor) {
    steps.push(`${start.name}에서 출발`);
    steps.push('복도를 따라 이동');
    steps.push(`${dest.name} 도착`);

    pathPoints.push({ x: start.x, y: start.y, floor: start.floor });
    pathPoints.push({ x: start.x, y: 0.55, floor: start.floor }); // 복도
    pathPoints.push({ x: dest.x, y: 0.55, floor: dest.floor });   // 복도
    pathPoints.push({ x: dest.x, y: dest.y, floor: dest.floor });
  } else {
    // 다른 층 → 엘리베이터/계단 경유
    const elevator = POI_DATA.find(
      (p) => p.floor === start.floor && p.name === '엘리베이터'
    ) || { x: 0.85, y: 0.5 };

    const elevatorDest = POI_DATA.find(
      (p) => p.floor === dest.floor && p.name === '엘리베이터'
    ) || { x: 0.85, y: 0.5 };

    steps.push(`${start.name}에서 출발`);
    steps.push('엘리베이터로 이동');
    steps.push(`${dest.floor}층으로 이동`);
    steps.push(`복도를 따라 ${dest.name} 방향으로 이동`);
    steps.push(`${dest.name} 도착`);

    pathPoints.push({ x: start.x, y: start.y, floor: start.floor });
    pathPoints.push({ x: elevator.x, y: elevator.y, floor: start.floor });
    pathPoints.push({ x: elevatorDest.x, y: elevatorDest.y, floor: dest.floor });
    pathPoints.push({ x: dest.x, y: 0.55, floor: dest.floor });
    pathPoints.push({ x: dest.x, y: dest.y, floor: dest.floor });
  }

  // 예상 시간 (층간 이동 + 수평 거리 기반)
  const floorDiff = Math.abs(start.floor - dest.floor);
  const horizontalDist = Math.sqrt(
    (start.x - dest.x) ** 2 + (start.y - dest.y) ** 2
  );
  const estimatedTime = Math.max(1, Math.round(floorDiff * 1.5 + horizontalDist * 4));

  return { steps, pathPoints, estimatedTime };
}
