import math
import re
import struct


TYPE_FORMATS = {
    "char": ("b", 1),
    "int8": ("b", 1),
    "uchar": ("B", 1),
    "uint8": ("B", 1),
    "short": ("h", 2),
    "int16": ("h", 2),
    "ushort": ("H", 2),
    "uint16": ("H", 2),
    "int": ("i", 4),
    "int32": ("i", 4),
    "uint": ("I", 4),
    "uint32": ("I", 4),
    "float": ("f", 4),
    "float32": ("f", 4),
    "double": ("d", 8),
    "float64": ("d", 8),
}


class PlyCutError(ValueError):
    pass


def create_editor_cut_ply_bytes(
    source: bytes,
    *,
    cut_ratio: float = 0.2,
    cut_y: float | None = None,
    rotation_x_deg: float = -90.0,
) -> bytes:
    header_end = _find_header_end(source)
    header_text = source[:header_end].decode("utf-8")
    elements, vertex_element, fmt = _parse_header(header_text)
    if fmt != "binary_little_endian":
        raise PlyCutError(f"Only binary_little_endian PLY is supported. Found: {fmt or 'unknown'}")
    if vertex_element is None:
        raise PlyCutError("PLY has no vertex element.")
    if any(prop["is_list"] for prop in vertex_element["properties"]):
        raise PlyCutError("List properties inside vertex are not supported.")

    layout, stride = _property_layout(vertex_element)
    x_prop = layout.get("x")
    y_prop = layout.get("y")
    z_prop = layout.get("z")
    if not x_prop or not y_prop or not z_prop:
        raise PlyCutError("PLY vertex properties must include x, y, and z.")

    vertex_start = _vertex_start(header_end, elements)
    vertex_count = vertex_element["count"]
    vertex_end = vertex_start + stride * vertex_count
    if vertex_end > len(source):
        raise PlyCutError("PLY vertex data is shorter than expected.")

    min_y = math.inf
    max_y = -math.inf
    for index in range(vertex_count):
        offset = vertex_start + index * stride
        rotated_y = _rotated_y(source, offset, x_prop, y_prop, z_prop, rotation_x_deg)
        min_y = min(min_y, rotated_y)
        max_y = max(max_y, rotated_y)

    resolved_cut_y = cut_y if cut_y is not None else min_y + (max_y - min_y) * (0.5 + cut_ratio)
    kept_vertices = []
    for index in range(vertex_count):
        offset = vertex_start + index * stride
        rotated_y = _rotated_y(source, offset, x_prop, y_prop, z_prop, rotation_x_deg)
        if rotated_y <= resolved_cut_y:
            kept_vertices.append(source[offset:offset + stride])

    new_header = _replace_vertex_count(header_text, len(kept_vertices)).encode("utf-8")
    return b"".join([new_header, *kept_vertices, source[vertex_end:]])


def _find_header_end(source: bytes) -> int:
    marker_index = source.find(b"end_header")
    if marker_index == -1:
        raise PlyCutError("PLY header is missing end_header.")
    lf_index = source.find(b"\n", marker_index)
    if lf_index == -1:
        raise PlyCutError("PLY header is not newline-terminated.")
    return lf_index + 1


def _parse_header(header_text: str):
    fmt = None
    elements = []
    current_element = None
    for raw_line in header_text.splitlines():
        parts = raw_line.strip().split()
        if not parts:
            continue
        if parts[0] == "format" and len(parts) >= 2:
            fmt = parts[1]
        elif parts[0] == "element" and len(parts) >= 3:
            current_element = {
                "name": parts[1],
                "count": int(parts[2]),
                "properties": [],
            }
            elements.append(current_element)
        elif parts[0] == "property" and current_element:
            if len(parts) >= 5 and parts[1] == "list":
                current_element["properties"].append({
                    "is_list": True,
                    "count_type": parts[2],
                    "item_type": parts[3],
                    "name": parts[4],
                })
            elif len(parts) >= 3:
                current_element["properties"].append({
                    "is_list": False,
                    "type": parts[1],
                    "name": parts[2],
                })

    vertex_element = next((element for element in elements if element["name"] == "vertex"), None)
    return elements, vertex_element, fmt


def _fixed_stride(element) -> int | None:
    stride = 0
    for prop in element["properties"]:
        if prop["is_list"]:
            return None
        try:
            stride += TYPE_FORMATS[prop["type"]][1]
        except KeyError as exc:
            raise PlyCutError(f"Unsupported PLY property type: {prop['type']}") from exc
    return stride


def _property_layout(element):
    offset = 0
    layout = {}
    for prop in element["properties"]:
        try:
            fmt, size = TYPE_FORMATS[prop["type"]]
        except KeyError as exc:
            raise PlyCutError(f"Unsupported PLY property type: {prop['type']}") from exc
        layout[prop["name"]] = {**prop, "offset": offset, "format": fmt, "size": size}
        offset += size
    return layout, offset


def _vertex_start(header_end: int, elements) -> int:
    offset = header_end
    for element in elements:
        if element["name"] == "vertex":
            return offset
        stride = _fixed_stride(element)
        if stride is None:
            raise PlyCutError(f"Variable-length element before vertex is not supported: {element['name']}")
        offset += stride * element["count"]
    raise PlyCutError("Could not locate vertex data.")


def _read_scalar(source: bytes, offset: int, prop) -> float:
    return struct.unpack_from("<" + prop["format"], source, offset + prop["offset"])[0]


def _rotated_y(source: bytes, offset: int, x_prop, y_prop, z_prop, rotation_x_deg: float) -> float:
    del x_prop
    y = _read_scalar(source, offset, y_prop)
    z = _read_scalar(source, offset, z_prop)
    radians = rotation_x_deg * math.pi / 180
    return y * math.cos(radians) - z * math.sin(radians)


def _replace_vertex_count(header_text: str, count: int) -> str:
    return re.sub(r"element vertex\s+\d+", f"element vertex {count}", header_text, count=1, flags=re.MULTILINE)
