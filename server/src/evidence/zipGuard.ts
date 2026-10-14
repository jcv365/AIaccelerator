import { EvidenceError } from "./errors.js";

export const MAX_ZIP_ENTRIES = 2000;
export const MAX_UNPACKED_BYTES = 100 * 1024 * 1024;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_MIN = 22;
const EOCD_SEARCH = 0xffff + EOCD_MIN;

export function looksLikeZip(data: Buffer): boolean {
  return data.length >= 4 && data.readUInt32LE(0) === 0x04034b50;
}

const unreadable = () => new EvidenceError("UNREADABLE", "The file is damaged or is not a valid Office document.");

/**
 * Reads a zip's central directory (just the index, nothing is unpacked) and refuses it when it lists too many
 * entries or would unpack to too much: a small upload can otherwise expand to gigabytes (a "zip bomb").
 * A header that understates the real size is caught later by the unzip library, which checks sizes as it reads.
 */
export function inspectZip(data: Buffer): { names: string[]; unpackedBytes: number } {
  let eocd = -1;
  const lowest = Math.max(0, data.length - EOCD_SEARCH);
  for (let i = data.length - EOCD_MIN; i >= lowest; i--) {
    if (data.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw unreadable();

  const entries = data.readUInt16LE(eocd + 10);
  const dirOffset = data.readUInt32LE(eocd + 16);
  if (entries === 0xffff || dirOffset === 0xffffffff) throw unreadable(); // zip64: far beyond our limits anyway
  if (entries > MAX_ZIP_ENTRIES) throw new EvidenceError("UNREADABLE", "The document contains too many parts to read safely.");

  const names: string[] = [];
  let unpackedBytes = 0;
  let pos = dirOffset;
  for (let n = 0; n < entries; n++) {
    if (pos + 46 > data.length || data.readUInt32LE(pos) !== CENTRAL_SIGNATURE) throw unreadable();
    unpackedBytes += data.readUInt32LE(pos + 24);
    if (unpackedBytes > MAX_UNPACKED_BYTES) {
      throw new EvidenceError("UNREADABLE", "The document would unpack to more than 100 MB, so it was refused.");
    }
    const nameLength = data.readUInt16LE(pos + 28);
    const extraLength = data.readUInt16LE(pos + 30);
    const commentLength = data.readUInt16LE(pos + 32);
    if (pos + 46 + nameLength > data.length) throw unreadable();
    names.push(data.toString("utf8", pos + 46, pos + 46 + nameLength));
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return { names, unpackedBytes };
}
