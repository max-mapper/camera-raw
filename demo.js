var raw = require('./index.js')
var drop = require('drag-and-drop-files')
var fileReaderStream = require('filereader-stream')
var concat = require('concat-stream')

drop(document.body.querySelector('div'), function(files) {
  var first = files[0]
  var reader = fileReaderStream(first)
  reader.pipe(concat(function (data) {
    window.foo = raw().arw(data)
  }))
})
