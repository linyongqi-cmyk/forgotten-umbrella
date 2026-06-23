// Minimal, dependency-free EXIF reader for JPEG buffers.
//
// We only need two things out of a freshly-uploaded photo:
//   - GPS position  -> { lat, lng }  (so a new point lands where the photo was taken)
//   - DateTimeOriginal -> ISO string (so its time fills in automatically)
//
// This parses just enough of the JPEG APP1 / TIFF / GPS-IFD structure to get
// those, and returns nulls for anything it can't find. It never throws on
// malformed data — a photo with no EXIF simply yields { coordinates: null }.

const TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

// Read the APP1 "Exif" segment out of a JPEG and return its TIFF block plus the
// byte order, or null if there is no EXIF segment.
function findTiff(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null; // not a JPEG
  }
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      break;
    }
    const marker = buffer[offset + 1];
    // Standalone markers without a length payload.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const segLength = buffer.readUInt16BE(offset + 2);
    if (segLength < 2) {
      break;
    }
    const segStart = offset + 4;
    const segEnd = segStart + segLength - 2;
    if (marker === 0xe1 && buffer.toString("ascii", segStart, segStart + 4) === "Exif") {
      // "Exif\0\0" header (6 bytes) then the TIFF block.
      const tiffStart = segStart + 6;
      return { buffer, tiffStart, tiffEnd: Math.min(segEnd, buffer.length) };
    }
    offset = segEnd;
  }
  return null;
}

function makeReader(buffer, tiffStart) {
  const byteOrder = buffer.toString("ascii", tiffStart, tiffStart + 2);
  const little = byteOrder === "II";
  return {
    u16: (pos) => (little ? buffer.readUInt16LE(pos) : buffer.readUInt16BE(pos)),
    u32: (pos) => (little ? buffer.readUInt32LE(pos) : buffer.readUInt32BE(pos)),
  };
}

// Walk one IFD and return a Map of tag -> entry descriptor.
function readIfd(buffer, tiffStart, ifdOffset, reader) {
  const entries = new Map();
  const base = tiffStart + ifdOffset;
  if (base + 2 > buffer.length) {
    return entries;
  }
  const count = reader.u16(base);
  for (let i = 0; i < count; i += 1) {
    const entryPos = base + 2 + i * 12;
    if (entryPos + 12 > buffer.length) {
      break;
    }
    const tag = reader.u16(entryPos);
    const type = reader.u16(entryPos + 2);
    const num = reader.u32(entryPos + 4);
    const byteLen = (TYPE_SIZES[type] || 0) * num;
    const valuePos = byteLen <= 4 ? entryPos + 8 : tiffStart + reader.u32(entryPos + 8);
    entries.set(tag, { type, num, valuePos });
  }
  return entries;
}

function readAscii(buffer, entry) {
  if (!entry || entry.type !== 2) {
    return "";
  }
  const end = entry.valuePos + entry.num;
  if (entry.valuePos < 0 || end > buffer.length) {
    return "";
  }
  return buffer.toString("ascii", entry.valuePos, end).replace(/\0.*$/, "").trim();
}

// Read N rationals (used for the deg/min/sec GPS triples).
function readRationals(buffer, entry, reader) {
  if (!entry || (entry.type !== 5 && entry.type !== 10)) {
    return [];
  }
  const out = [];
  for (let i = 0; i < entry.num; i += 1) {
    const pos = entry.valuePos + i * 8;
    if (pos + 8 > buffer.length) {
      break;
    }
    const numerator = reader.u32(pos);
    const denominator = reader.u32(pos + 4);
    out.push(denominator ? numerator / denominator : 0);
  }
  return out;
}

function dmsToDecimal(parts, ref) {
  if (parts.length < 3) {
    return null;
  }
  const [deg, min, sec] = parts;
  let value = deg + min / 60 + sec / 3600;
  if (ref === "S" || ref === "W") {
    value = -value;
  }
  return value;
}

// "2025:03:19 20:21:56" -> "2025-03-19T20:21:56+09:00" (photos are JST).
function exifDateToIso(raw) {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!match) {
    return "";
  }
  const [, y, mo, d, h, mi, s] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`;
}

export function parseExif(buffer) {
  const empty = { coordinates: null, dateTime: "" };
  try {
    const tiff = findTiff(buffer);
    if (!tiff) {
      return empty;
    }
    const { tiffStart } = tiff;
    const reader = makeReader(buffer, tiffStart);
    if (reader.u16(tiffStart + 2) !== 0x002a) {
      return empty;
    }
    const ifd0Offset = reader.u32(tiffStart + 4);
    const ifd0 = readIfd(buffer, tiffStart, ifd0Offset, reader);

    let coordinates = null;
    const gpsPointer = ifd0.get(0x8825);
    if (gpsPointer) {
      const gpsOffset = reader.u32(gpsPointer.valuePos);
      const gps = readIfd(buffer, tiffStart, gpsOffset, reader);
      const latRef = readAscii(buffer, gps.get(0x0001));
      const lngRef = readAscii(buffer, gps.get(0x0003));
      const lat = dmsToDecimal(readRationals(buffer, gps.get(0x0002), reader), latRef);
      const lng = dmsToDecimal(readRationals(buffer, gps.get(0x0004), reader), lngRef);
      if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
        coordinates = { lat, lng };
      }
    }

    let dateTime = "";
    const exifPointer = ifd0.get(0x8769);
    if (exifPointer) {
      const exifOffset = reader.u32(exifPointer.valuePos);
      const exif = readIfd(buffer, tiffStart, exifOffset, reader);
      const original = readAscii(buffer, exif.get(0x9003)) || readAscii(buffer, exif.get(0x0132));
      dateTime = exifDateToIso(original);
    }

    return { coordinates, dateTime };
  } catch {
    return empty;
  }
}
