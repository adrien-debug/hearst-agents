const {execSync} = require('child_process');
const cwd = '/Users/adrienbeyondcrypto/Dev/hearst-os';

try {
  // Stage
  console.log('Staging...');
  execSync('git add -A', {cwd, stdio: 'inherit'});
  
  // Commit
  console.log('Committing...');
  const msg = `feat(ui): right panel navigation + code cleanup

- Add clickable assets/missions in right panel
- Remove unused icons (CategoryRailIcon, GhostIconChevronDown, GhostIconMinus)
- Fix React Compiler useCallback dependencies
- Fix <img> element warnings with eslint-disable
- Clean dead code in tests and components
- Fix assets page hydration error (nested buttons)`;
  
  execSync(`git commit -m "${msg}"`, {cwd, stdio: 'inherit'});
  
  // Push
  console.log('Pushing...');
  execSync('git push', {cwd, stdio: 'inherit'});
  
  console.log('Done!');
} catch(e) {
  console.error('Error:', e.message);
}
