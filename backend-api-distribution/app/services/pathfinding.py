import heapq
import math

from app.schemas.navigation import Edge, Node


def find_path(nodes: list[Node], edges: list[Edge], from_id: str, to_id: str) -> list[Node] | None:
    node_map = {node.id: node for node in nodes}
    if from_id not in node_map or to_id not in node_map:
        return None

    adj: dict[str, list[tuple[str, float]]] = {node_id: [] for node_id in node_map}
    for edge in edges:
        a = edge.from_
        b = edge.to
        if a not in node_map or b not in node_map:
            continue
        dist = distance(node_map[a], node_map[b])
        adj[a].append((b, dist))
        adj[b].append((a, dist))

    heap: list[tuple[float, float, str, list[str]]] = [
        (distance(node_map[from_id], node_map[to_id]), 0.0, from_id, [from_id])
    ]
    visited: set[str] = set()

    while heap:
        _, g_score, current, path = heapq.heappop(heap)
        if current in visited:
            continue
        visited.add(current)
        if current == to_id:
            return [node_map[node_id] for node_id in path]

        for next_node, weight in adj[current]:
            if next_node in visited:
                continue
            next_score = g_score + weight
            priority = next_score + distance(node_map[next_node], node_map[to_id])
            heapq.heappush(heap, (priority, next_score, next_node, path + [next_node]))

    return None


def distance(a: Node, b: Node) -> float:
    return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)
