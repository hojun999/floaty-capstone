/**
 * 경로 안내 패널 컴포넌트
 */
export default function RoutePanel({ steps }) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="route-panel">
      <div className="route-title">경로 안내</div>
      {steps.map((step, i) => (
        <div key={i}>
          <div className="route-step">
            <div
              className={`route-step-dot ${i === steps.length - 1 ? 'end' : ''}`}
            />
            <span>{step}</span>
          </div>
          {i < steps.length - 1 && <div className="route-step-line" />}
        </div>
      ))}
    </div>
  );
}
