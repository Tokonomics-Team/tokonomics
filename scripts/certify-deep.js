'use strict';

// Deep mode uses the same evidence-derived runner. It adds the controlled synthetic
// validation command as a non-release gate and keeps all provenance/limitations intact.
process.argv.push('--deep');
require('./certify');
