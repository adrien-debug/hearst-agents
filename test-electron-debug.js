// Test avec app.whenReady
console.log("process.type:", process.type);
console.log("process.versions.electron:", process.versions.electron);

const e = require("electron");
console.log("require electron type:", typeof e);

if (typeof e === 'object' && e !== null) {
  console.log("app:", typeof e.app);
} else {
  // Try process.atomBinding or _linkedBinding
  try {
    const api = process._linkedBinding('electron_browser_app');
    console.log("_linkedBinding app:", typeof api);
  } catch(err) {
    console.log("_linkedBinding error:", err.message);
  }
}
setTimeout(() => process.exit(0), 100);
