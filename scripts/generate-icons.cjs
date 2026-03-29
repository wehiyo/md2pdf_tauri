const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, '..', 'src-tauri', 'icons');

// 创建简单的 32x32 PNG 图标（蓝色方块）
function createSimplePNG(width, height) {
  // PNG 文件签名
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR 块
  const ihdr = createChunk('IHDR', Buffer.from([
    width >> 24, width >> 16 & 0xFF, width >> 8 & 0xFF, width & 0xFF,  // width
    height >> 24, height >> 16 & 0xFF, height >> 8 & 0xFF, height & 0xFF,  // height
    0x08,  // bit depth
    0x02,  // color type (RGB)
    0x00,  // compression
    0x00,  // filter
    0x00   // interlace
  ]));

  // IDAT 块（图像数据）- 简单的蓝色
  const pixelData = Buffer.alloc(width * height * 3 + height);
  for (let y = 0; y < height; y++) {
    pixelData[y * (width * 3 + 1)] = 0x00;  // filter byte
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      pixelData[offset] = 0x3B;     // R
      pixelData[offset + 1] = 0x82; // G
      pixelData[offset + 2] = 0xF6; // B (蓝色主题)
    }
  }

  // 压缩数据（简单起见，使用无压缩）
  const compressed = require('zlib').deflateSync(pixelData);
  const idat = createChunk('IDAT', compressed);

  // IEND 块
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.concat([typeBuffer, data]);
  const crc = require('zlib').crc32(crcBuffer);
  const crcOut = Buffer.alloc(4);
  crcOut.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcOut]);
}

// 创建 ICO 文件
function createICO() {
  const png32 = createSimplePNG(32, 32);
  const png128 = createSimplePNG(128, 128);

  // ICO 文件头
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);  // reserved
  header.writeUInt16LE(1, 2);  // type (icon)
  header.writeUInt16LE(2, 4);  // count

  // ICO 目录项
  const dir1 = Buffer.alloc(16);
  dir1.writeUInt8(32, 0);      // width
  dir1.writeUInt8(32, 1);      // height
  dir1.writeUInt8(0, 2);       // colors
  dir1.writeUInt8(0, 3);       // reserved
  dir1.writeUInt16LE(1, 4);    // color planes
  dir1.writeUInt16LE(32, 6);   // bits per pixel
  dir1.writeUInt32LE(png32.length, 8);  // size
  dir1.writeUInt32LE(6 + 32, 12);  // offset

  const dir2 = Buffer.alloc(16);
  dir2.writeUInt8(128, 0);     // width
  dir2.writeUInt8(128, 1);     // height
  dir2.writeUInt8(0, 2);       // colors
  dir2.writeUInt8(0, 3);       // reserved
  dir2.writeUInt16LE(1, 4);    // color planes
  dir2.writeUInt16LE(32, 6);   // bits per pixel
  dir2.writeUInt32LE(png128.length, 8);  // size
  dir2.writeUInt32LE(6 + 32 + png32.length, 12);  // offset

  return Buffer.concat([header, dir1, dir2, png32, png128]);
}

// 创建 ICNS 文件 (macOS)
function createICNS() {
  const png128 = createSimplePNG(128, 128);

  // ICNS 文件头
  const header = Buffer.alloc(4);
  header.writeUInt32BE('icns'.charCodeAt(0) << 24 | 'icns'.charCodeAt(1) << 16 | 'icns'.charCodeAt(2) << 8 | 'icns'.charCodeAt(3), 0);

  // 数据块
  const icp4 = createICNSChunk('icp4', createSimplePNG(16, 16));
  const icp5 = createICNSChunk('icp5', createSimplePNG(32, 32));
  const ic07 = createICNSChunk('ic07', png128);

  const data = Buffer.concat([icp4, icp5, ic07]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(4 + 4 + data.length, 0);

  return Buffer.concat([header, size, data]);
}

function createICNSChunk(type, data) {
  const typeBuf = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(4 + 4 + data.length, 0);
  return Buffer.concat([typeBuf, size, data]);
}

// 生成所有图标
console.log('Generating icons...');

// icon.ico
fs.writeFileSync(path.join(iconsDir, 'icon.ico'), createICO());

// icon.icns
fs.writeFileSync(path.join(iconsDir, 'icon.icns'), createICNS());

// PNG icons
fs.writeFileSync(path.join(iconsDir, '32x32.png'), createSimplePNG(32, 32));
fs.writeFileSync(path.join(iconsDir, '128x128.png'), createSimplePNG(128, 128));
fs.writeFileSync(path.join(iconsDir, '128x128@2x.png'), createSimplePNG(256, 256));

console.log('Icons generated successfully!');
