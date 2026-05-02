// Test minimal — plain JS, pas de TypeScript compilation
const electron = require("electron");
console.log("typeof electron:", typeof electron);
console.log("value:", typeof electron === 'string' ? electron.slice(0, 50) : JSON.stringify(Object.keys(electron)));
