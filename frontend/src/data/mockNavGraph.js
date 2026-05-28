// ─── 메인화면 목업 그래프 (nav_graph.json 기반) ──────────────────────────────
const MOCK_NODES = [
  { id: 'node_1', name: 'node_1', type: 'waypoint',    x: -0.0013, y: 0.0097, z:  0.4046 },
  { id: 'node_2', name: 'node_2', type: 'start',       x: -0.0124, y: 0.0097, z: -0.0124 },
  { id: 'node_3', name: 'node_3', type: 'waypoint',    x:  0.4453, y: 0.0097, z: -0.19   },
  { id: 'node_4', name: 'node_4', type: 'destination', x:  0.568,  y: 0.0097, z: -0.0899 },
  { id: 'node_5', name: 'node_5', type: 'waypoint',    x:  0.399,  y: 0.0097, z: -0.3892 },
];

const MOCK_EDGES = [
  { id: 'edge_1', from: 'node_1', to: 'node_2' },
  { id: 'edge_2', from: 'node_1', to: 'node_3' },
  { id: 'edge_3', from: 'node_1', to: 'node_5' },
  { id: 'edge_4', from: 'node_4', to: 'node_3' },
];

/** 메인화면 검색창 노드 목록 (start + destination) */
export const MOCK_DESTINATIONS = MOCK_NODES.filter(n => n.type === 'destination' || n.type === 'start');

/** BFS로 두 노드 사이 최단 경로 반환. 경로 없으면 빈 배열 */
export function findMockPath(fromId, toId) {
  if (fromId === toId) return [MOCK_NODES.find(n => n.id === fromId)];

  // 인접 리스트 (양방향)
  const adj = {};
  MOCK_NODES.forEach(n => { adj[n.id] = []; });
  MOCK_EDGES.forEach(e => {
    adj[e.from]?.push(e.to);
    adj[e.to]?.push(e.from);
  });

  const visited = new Set([fromId]);
  const queue   = [[fromId]];

  while (queue.length) {
    const path = queue.shift();
    const cur  = path[path.length - 1];
    for (const next of (adj[cur] || [])) {
      if (next === toId) {
        const ids = [...path, toId];
        return ids.map(id => MOCK_NODES.find(n => n.id === id));
      }
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([...path, next]);
      }
    }
  }
  return [];
}

// ─── NavGraphEditor 목업 ──────────────────────────────────────────────────────
/**
 * PLY 모델의 바운딩 박스를 받아 샘플 내비게이션 그래프를 생성한다.
 * floorId 없이(오프라인/테스트) NavGraphEditor를 열 때 초기 데이터로 사용.
 */
export function generateMockGraph(box) {
  const cx  = (box.min.x + box.max.x) / 2;
  const cy  = (box.min.y + box.max.y) / 2;
  const cz  = box.min.z;            // 바닥 Z
  const dx  = box.max.x - box.min.x;
  const dy  = box.max.y - box.min.y;

  const nodes = [
    { id: 'node_1', name: '정문 입구',       type: 'start',       x: cx,               y: box.min.y + dy * 0.08, z: cz },
    { id: 'node_2', name: '로비',             type: 'waypoint',    x: cx,               y: box.min.y + dy * 0.25, z: cz },
    { id: 'node_3', name: '복도 중앙',        type: 'waypoint',    x: cx,               y: cy,                    z: cz },
    { id: 'node_4', name: '101호 문',         type: 'door',        x: cx - dx * 0.22,   y: cy - dy * 0.05,        z: cz },
    { id: 'node_5', name: '102호 문',         type: 'door',        x: cx + dx * 0.22,   y: cy - dy * 0.05,        z: cz },
    { id: 'node_6', name: '101호',            type: 'destination', x: cx - dx * 0.32,   y: cy + dy * 0.15,        z: cz },
    { id: 'node_7', name: '102호',            type: 'destination', x: cx + dx * 0.32,   y: cy + dy * 0.15,        z: cz },
    { id: 'node_8', name: '복도 끝',          type: 'waypoint',    x: cx,               y: box.max.y - dy * 0.08, z: cz },
    { id: 'node_9', name: '비상구',           type: 'door',        x: box.min.x + dx * 0.05, y: cy,               z: cz },
    { id: 'node_10', name: '계단실',          type: 'destination', x: box.max.x - dx * 0.05, y: cy,               z: cz },
  ];

  const edges = [
    { id: 'edge_1',  from: 'node_1', to: 'node_2'  },
    { id: 'edge_2',  from: 'node_2', to: 'node_3'  },
    { id: 'edge_3',  from: 'node_3', to: 'node_4'  },
    { id: 'edge_4',  from: 'node_3', to: 'node_5'  },
    { id: 'edge_5',  from: 'node_4', to: 'node_6'  },
    { id: 'edge_6',  from: 'node_5', to: 'node_7'  },
    { id: 'edge_7',  from: 'node_3', to: 'node_8'  },
    { id: 'edge_8',  from: 'node_3', to: 'node_9'  },
    { id: 'edge_9',  from: 'node_3', to: 'node_10' },
  ];

  return { nodes, edges };
}

/** 로드된 그래프의 node/edge ID 시퀀스 최대값을 반환 */
export function maxSeq(items, prefix) {
  return items.reduce((max, item) => {
    const m = item.id.match(new RegExp(`^${prefix}_(\\d+)$`));
    return m ? Math.max(max, parseInt(m[1])) : max;
  }, 0);
}
