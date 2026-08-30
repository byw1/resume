import { deflateRawSync } from "node:zlib";

/**
 * A zip file, written by hand.
 *
 * Claude's apps install a skill by taking a zip of its folder, so handing over a
 * bare SKILL.md means the person has to make a directory and compress it
 * themselves before the upload will accept it. That is the whole reason this
 * exists — and it is not worth a dependency. Two headers and a trailer, which is
 * all a zip is when you are writing a handful of small text files into one.
 *
 * Entries are stored with deflate and a fixed 1980-01-01 timestamp, so the same
 * skill always produces byte-identical bytes. A download that changes every time
 * you fetch it is a download nobody can check.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS date/time for 1980-01-01 00:00, the earliest the format can express. */
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;

export type ZipEntry = { path: string; contents: string };

export function zip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, "utf8");
    const raw = Buffer.from(entry.contents, "utf8");
    const deflated = deflateRawSync(raw);
    // Deflate can be larger than the input on tiny or already-dense files, in
    // which case the honest thing is to store it uncompressed.
    const stored = deflated.length >= raw.length;
    const body = stored ? raw : deflated;
    const method = stored ? 0 : 8;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    locals.push(local, name, body);

    const entryHeader = Buffer.alloc(46);
    entryHeader.writeUInt32LE(CENTRAL_HEADER, 0);
    entryHeader.writeUInt16LE(20, 4); // version made by
    entryHeader.writeUInt16LE(20, 6); // version needed
    entryHeader.writeUInt16LE(0, 8); // flags
    entryHeader.writeUInt16LE(method, 10);
    entryHeader.writeUInt16LE(DOS_TIME, 12);
    entryHeader.writeUInt16LE(DOS_DATE, 14);
    entryHeader.writeUInt32LE(crc, 16);
    entryHeader.writeUInt32LE(body.length, 20);
    entryHeader.writeUInt32LE(raw.length, 24);
    entryHeader.writeUInt16LE(name.length, 28);
    entryHeader.writeUInt16LE(0, 30); // extra
    entryHeader.writeUInt16LE(0, 32); // comment
    entryHeader.writeUInt16LE(0, 34); // disk number
    entryHeader.writeUInt16LE(0, 36); // internal attributes
    // A regular file, 0644. Shifted into the high half, then forced unsigned —
    // `<< 16` alone overflows into a negative signed int and Buffer rejects it.
    entryHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    entryHeader.writeUInt32LE(offset, 42);
    central.push(entryHeader, name);

    offset += local.length + name.length + body.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL, 0);
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with the directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...locals, directory, end]);
}
