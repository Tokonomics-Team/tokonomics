'use strict';

// Runs the exact-artifact host matrix. It never publishes and always leaves the final
// release decision to a human reviewer of the generated evidence.
process.argv.push('--release');
require('./certify');
