var tagDefs = require('./tags.js')

module.exports = TIFF

function TIFF (buff) {
  if (!(this instanceof TIFF)) return new TIFF(buff)
  this.buffer = buff
  this.ifds = []
  
  // parses tiff, populates this.ifds
  this.decode()    
}

TIFF.prototype.decode = function () {
  var self = this
  var offset = 0
  var littleEndian = false
  
  var ifdTypes = [
      null,             // 0
      [1, 'BYTE'],      // 1
      [1, 'ASCII'],     // 2
      [2, 'SHORT'],     // 3
      [4, 'LONG'],      // 4
      [8, 'RATIONAL'],  // 5
      [1, 'SBYTE'],     // 6
      [1, 'UNDEFINED'], // 7
      [2, 'SSHORT'],    // 8
      [4, 'SLONG'],     // 9
      [8, 'SRATIONAL'], // 10
      [4, 'FLOAT'],     // 11
      [8, 'DOUBLE']     // 12
  ]
  
  return decode()
  
  function decode () {
    decodeHeader()
    while (offset) {
      decodeIFD()
    }
  }
  
  function decodeHeader () {
    // Byte offset
    var value = readUInt16(offset)
    offset += 2
    if (value === 0x4949) {
      littleEndian = true
    } else if (value === 0x4D4D) {
      littleEndian = false
    } else {
      throw new Error('invalid byte order: 0x' + value.toString(16))
    }

    // Magic number
    value = readUInt16()
    offset += 2
    if (value !== 42) {
      throw new Error('not a TIFF file')
    }

    // Offset of the first IFD
    offset = readUInt32()
  }

  function decodeIFD () {
    var fields = {}
    var numEntries = readUInt16()
    offset += 2
    for (var i = 0; i < numEntries; i++) {
      decodeIFDEntry(fields)
    }
    offset = readUInt32()
    var ifd = new IFD(fields, littleEndian)
    self.ifds.push(ifd)
  }

  function decodeIFDEntry (fields) {
    var start = offset
    var tag = readUInt16()
    offset += 2
    var type = readUInt16()
    offset += 2
    var numValues = readUInt32()
    offset += 4

    if (type < 1 || type > 12) {
      return offset += 4 // unknown type, skip this value
    }

    var ifdType = ifdTypes[type]
    var valueByteLength = ifdType[0] * numValues
    if (valueByteLength > 4) {
      offset = readUInt32()
    }
    var value = self.buffer.slice(offset, offset + valueByteLength)
    fields[tag] = {type: ifdType, value: value}

    // go to the next entry
    offset = start + 12
  }

  function readUInt16 () {
    if (littleEndian) return self.buffer.readUInt16LE(offset)
    else return self.buffer.readUInt16BE(offset)
  }
  
  function readUInt32 () {
    if (littleEndian) return self.buffer.readUInt32LE(offset)
    else return self.buffer.readUInt32BE(offset)   
  }
}

function IFD (tags, littleEndian) {
  var self = this
  if (!(this instanceof IFD)) return new IFD(tags, littleEndian)
  var dateTimeRegex = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/
  
  this.tags = tags
  this.littleEndian = littleEndian || false
  this.fields = {}
  
  // IFD fields
  Object.keys(tagDefs).forEach(function (id) {
    var labels = tagDefs[id]
    var val = self.get(id)
    if (typeof val === 'undefined') return
    self.fields[labels[1]] = val
  })
}

IFD.prototype.get = function (key) {
  var tag = this.tags[key]
  if (!tag) return null
  var val = tag.value
  var type = tag.type[1]
  if (type === 'ASCII') return val.toString()
  if (type === 'SHORT') {
    if (this.littleEndian) return val.readUInt16LE(0)
    else return val.readUInt16BE(0)
  }
  if (type === 'SSHORT') {
    if (this.littleEndian) return val.readInt16LE(0)
    else return val.readInt16BE(0)
  }
  if (type === 'LONG') {
    if (this.littleEndian) return val.readUInt32LE(0)
    else return val.readUInt32BE(0)
  }
  if (type === 'SLONG') {
    if (this.littleEndian) return val.readInt32LE(0)
    else return val.readInt32BE(0)
  }
  if (type === 'RATIONAL') {
    if (this.littleEndian) return [val.readUInt32LE(0), val.readUInt32LE(4)]
    else return [val.readUInt32BE(0), val.readUInt32BE(4)]
  }
  if (type === 'SRATIONAL') {
    if (this.littleEndian) return [val.readInt32LE(0), val.readInt32LE(4)]
    else return [val.readInt32BE(0), val.readInt32BE(4)]
  }
  if (type === 'FLOAT') {
    if (this.littleEndian) return val.readFloat32LE(0)
    else return val.readFloat32BE(0)
  }
  if (type === 'DOUBLE') {
    if (this.littleEndian) return [val.readFloat32LE(0), val.readFloat32LE(4)]
    else return [val.readFloat32BE(0), val.readFloat32BE(4)]
  }
  return val
}

IFD.prototype.date = function () {
  var date = new Date()
  var result = dateTimeRegex.exec(this.fields.DateTime)
  date.setFullYear(result[1], result[2] - 1, result[3])
  date.setHours(result[4], result[5], result[6])
  return date
}

IFD.prototype.jpg = function () {
  return this.fields.NewSubfileType === 1 
      && this.fields.Compression === 7
}

IFD.prototype.rgb = function () {
  return this.fields.NewSubfileType === 1
      && this.fields.Compression === 1
      && (this.fields.ImageLength * this.fields.ImageWidth * this.fields.StripByteCounts) === 3
}

IFD.prototype.rgba = function () {
  return this.fields.NewSubfileType === 1
      && this.fields.Compression === 1
      && (this.fields.ImageLength * this.fields.ImageWidth * this.fields.StripByteCounts) === 4
}

IFD.prototype.raw = function () {
  return this.fields.NewSubfileType == 0
      && this.fields.Compression == 7
      || this.fields.NewSubfileType == 0
      && this.fields.Compression == 1
}
