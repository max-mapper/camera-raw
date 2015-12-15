var TIFF = require('../lib/tiff.js')

module.exports = function (buff) {
  return new TIFF(buff)
}