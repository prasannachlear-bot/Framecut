// .cube LUT parser — supports 1D *LUT_3D_SIZE tables (3D LUTs)

export interface ParsedLut {
  size: number;
  data: Float32Array; // size^3 * 3, RGB ordered
  name: string;
}

export function parseCube(text: string, name: string): ParsedLut {
  const lines = text.split(/\r?\n/);
  let size = 0;
  const values: number[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("TITLE")) continue;
    if (line.startsWith("LUT_3D_SIZE")) {
      size = parseInt(line.split(/\s+/)[1], 10);
      continue;
    }
    if (line.startsWith("LUT_1D_SIZE") || line.startsWith("DOMAIN_") || line.startsWith("LUT_")) {
      continue;
    }
    const parts = line.split(/\s+/).map(parseFloat);
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
      values.push(parts[0], parts[1], parts[2]);
    }
  }

  if (!size) {
    // fallback: infer cube size
    const n = values.length / 3;
    size = Math.round(Math.cbrt(n));
    if (size ** 3 !== n) throw new Error("Invalid LUT: cannot infer size");
  }

  const expected = size ** 3 * 3;
  if (values.length !== expected)
    throw new Error(`Invalid LUT: expected ${expected} samples, got ${values.length}`);

  return { size, data: new Float32Array(values), name };
}

export function serializeProjectLutName(name: string) {
  return name.replace(/\.cube$/i, "");
}
