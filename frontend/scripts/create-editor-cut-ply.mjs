import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPE_SIZES = new Map([
  ['char', 1],
  ['int8', 1],
  ['uchar', 1],
  ['uint8', 1],
  ['short', 2],
  ['int16', 2],
  ['ushort', 2],
  ['uint16', 2],
  ['int', 4],
  ['int32', 4],
  ['uint', 4],
  ['uint32', 4],
  ['float', 4],
  ['float32', 4],
  ['double', 8],
  ['float64', 8],
]);

const READERS = {
  char: (buffer, offset) => buffer.readInt8(offset),
  int8: (buffer, offset) => buffer.readInt8(offset),
  uchar: (buffer, offset) => buffer.readUInt8(offset),
  uint8: (buffer, offset) => buffer.readUInt8(offset),
  short: (buffer, offset) => buffer.readInt16LE(offset),
  int16: (buffer, offset) => buffer.readInt16LE(offset),
  ushort: (buffer, offset) => buffer.readUInt16LE(offset),
  uint16: (buffer, offset) => buffer.readUInt16LE(offset),
  int: (buffer, offset) => buffer.readInt32LE(offset),
  int32: (buffer, offset) => buffer.readInt32LE(offset),
  uint: (buffer, offset) => buffer.readUInt32LE(offset),
  uint32: (buffer, offset) => buffer.readUInt32LE(offset),
  float: (buffer, offset) => buffer.readFloatLE(offset),
  float32: (buffer, offset) => buffer.readFloatLE(offset),
  double: (buffer, offset) => buffer.readDoubleLE(offset),
  float64: (buffer, offset) => buffer.readDoubleLE(offset),
};

const DEFAULT_INPUT = 'public/Open3d2.ply';
const DEFAULT_ROTATION_X_DEG = -90;
const DEFAULT_CUT_RATIO = 0.2;

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    input: DEFAULT_INPUT,
    output: null,
    cutY: null,
    cutRatio: DEFAULT_CUT_RATIO,
    rotationXDeg: DEFAULT_ROTATION_X_DEG,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--input' || arg === '-i') {
      options.input = next;
      i += 1;
    } else if (arg === '--output' || arg === '-o') {
      options.output = next;
      i += 1;
    } else if (arg === '--cut-y') {
      options.cutY = Number(next);
      i += 1;
    } else if (arg === '--cut-ratio') {
      options.cutRatio = Number(next);
      i += 1;
    } else if (arg === '--rotation-x') {
      options.rotationXDeg = Number(next);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.output) {
    const parsed = path.parse(options.input);
    options.output = path.join(parsed.dir, `${parsed.name}_editor_cut${parsed.ext}`);
  }

  return options;
};

const printHelp = () => {
  console.log(`
Create an editor-only 3DGS PLY with high ceiling splats removed.

Usage:
  npm run editor:cut-ply
  npm run editor:cut-ply -- --input public/Open3d2.ply --cut-ratio 0.25
  npm run editor:cut-ply -- --input public/Open3d2.ply --cut-y 1.8

Options:
  --input, -i       Source 3DGS PLY. Default: ${DEFAULT_INPUT}
  --output, -o      Output PLY. Default: *_editor_cut.ply
  --cut-y           Cut height in editor coordinates after rotation.
  --cut-ratio       Auto cut ratio from the top of the bounding box. Default: ${DEFAULT_CUT_RATIO}
  --rotation-x      X rotation in degrees used by the editor. Default: ${DEFAULT_ROTATION_X_DEG}
`);
};

const findHeaderEnd = (buffer) => {
  const marker = Buffer.from('end_header');
  const markerIndex = buffer.indexOf(marker);
  if (markerIndex === -1) throw new Error('PLY header is missing end_header.');
  const lfIndex = buffer.indexOf(0x0a, markerIndex);
  if (lfIndex === -1) throw new Error('PLY header is not newline-terminated.');
  return lfIndex + 1;
};

const parseHeader = (buffer) => {
  const headerEnd = findHeaderEnd(buffer);
  const headerText = buffer.subarray(0, headerEnd).toString('utf8');
  const lines = headerText.split(/\r?\n/);
  let format = null;
  let currentElement = null;
  const elements = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'format') format = parts[1];
    if (parts[0] === 'element') {
      currentElement = { name: parts[1], count: Number(parts[2]), properties: [] };
      elements.push(currentElement);
    } else if (parts[0] === 'property' && currentElement) {
      if (parts[1] === 'list') {
        currentElement.properties.push({ isList: true, countType: parts[2], itemType: parts[3], name: parts[4] });
      } else {
        currentElement.properties.push({ isList: false, type: parts[1], name: parts[2] });
      }
    }
  }

  if (format !== 'binary_little_endian') {
    throw new Error(`Only binary_little_endian PLY is supported. Found: ${format || 'unknown'}`);
  }

  const vertexElement = elements.find((element) => element.name === 'vertex');
  if (!vertexElement) throw new Error('PLY has no vertex element.');
  if (vertexElement.properties.some((property) => property.isList)) {
    throw new Error('List properties inside vertex are not supported.');
  }

  return { headerEnd, headerText, elements, vertexElement };
};

