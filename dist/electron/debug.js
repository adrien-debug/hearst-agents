const e = require("electron");
console.log("type:", typeof e);
console.log("val:", typeof e === 'string' ? 'STRING:' + e.slice(0, 40) : Object.keys(e).join(','));
process.exit(0);
