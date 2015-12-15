var tagDefs = require('./tags.js')
var ifdTypes = require('./ifdtypes.js')

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
  var littleEndian = false
  
  var offset = decodeHeader()
  while (offset) {
    var ifd = new IFD(littleEndian)
    offset = ifd.decode(self.buffer, offset)
    this.ifds.push(ifd)
  }

  function decodeHeader () {
    var offset = 0
    // Byte offset
    var value = readUInt16(self.buffer, offset, littleEndian)
    offset += 2
    if (value === 0x4949) {
      littleEndian = true
    } else if (value === 0x4D4D) {
      littleEndian = false
    } else {
      throw new Error('invalid byte order: 0x' + value.toString(16))
    }

    // Magic number
    value = readUInt16(self.buffer, offset, littleEndian)
    offset += 2
    if (value !== 42) {
      throw new Error('not a TIFF file')
    }

    // Offset of the first IFD
    return readUInt32(self.buffer, offset, littleEndian)
  }
}

function IFD (littleEndian) {
  var self = this
  if (!(this instanceof IFD)) return new IFD(littleEndian)
  var dateTimeRegex = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/
  this.littleEndian = littleEndian || false
  this.subIfds = []
}

IFD.prototype.decode = function (buffer, offset) {
  var self = this
  this.tags = {}
  var numEntries = readUInt16(buffer, offset, this.littleEndian)
  offset += 2
  for (var i = 0; i < numEntries; i++) {
    offset = this.decodeEntry(buffer, offset)
  }
  offset = readUInt32(buffer, offset, this.littleEndian)

  this.fields = {}

  Object.keys(tagDefs).forEach(function (id) {
    var labels = tagDefs[id]
    var val = self.get(id)
    if (typeof val === 'undefined' || val === null) return
    self.fields[labels[1]] = val
  })

  var subIfds = this.tags[330]
  var subOffset = this.get(330)
  if (subOffset) {
    var ifd = new IFD(this.littleEndian)
    subOffset = ifd.decode(buffer, subOffset)
    this.subIfds.push(ifd)
  }

  return offset
}

IFD.prototype.decodeEntry = function (buffer, offset) {
  var start = offset
  var tag = readUInt16(buffer, offset, this.littleEndian)
  offset += 2
  var type = readUInt16(buffer, offset, this.littleEndian)
  offset += 2
  var numValues = readUInt32(buffer, offset, this.littleEndian)
  offset += 4

  if (type < 1 || type > 12) {
    return offset += 4 // unknown type, skip this value
  }

  var ifdType = ifdTypes[type]
  var valueByteLength = ifdType[0] * numValues
  if (valueByteLength > 4) {
    offset = readUInt32(buffer, offset, this.littleEndian)
  }
  var value = buffer.slice(offset, offset + valueByteLength)
  this.tags[tag] = {type: ifdType, value: value, num: numValues}

  // go to the next entry
  return start + 12
}

IFD.prototype.get = function (key) {
  var tag = this.tags[key]
  if (!tag) return null
  var val = tag.value
  var type = tag.type[1]
  return this.convertValue(type, val)
}

IFD.prototype.convertValue = function (type, val) {
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

function readUInt16 (buffer, offset, littleEndian) {
  if (littleEndian) return buffer.readUInt16LE(offset)
  else return buffer.readUInt16BE(offset)
}

function readUInt32 (buffer, offset, littleEndian) {
  if (littleEndian) return buffer.readUInt32LE(offset)
  else return buffer.readUInt32BE(offset)   
}