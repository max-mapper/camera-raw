var IFD = require('../lib/ifd.js')

module.exports = function (buff) {
  var offset = 0
  var littleEndian = false
  var tiff = {ifd: []}
  
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
    return tiff
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
    var ifd = new IFD()
    tiff.ifd.push(ifd)
    var numEntries = readUInt16()
    offset += 2
    for (var i = 0; i < numEntries; i++) {
      decodeIFDEntry(ifd)
    }
    offset = readUInt32()
  }

  function decodeIFDEntry (ifd) {
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
    var value = buff.slice(offset, offset + valueByteLength)
    ifd.fields.set(tag, {type: ifdType, value: value})

    // go to the next entry
    offset = start + 12
  }

  // function decodeImageData(ifd) {
  //   console.log('ifd', ifd)
  //   var orientation = ifd.orientation;
  //   if (orientation && orientation !== 1) {
  //     unsupported('orientation', orientation);
  //   }
  //   switch(ifd.type) {
  //     case 1: // BlackIsZero
  //       this.decodeBilevelOrGrey(ifd);
  //       break;
  //     default:
  //       unsupported('image type', ifd.type);
  //       break;
  //   }
  // }
  
  function readUInt16 () {
    if (littleEndian) return buff.readUInt16LE(offset)
    else return buff.readUInt16BE(offset)
  }
  
  function readUInt32 () {
    if (littleEndian) return buff.readUInt32LE(offset)
    else return buff.readUInt32BE(offset)   
  }
}