const getFixedStride = (element) => {
  let stride = 0;
  for (const property of element.properties) {
    if (property.isList) return null;
    const size = TYPE_SIZES.get(property.type);
    if (!size) throw new Error(`Unsupported PLY property type: ${property.type}`);
    stride += size;
  }
  return stride;
};

const getPropertyLayout = (element) => {
  let offset = 0;
  const layout = new Map();
  for (const property of element.properties) {
    const size = TYPE_SIZES.get(property.type);
    layout.set(property.name, { ...property, offset, size });
    offset += size;
  }
  return { layout, stride: offset };
};

const getVertexStart = (headerEnd, elements) => {
  let offset = headerEnd;
  for (const element of elements) {
    if (element.name === 'vertex') return offset;
    const stride = getFixedStride(element);
    if (stride === null) throw new Error(`Variable-length element before vertex is not supported: ${element.name}`);
    offset += stride * element.count;
  }
  throw new Error('Could not locate vertex data.');
};

const getVertexEnd = (vertexStart, vertexStride, vertexCount) => vertexStart + vertexStride * vertexCount;

const readScalar = (buffer, offset, type) => {
  const reader = READERS[type];
  if (!reader) throw new Error(`Unsupported scalar reader type: ${type}`);
  return reader(buffer, offset);
};

const rotateX = (point, degrees) => {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x,
    y: point.y * cos - point.z * sin,
    z: point.y * sin + point.z * cos,
  };
};

const replaceVertexCount = (headerText, count) => {
  return headerText.replace(/element vertex\s+\d+/m, `element vertex ${count}`);
};

export const createEditorCutPly = async (options) => {
  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.output);
  const source = await readFile(inputPath);
  const { headerEnd, headerText, elements, vertexElement } = parseHeader(source);
  const { layout, stride } = getPropertyLayout(vertexElement);
  const xProp = layout.get('x');
  const yProp = layout.get('y');
  const zProp = layout.get('z');
  if (!xProp || !yProp || !zProp) throw new Error('PLY vertex properties must include x, y, and z.');

  const vertexStart = getVertexStart(headerEnd, elements);
  const vertexEnd = getVertexEnd(vertexStart, stride, vertexElement.count);
  if (vertexEnd > source.length) throw new Error('PLY vertex data is shorter than expected.');

  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < vertexElement.count; i += 1) {
    const offset = vertexStart + i * stride;
    const rotated = rotateX({
      x: readScalar(source, offset + xProp.offset, xProp.type),
      y: readScalar(source, offset + yProp.offset, yProp.type),
      z: readScalar(source, offset + zProp.offset, zProp.type),
    }, options.rotationXDeg);
    minY = Math.min(minY, rotated.y);
    maxY = Math.max(maxY, rotated.y);
  }

  const autoCutY = maxY - (maxY - minY) * options.cutRatio;
  const cutY = Number.isFinite(options.cutY) ? options.cutY : autoCutY;
  const keptVertices = [];
  let removed = 0;

  for (let i = 0; i < vertexElement.count; i += 1) {
    const offset = vertexStart + i * stride;
    const rotated = rotateX({
      x: readScalar(source, offset + xProp.offset, xProp.type),
      y: readScalar(source, offset + yProp.offset, yProp.type),
      z: readScalar(source, offset + zProp.offset, zProp.type),
    }, options.rotationXDeg);

    if (rotated.y <= cutY) {
      keptVertices.push(source.subarray(offset, offset + stride));
    } else {
      removed += 1;
    }
  }

  const newHeader = Buffer.from(replaceVertexCount(headerText, keptVertices.length), 'utf8');
  const trailing = source.subarray(vertexEnd);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.concat([newHeader, ...keptVertices, trailing]));

  console.log(`Created ${path.relative(process.cwd(), outputPath)}`);
  console.log(`Input vertices: ${vertexElement.count}`);
  console.log(`Kept vertices: ${keptVertices.length}`);
  console.log(`Removed vertices: ${removed}`);
  console.log(`Editor Y bounds after rotation: ${minY.toFixed(4)} to ${maxY.toFixed(4)}`);
  console.log(`Cut Y: ${cutY.toFixed(4)}`);
};

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  createEditorCutPly(parseArgs()).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
