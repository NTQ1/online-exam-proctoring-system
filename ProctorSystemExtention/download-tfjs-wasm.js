const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE = 'https://cdn.jsdelivr.net/npm';
const VER = '4.22.0';
const OUT = 'src/lib';
fs.mkdirSync(OUT, { recursive: true });

const files = [
  ['@tensorflow/tfjs-core@' + VER + '/dist/tf-core.min.js',          'tf-core.min.js'],
  ['@tensorflow/tfjs-converter@' + VER + '/dist/tf-converter.min.js', 'tf-converter.min.js'],
  ['@tensorflow/tfjs-backend-wasm@' + VER + '/dist/tf-backend-wasm.min.js', 'tf-backend-wasm.min.js'],
  ['@tensorflow/tfjs-backend-wasm@' + VER + '/dist/tfjs-backend-wasm.wasm',  'tfjs-backend-wasm.wasm'],
];

let done = 0;
files.forEach(function(pair) {
  const pkg = pair[0], name = pair[1];
  const url = BASE + '/' + pkg;
  const dest = path.join(OUT, name);
  const file = fs.createWriteStream(dest);
  https.get(url, function(res) {
    res.pipe(file);
    file.on('finish', function() {
      file.close();
      const kb = Math.round(fs.statSync(dest).size / 1024);
      console.log('OK ' + name + ' ' + kb + 'KB');
      if (++done === files.length) console.log('All done');
    });
  }).on('error', function(e) { console.error('ERR ' + name + ' ' + e.message); });
});
