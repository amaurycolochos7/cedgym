/**
 * Patch whatsapp-web.js Client.js to disable the broken Error constructor override.
 *
 * The "ocVersion" patch in Client.js replaces the global Error constructor with a
 * modified version that appends a fake stack trace. This was designed to bypass
 * WhatsApp's "isOfficialClient" detection for older WA Web versions.
 *
 * On modern WhatsApp Web (2025+), this override prevents window.Debug.VERSION from
 * ever being set, causing client.initialize() to hang with "auth timeout".
 *
 * AB test results:
 *   - WITH Error patch:    Debug.VERSION NEVER appears (tested 60s)
 *   - WITHOUT Error patch: Debug.VERSION appears in 2s
 */
const fs = require('fs');
const path = require('path');

const clientPath = path.join(__dirname, 'node_modules', 'whatsapp-web.js', 'src', 'Client.js');

if (!fs.existsSync(clientPath)) {
    console.log('⚠️ Client.js not found, skipping patch');
    process.exit(0);
}

let code = fs.readFileSync(clientPath, 'utf-8');

// Find the ocVersion block: starts with "// ocVersion" comment and ends with closing ");"
const marker = '// ocVersion';
const idx = code.indexOf(marker);

if (idx === -1) {
    console.log('⚠️ ocVersion marker not found, skipping patch');
    process.exit(0);
}

// Find the evaluateOnNewDocument call that contains the Error override
// The block looks like:
//   await page.evaluateOnNewDocument(() => {
//       window.originalError = Error;
//       ...
//   });
const evalStart = code.indexOf('await page.evaluateOnNewDocument(() => {', idx);
if (evalStart === -1 || evalStart > idx + 500) {
    console.log('⚠️ evaluateOnNewDocument block not found near ocVersion, skipping patch');
    process.exit(0);
}

// Find the closing "});" for this evaluateOnNewDocument call
const evalEnd = code.indexOf('});', evalStart + 40);
if (evalEnd === -1) {
    console.log('⚠️ Could not find end of evaluateOnNewDocument block, skipping patch');
    process.exit(0);
}

const blockToReplace = code.substring(evalStart, evalEnd + 3);
const replacement = `/* PATCHED: Disabled Error constructor override - breaks modern WA Web (2025+)
${blockToReplace.split('\n').map(l => ' * ' + l).join('\n')}
 */`;

code = code.substring(0, evalStart) + replacement + code.substring(evalEnd + 3);

fs.writeFileSync(clientPath, code, 'utf-8');
console.log('✅ Patched Client.js: disabled ocVersion Error override');
