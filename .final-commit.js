const {execSync} = require('child_process');
const cwd = '/Users/adrienbeyondcrypto/Dev/hearst-os';

try {
  console.log('=== Adding all changes ===');
  execSync('git add -A', {cwd, stdio: 'inherit'});
  
  console.log('\n=== Committing ===');
  const msg = `feat(ui): right panel navigation + code cleanup

- Add clickable assets/missions in right panel
- Remove unused icons (CategoryRailIcon, GhostIconChevronDown, GhostIconMinus)
- Fix React Compiler useCallback dependencies (use session instead of userEmail)
- Fix <img> element warnings with eslint-disable
- Clean dead code in tests and components
- Fix assets page hydration error (nested buttons)`;
  
  execSync(`git commit -m "${msg}"`, {cwd, stdio: 'inherit'});
  
  console.log('\n=== Pushing ===');
  execSync('git push', {cwd, stdio: 'inherit'});
  
  console.log('\n✅ Done!');
} catch(e) {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
}
