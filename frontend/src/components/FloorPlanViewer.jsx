import { useRef, useEffect, useCallback } from 'react';
import { POI_DATA, TYPE_COLORS } from '../data/poiData';
import { poiToFloorCoord } from '../utils/geometry';

/**
 * 도면 뷰어 컴포넌트
 *
 * Canvas API로 도면 위에 POI, 경로 오버레이 렌더링
 * 실제 구현 시: 도면 이미지를 배경에 깔고 그 위에 오버레이
 */
export default function FloorPlanViewer({ floor, selectedDest, routePoints }) {
  const canvasRef = useRef(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const cw = rect.width;
    const ch = rect.height;

    const style = getComputedStyle(document.documentElement);
    const surfaceColor = style.getPropertyValue('--color-surface').trim();
    const borderColor = style.getPropertyValue('--color-border').trim();
    const textColor = style.getPropertyValue('--color-text').trim();
    const mutedColor = style.getPropertyValue('--color-text-muted').trim();
    const fontFamily = style.getPropertyValue('--font-body').trim();

    // 배경
    ctx.fillStyle = surfaceColor;
    ctx.fillRect(0, 0, cw, ch);

    // 도면 영역
    const margin = { x: 30, y: 24 };
    const fw = cw - margin.x * 2;
    const fh = ch - margin.y * 2;

    // 외벽
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(margin.x, margin.y, fw, fh);

    // 내벽 (도면 파티션)
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = borderColor;
    ctx.beginPath();

    // 수평 복도
    ctx.moveTo(margin.x, margin.y + fh * 0.55);
    ctx.lineTo(margin.x + fw, margin.y + fh * 0.55);

    // 수직 파티션
    ctx.moveTo(margin.x + fw * 0.33, margin.y);
    ctx.lineTo(margin.x + fw * 0.33, margin.y + fh * 0.55);

    ctx.moveTo(margin.x + fw * 0.66, margin.y);
    ctx.lineTo(margin.x + fw * 0.66, margin.y + fh * 0.55);

    ctx.moveTo(margin.x + fw * 0.33, margin.y + fh * 0.55);
    ctx.lineTo(margin.x + fw * 0.33, margin.y + fh);

    ctx.moveTo(margin.x + fw * 0.66, margin.y + fh * 0.55);
    ctx.lineTo(margin.x + fw * 0.66, margin.y + fh);

    ctx.stroke();

    // 복도 라벨
    ctx.fillStyle = mutedColor;
    ctx.font = `400 9px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText('복도', margin.x + fw / 2, margin.y + fh * 0.55 + 12);
    ctx.textAlign = 'start';

    // POI 렌더링
    const pois = POI_DATA.filter((p) => p.floor === floor);
    pois.forEach((poi) => {
      const pos = poiToFloorCoord(poi, margin.x, fw, fh);
      // margin.y 보정
      pos.y = margin.y + poi.y * fh;

      const colorSet = TYPE_COLORS[poi.type] || { bg: '#f3f4f6', fg: '#6b7280' };
      const isSelected = selectedDest?.id === poi.id;

      // POI 마커
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isSelected ? 8 : 5, 0, Math.PI * 2);
      ctx.fillStyle = colorSet.fg;
      ctx.fill();

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
        ctx.strokeStyle = colorSet.fg;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // POI 라벨
      ctx.fillStyle = isSelected ? textColor : mutedColor;
      ctx.font = `${isSelected ? 600 : 400} ${isSelected ? 11 : 10}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(poi.name, pos.x, pos.y - (isSelected ? 16 : 10));
      ctx.textAlign = 'start';
    });

    // 경로 렌더링
    if (routePoints && routePoints.length > 1) {
      const floorPoints = routePoints.filter((p) => p.floor === floor);
      if (floorPoints.length > 1) {
        ctx.beginPath();
        ctx.setLineDash([6, 4]);

        const first = {
          x: margin.x + floorPoints[0].x * fw,
          y: margin.y + floorPoints[0].y * fh,
        };
        ctx.moveTo(first.x, first.y);

        for (let j = 1; j < floorPoints.length; j++) {
          const pt = {
            x: margin.x + floorPoints[j].x * fw,
            y: margin.y + floorPoints[j].y * fh,
          };
          ctx.lineTo(pt.x, pt.y);
        }

        ctx.strokeStyle = 'var(--color-primary, #2563eb)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.setLineDash([]);

        // 도착 화살표
        const lastPt = floorPoints[floorPoints.length - 1];
        const prevPt = floorPoints[floorPoints.length - 2];
        const endX = margin.x + lastPt.x * fw;
        const endY = margin.y + lastPt.y * fh;
        const angle = Math.atan2(
          lastPt.y - prevPt.y,
          lastPt.x - prevPt.x
        );

        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - 8 * Math.cos(angle - 0.5),
          endY - 8 * Math.sin(angle - 0.5)
        );
        ctx.lineTo(
          endX - 8 * Math.cos(angle + 0.5),
          endY - 8 * Math.sin(angle + 0.5)
        );
        ctx.closePath();
        ctx.fillStyle = 'var(--color-primary, #2563eb)';
        ctx.fill();
      }
    }

    // 층 정보
    ctx.fillStyle = mutedColor;
    ctx.font = `500 10px ${fontFamily}`;
    ctx.fillText(`${floor}층 도면`, margin.x + 4, ch - 6);
  }, [floor, selectedDest, routePoints]);

  useEffect(() => {
    render();
    window.addEventListener('resize', render);
    return () => window.removeEventListener('resize', render);
  }, [render]);

  return (
    <div className="viewer-panel">
      <canvas ref={canvasRef} />
      <div className="viewer-label">도면 뷰 · {floor}층</div>
    </div>
  );
}
