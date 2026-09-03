'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yauzl = require('yauzl');

const DEFAULT_LIMITS = Object.freeze({ maxEntries: 4096, maxEntryBytes: 32 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024, maxCompressionRatio: 250 });

function sha256(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

function validateEntry(entry, limits) {
    const name = entry.fileName;
    if (!name || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw new Error(`Unsafe VSIX entry path: ${name}`);
    const segments = name.split('/');
    if (segments.some(segment => segment === '..' || segment === '.')) throw new Error(`Non-canonical VSIX entry path: ${name}`);
    if ((entry.generalPurposeBitFlag & 0x1) !== 0) throw new Error(`Encrypted VSIX entry is not allowed: ${name}`);
    const unixMode = (entry.externalFileAttributes >>> 16) & 0o170000;
    if (unixMode === 0o120000) throw new Error(`Symbolic links are not allowed in VSIX: ${name}`);
    if (entry.uncompressedSize > limits.maxEntryBytes) throw new Error(`VSIX entry exceeds size limit: ${name}`);
    const ratio = entry.compressedSize === 0 ? entry.uncompressedSize : entry.uncompressedSize / entry.compressedSize;
    if (ratio > limits.maxCompressionRatio) throw new Error(`Suspicious VSIX compression ratio: ${name}`);
}

function readStream(zip, entry) {
    return new Promise((resolve, reject) => zip.openReadStream(entry, (error, stream) => {
        if (error) return reject(error);
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.once('error', reject);
        stream.once('end', () => resolve(Buffer.concat(chunks)));
    }));
}

async function inspectVsix(artifactPath, customLimits = {}) {
    const limits = { ...DEFAULT_LIMITS, ...customLimits };
    if (!fs.existsSync(artifactPath)) throw new Error(`VSIX artifact not found: ${artifactPath}`);
    const entries = new Map();
    const caseInsensitiveNames = new Set();
    let totalBytes = 0;
    await new Promise((resolve, reject) => {
        yauzl.open(artifactPath, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (openError, zip) => {
            if (openError) return reject(openError);
            let settled = false;
            const fail = error => {
                if (settled) return;
                settled = true;
                try { zip.close(); } catch {}
                reject(error);
            };
            zip.once('error', fail);
            zip.on('entry', async entry => {
                try {
                    validateEntry(entry, limits);
                    const canonical = entry.fileName.toLowerCase();
                    if (caseInsensitiveNames.has(canonical)) throw new Error(`Duplicate VSIX entry: ${entry.fileName}`);
                    caseInsensitiveNames.add(canonical);
                    if (caseInsensitiveNames.size > limits.maxEntries) throw new Error('VSIX entry-count limit exceeded.');
                    totalBytes += entry.uncompressedSize;
                    if (totalBytes > limits.maxTotalBytes) throw new Error('VSIX uncompressed-size limit exceeded.');
                    if (!entry.fileName.endsWith('/')) {
                        const bytes = await readStream(zip, entry);
                        entries.set(entry.fileName, Object.freeze({
                            name: entry.fileName,
                            sizeBytes: bytes.length,
                            compressedSizeBytes: entry.compressedSize,
                            sha256: sha256(bytes),
                            bytes
                        }));
                    }
                    zip.readEntry();
                } catch (error) { fail(error); }
            });
            zip.once('end', () => {
                if (settled) return;
                settled = true;
                resolve();
            });
            zip.readEntry();
        });
    });
    return Object.freeze({
        path: path.resolve(artifactPath),
        sizeBytes: fs.statSync(artifactPath).size,
        sha256: sha256(fs.readFileSync(artifactPath)),
        totalUncompressedBytes: totalBytes,
        entries
    });
}

module.exports = { DEFAULT_LIMITS, inspectVsix, sha256, validateEntry };
