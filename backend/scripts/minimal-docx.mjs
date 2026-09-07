import { deflateRawSync } from 'node:zlib'

function writeU32LE(buf, value, offset) {
  buf.writeUInt32LE(value, offset)
}

function crc32(buf) {
  let crc = ~0
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i]
    for (let k = 0; k < 8; k += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return ~crc >>> 0
}

function zipEntry(name, data) {
  const nameBuf = Buffer.from(name, 'utf8')
  const compressed = deflateRawSync(data)
  const local = Buffer.alloc(30 + nameBuf.length)
  writeU32LE(local, 0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0, 6)
  local.writeUInt16LE(8, 8)
  local.writeUInt16LE(0, 10)
  local.writeUInt16LE(0, 12)
  writeU32LE(local, crc32(data), 14)
  writeU32LE(local, data.length, 18)
  writeU32LE(local, compressed.length, 22)
  writeU32LE(local, nameBuf.length, 26)
  local.writeUInt16LE(0, 28)
  nameBuf.copy(local, 30)

  const central = Buffer.alloc(46 + nameBuf.length)
  writeU32LE(central, 0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0, 8)
  central.writeUInt16LE(8, 10)
  central.writeUInt16LE(0, 12)
  central.writeUInt16LE(0, 14)
  writeU32LE(central, crc32(data), 16)
  writeU32LE(central, data.length, 20)
  writeU32LE(central, compressed.length, 24)
  writeU32LE(central, nameBuf.length, 28)
  writeU32LE(central, 0, 32)
  writeU32LE(central, 0, 36)
  writeU32LE(central, 0, 40)
  central.writeUInt16LE(0, 42)
  nameBuf.copy(central, 46)

  const end = Buffer.alloc(22)
  writeU32LE(end, 0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  writeU32LE(end, central.length, 12)
  writeU32LE(end, 30 + nameBuf.length, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([local, compressed, central, end])
}

/** DOCX mínimo válido para pruebas (Office Open XML). */
export function minimalDocxBuffer() {
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>'
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>'
  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body><w:p><w:r><w:t>test</w:t></w:r></w:p></w:body></w:document>'
  const docRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'

  return Buffer.concat([
    zipEntry('[Content_Types].xml', Buffer.from(contentTypes)),
    zipEntry('_rels/.rels', Buffer.from(rels)),
    zipEntry('word/document.xml', Buffer.from(document)),
    zipEntry('word/_rels/document.xml.rels', Buffer.from(docRels)),
  ])
}
