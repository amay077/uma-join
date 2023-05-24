const Mustache = require('mustache');
const fs = require('fs');
const dayjs = require('dayjs');

function rp(files, releaseDate) {
  console.log(`${this.constructor.name}: rp -> files, releaseDate`, files, releaseDate);
  Mustache.tags = ['<%=', '%>'];

  for (const file of files) {
    const param = {
      RELEASE_DATE: releaseDate,
    };
    console.log(`${this.constructor.name}: rp -> releaseDate`, releaseDate);

    var result = Mustache.render(fs.readFileSync(file, 'utf-8'), param);
    console.log(`${this.constructor.name}: rp -> result`, result);
    fs.writeFileSync(file + '.replaced', result);
    fs.renameSync(file, file + '.org');
    fs.renameSync(file + '.replaced', file);

    console.log(`replaced file - ${file}, original file - ${file + '.org'}`);
  }
}

console.log('#### START PREBUILD ####');

const releaseDate = dayjs().format('YYYYMMDDHHmm');
console.log(`release date - ${releaseDate}`);

rp([
  './src/index.html',
  './src/version.json',
], releaseDate);

console.log('#### END PREBUILD ####');
