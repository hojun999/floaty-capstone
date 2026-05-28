/**
 * 정보 카드 컴포넌트 (현재 위치 / 목적지)
 */
export default function InfoCards({ currentLocation, destination }) {
  return (
    <div className="info-cards">
      <div className="info-card">
        <div className="info-card-label">현재 위치</div>
        <div className="info-card-value">{currentLocation || '-'}</div>
      </div>
      <div className="info-card">
        <div className="info-card-label">목적지</div>
        <div className="info-card-value">{destination || '-'}</div>
      </div>
    </div>
  );
}
