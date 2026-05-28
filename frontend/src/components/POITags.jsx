import { POI_DATA, TYPE_COLORS } from '../data/poiData';

/**
 * POI 빠른 선택 태그 컴포넌트
 */
export default function POITags({ floor, onSelect }) {
  const pois = POI_DATA.filter(
    (p) => p.floor === floor && p.type !== '이동'
  );

  return (
    <div className="poi-tags">
      {pois.map((poi) => {
        const color = TYPE_COLORS[poi.type] || { bg: '#f3f4f6', fg: '#6b7280' };
        return (
          <button
            key={poi.id}
            className="poi-tag"
            style={{
              background: color.bg,
              color: color.fg,
            }}
            onClick={() => onSelect(poi)}
          >
            {poi.name}
          </button>
        );
      })}
    </div>
  );
}
