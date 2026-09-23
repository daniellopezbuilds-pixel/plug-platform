// Builds the logo assets the app uses from the source artwork.
//
//   node scripts/build-brand-assets.mjs
//
// SOURCE: public/sparxplug.jpeg — 1280x1280, a white mark and "SPARX PLUG"
// wordmark on solid black, with heavy padding round both.
//
// OUTPUTS
//   public/brand/sparxplug-lockup.png    mark over wordmark, cropped tight
//   public/brand/sparxplug-mark.png      the mark alone
//   public/brand/sparxplug-wordmark.png  "SPARX PLUG" alone
//   app/icon.png, app/apple-icon.png, app/favicon.ico
//
// WHY TRANSPARENT, not the black square. The sidebar and the auth pages sit on
// .grid-bg — a faint grid over a radial gradient — and the auth pages add
// orange and magenta washes. A black JPEG would show as a flat square cut out
// of that texture. The artwork is pure white on black, so its brightness IS
// its coverage: each pixel becomes white with alpha = luminance. Edges keep
// their antialiasing, and the JPEG ringing on flat black — faint grey noise —
// is clamped to zero alpha by the levels step below.
//
// WHY THE ICONS ARE NOT TRANSPARENT. A white mark on a transparent favicon
// disappears on a light browser tab. The icons keep a black square, which
// reads on light and dark tabs alike, and Apple requires an opaque icon.
//
// Crop boxes were measured from the source by scanning for lit pixels:
//   mark      x 271-968, y 287-995
//   wordmark  x 396-874, y 1050-1097
// Re-measure if the artwork changes.
import sharp from "sharp";
import { mkdirSync, writeFileSync, statSync } from "node:fs";

const SRC = "public/sparxplug.jpeg";
const MARK = { left: 271, top: 287, width: 698, height: 709 };
const WORD = { left: 396, top: 1050, width: 479, height: 48 };
const LOCKUP = { left: 271, top: 287, width: 698, height: 1097 - 287 + 1 };

/** Below LOW is background, above HIGH is ink; between is antialiasing. */
const LOW = 40;
const HIGH = 215;

/** Greyscale coverage for a region, with JPEG noise clamped away. */
async function coverage(box, pad) {
  const { data, info } = await sharp(SRC)
    .extract({
      left: box.left - pad,
      top: box.top - pad,
      width: box.width + pad * 2,
      height: box.height + pad * 2,
    })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    data[i] = v <= LOW ? 0 : v >= HIGH ? 255 : Math.round(((v - LOW) / (HIGH - LOW)) * 255);
  }
  return { data, width: info.width, height: info.height };
}

/** White ink with alpha from coverage: transparent wherever the source was black. */
async function transparentPng(box, pad, out) {
  const { data, width, height } = await coverage(box, pad);
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i++) {
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = data[i];
  }
  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, palette: true, colors: 32, dither: 0 })
    .toFile(out);
  return { width, height };
}

/**
 * The mark centred on a black square, the mark filling `fill` of it.
 *
 * `rgba` for images going inside the .ico: Next decodes favicon.ico at build
 * time and refuses embedded PNGs that are not RGBA ("The PNG is not in RGBA
 * format"), so those skip the palette and carry an alpha channel.
 */
async function iconPng(size, fill, { rgba = false } = {}) {
  const { data, width, height } = await coverage(MARK, 0);
  const inner = Math.round(size * fill);
  const mark = await sharp(data, { raw: { width, height, channels: 1 } })
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0 } })
    .toColourspace("srgb")
    .png()
    .toBuffer();
  const square = sharp({ create: { width: size, height: size, channels: 3, background: "#000000" } })
    .composite([{ input: mark, gravity: "centre" }]);
  return rgba
    ? square.ensureAlpha().png({ compressionLevel: 9 }).toBuffer()
    : square.png({ compressionLevel: 9, palette: true, colors: 32 }).toBuffer();
}

/** A .ico holding PNG images — supported by every current browser. */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]);
}

mkdirSync("public/brand", { recursive: true });

const sizes = {};
sizes.lockup = await transparentPng(LOCKUP, 12, "public/brand/sparxplug-lockup.png");
sizes.mark = await transparentPng(MARK, 8, "public/brand/sparxplug-mark.png");
sizes.wordmark = await transparentPng(WORD, 4, "public/brand/sparxplug-wordmark.png");

writeFileSync("app/icon.png", await iconPng(512, 0.8));
writeFileSync("app/apple-icon.png", await iconPng(180, 0.72));
// Small sizes fill more of the square: at 16px every pixel of mark counts.
writeFileSync(
  "app/favicon.ico",
  ico([
    { size: 16, buf: await iconPng(16, 0.94, { rgba: true }) },
    { size: 32, buf: await iconPng(32, 0.9, { rgba: true }) },
    { size: 48, buf: await iconPng(48, 0.86, { rgba: true }) },
  ])
);

for (const f of [
  "public/sparxplug.jpeg",
  "public/brand/sparxplug-lockup.png",
  "public/brand/sparxplug-mark.png",
  "public/brand/sparxplug-wordmark.png",
  "app/icon.png",
  "app/apple-icon.png",
  "app/favicon.ico",
]) {
  console.log(`${f.padEnd(38)} ${String(statSync(f).size).padStart(7)} bytes`);
}
console.log("dimensions:", JSON.stringify(sizes));
