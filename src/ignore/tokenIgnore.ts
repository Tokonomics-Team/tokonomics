/**
 * .tokenignore Pattern Matcher & Context Filter
 * Automatically excludes lockfiles, build artifacts, minified assets, and binary files from AI context payloads.
 */

import * as fs from 'fs';
import * as path from 'path';

export class TokenIgnoreFilter {
    private static readonly DEFAULT_IGNORED_PATTERNS = [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/out/**',
        '**/.git/**',
        '**/.next/**',
        '**/coverage/**',
        '**/*.min.js',
        '**/*.min.css',
        '**/*.map',
        '**/*.lock',
        '**/package-lock.json',
        '**/yarn.lock',
        '**/pnpm-lock.yaml',
        '**/Cargo.lock',
        '**/poetry.lock',
        '**/*.wasm',
        '**/*.svg',
        '**/*.png',
        '**/*.jpg',
        '**/*.jpeg',
        '**/*.gif',
        '**/*.ico',
        '**/*.pdf',
        '**/*.exe',
        '**/*.dll',
        '**/*.so',
        '**/*.dylib'
    ];

    private customPatterns: string[] = [];

    constructor(workspaceRoot?: string) {
        if (workspaceRoot) {
            this.loadTokenIgnore(workspaceRoot);
        }
    }

    public loadTokenIgnore(workspaceRoot: string): void {
        try {
            const ignorePath = path.join(workspaceRoot, '.tokenignore');
            if (fs.existsSync(ignorePath)) {
                const content = fs.readFileSync(ignorePath, 'utf8');
                this.customPatterns = content
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0 && !line.startsWith('#'));
            }
        } catch {
            this.customPatterns = [];
        }
    }

    public isIgnored(filePath: string): boolean {
        const normalized = filePath.replace(/\\/g, '/');
        const fileName = path.basename(normalized).toLowerCase();

        // Exact lockfiles
        const knownLockfiles = [
            'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'cargo.lock', 
            'poetry.lock', 'composer.lock', 'gemfile.lock', 'pipfile.lock'
        ];
        if (knownLockfiles.includes(fileName)) {
            return true;
        }

        // Check file extension / binary extensions
        const binaryOrJunkExtensions = [
            '.lock', '.wasm', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', 
            '.map', '.min.js', '.min.css', '.exe', '.dll', '.so', '.dylib', '.zip', '.tar'
        ];

        if (binaryOrJunkExtensions.some(ext => normalized.endsWith(ext))) {
            return true;
        }

        // Check common directories
        const ignoredDirs = ['/node_modules/', '/dist/', '/build/', '/.git/', '/.next/', '/coverage/', '/out/'];
        if (ignoredDirs.some(dir => normalized.includes(dir))) {
            return true;
        }

        // Check custom patterns
        for (const pattern of this.customPatterns) {
            const cleanPat = pattern.replace(/^\//, '').replace(/\/$/, '').toLowerCase();
            if (normalized.toLowerCase().includes(cleanPat) || fileName === cleanPat) {
                return true;
            }
        }

        return false;
    }
}
