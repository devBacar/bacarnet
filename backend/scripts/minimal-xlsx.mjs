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

function zipStore(name, data) {
  const nameBuf = Buffer.from(name, 'utf8')
  const local = Buffer.alloc(30 + nameBuf.length)
  writeU32LE(local, 0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0, 6)
  local.writeUInt16LE(0, 8)
  local.writeUInt16LE(0, 10)
  local.writeUInt16LE(0, 12)
  writeU32LE(local, crc32(data), 14)
  writeU32LE(local, data.length, 18)
  writeU32LE(local, data.length, 22)
  writeU32LE(local, nameBuf.length, 26)
  local.writeUInt16LE(0, 28)
  nameBuf.copy(local, 30)

  const central = Buffer.alloc(46 + nameBuf.length)
  writeU32LE(central, 0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0, 8)
  central.writeUInt16LE(0, 10)
  central.writeUInt16LE(0, 12)
  central.writeUInt16LE(0, 14)
  writeU32LE(central, crc32(data), 16)
  writeU32LE(central, data.length, 20)
  writeU32LE(central, data.length, 24)
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

  return Buffer.concat([local, data, central, end])
}

/** XLSX mínimo válido con celda A1 = "test". */
export function minimalXlsxBuffer() {
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>'
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>'
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'
  const wbRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>'
  const sheet =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>test</t></is></c></row></sheetData></worksheet>'

  return Buffer.concat([
    zipEntry('[Content_Types].xml', Buffer.from(contentTypes)),
    zipEntry('_rels/.rels', Buffer.from(rels)),
    zipEntry('xl/workbook.xml', Buffer.from(workbook)),
    zipEntry('xl/_rels/workbook.xml.rels', Buffer.from(wbRels)),
    zipEntry('xl/worksheets/sheet1.xml', Buffer.from(sheet)),
  ])
}

export { zipEntry, zipStore }
