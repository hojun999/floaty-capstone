/**
 * 정보 카드 컴포넌트 (현재 위치 / 목적지 / 예상 시간)
 */
export default function InfoCards({ currentLocation, destination, estimatedTime }) {
  return (
    <div className="info-cards">
      <div className="info-card">
        <div className="info-card-label">현재 위치</div>
        <div className="info-card-value">{currentLocation || '—'}</div>
      </div>
      <div className="info-card">
        <div className="info-card-label">목적지</div>
        <div className="info-card-value">{destination || '—'}</div>
      </div>
      <div className="info-card">
        <div className="info-card-label">예상 이동</div>
        <div className="info-card-value">
          {estimatedTime ? `약 ${estimatedTime}분` : '—'}
        </div>
      </div>
    </div>
  );
}
