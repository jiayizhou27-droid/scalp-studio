const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('app.js','utf8').split('\n').find(l=>l.startsWith('function endpoint()'));
let value='';const sandbox={URL,$:()=>({value})};vm.createContext(sandbox);vm.runInContext(source,sandbox);
for(const input of ['', '   ', 'example.com', 'https://', 'http://example.com', 'ftp://example.com', 'https://jiayizhou27-droid.github.io/scalp-studio/', 'https://example.com/?key=secret']){value=input;assert.throws(()=>sandbox.endpoint(),e=>!e.message.includes('Invalid URL'));}
for(const [input,expected] of [['https://example.com/','https://example.com'],['http://127.0.0.1:8000/','http://127.0.0.1:8000'],['https://example.com/api/','https://example.com/api']]){value=input;assert.equal(sandbox.endpoint(),expected);}
console.log('PASS: service URL validation (11 cases).');
