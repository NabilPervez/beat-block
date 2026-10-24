// Writes public/icon-192.png and icon-512.png with a tiny PNG encoder (no image deps).
// Same art as public/icon.svg: four tiles + sweep line on the navy ground. Solid fills only.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function icon(size) {
  const u = size / 64;
  const rects = [ // [x, y, w, h, colour] in the 64-unit svg space; later wins
    [0, 0, 64, 64, "#05080f"],
    [14, 14, 17, 17, "#20D9F4"], [33, 14, 17, 17, "#FF4FA3"],
    [14, 33, 17, 17, "#FF4FA3"], [33, 33, 17, 17, "#20D9F4"],
    [41, 10, 3, 44, "#ffffff"],
  ].map(([x, y, w, h, c]) => [x * u, y * u, (x + w) * u, (y + h) * u, hex(c)]);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let col = rects[0][4];
      for (const [x0, y0, x1, y1, c] of rects) if (x + 0.5 >= x0 && x + 0.5 < x1 && y + 0.5 >= y0 && y + 0.5 < y1) col = c;
      raw.set(col, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

for (const s of [192, 512]) writeFileSync(new URL(`../public/icon-${s}.png`, import.meta.url), icon(s));
console.log("icons written");
