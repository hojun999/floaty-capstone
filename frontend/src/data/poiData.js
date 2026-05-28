/**
 * POI 데이터 및 타입 색상 매핑
 * 실제 서비스에서는 백엔드 API에서 받아오는 데이터로 교체
 */

export const POI_DATA = [
  // 3층
  { id: 1, name: '301호 강의실', floor: 3, type: '강의실', x: 0.3, y: 0.4 },
  { id: 2, name: '302호 강의실', floor: 3, type: '강의실', x: 0.5, y: 0.4 },
  { id: 3, name: '303호 세미나실', floor: 3, type: '세미나실', x: 0.7, y: 0.4 },
  { id: 4, name: '학과사무실', floor: 3, type: '사무실', x: 0.3, y: 0.7 },
  { id: 5, name: '교수연구실 A', floor: 3, type: '연구실', x: 0.5, y: 0.7 },
  { id: 6, name: '휴게실', floor: 3, type: '편의시설', x: 0.7, y: 0.7 },
  { id: 7, name: '엘리베이터', floor: 3, type: '이동', x: 0.85, y: 0.5 },
  { id: 8, name: '계단', floor: 3, type: '이동', x: 0.15, y: 0.5 },
  // 1층
  { id: 9, name: '101호 대강의실', floor: 1, type: '강의실', x: 0.4, y: 0.3 },
  { id: 10, name: '정문 로비', floor: 1, type: '편의시설', x: 0.5, y: 0.85 },
  // 2층
  { id: 11, name: '201호 실습실', floor: 2, type: '실습실', x: 0.35, y: 0.4 },
  { id: 12, name: '202호 강의실', floor: 2, type: '강의실', x: 0.6, y: 0.4 },
  // 4층
  { id: 13, name: '401호 랩실', floor: 4, type: '연구실', x: 0.4, y: 0.35 },
  { id: 14, name: '402호 서버실', floor: 4, type: '연구실', x: 0.65, y: 0.35 },
];

export const TYPE_COLORS = {
  '강의실': { bg: '#dbeafe', fg: '#1d4ed8' },
  '세미나실': { bg: '#d1fae5', fg: '#047857' },
  '사무실': { bg: '#ffedd5', fg: '#c2410c' },
  '연구실': { bg: '#ede9fe', fg: '#6d28d9' },
  '편의시설': { bg: '#dcfce7', fg: '#15803d' },
  '이동': { bg: '#f3f4f6', fg: '#6b7280' },
  '실습실': { bg: '#fce7f3', fg: '#be185d' },
};

export const FLOORS = [
  { value: 1, label: '1층' },
  { value: 2, label: '2층' },
  { value: 3, label: '3층' },
  { value: 4, label: '4층' },
];
