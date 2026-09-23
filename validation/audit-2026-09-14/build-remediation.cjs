/* Produces a reviewable overlay; never edits production source. */
const fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.resolve(__dirname,'../..'),stage=path.join(__dirname,'staged');
fs.mkdirSync(stage,{recursive:true});
fs.cpSync(path.join(root,'src'),path.join(stage,'src'),{recursive:true});
const edits=[];
function replace(id,file,before,after){
 const target=path.join(stage,file);const source=fs.readFileSync(target,'utf8');
 if(!source.includes(before)) before=before.replace(/\r\n/g,'\n');
 if(!source.includes(before)) before=before.replace(/\n/g,'\r\n');
 if(!source.includes(before))throw Error('Missing replacement: '+file+' '+before.slice(0,80));
 const original=fs.readFileSync(path.join(root,file),'utf8');
 const start=source.indexOf(before);const originalStart=original.indexOf(before);
 edits.push({id,file,line:originalStart<0?null:original.slice(0,originalStart).split('\n').length,before,after});
 fs.writeFileSync(target,source.slice(0,start)+after+source.slice(start+before.length));
}
function method(id,file,name,after){
 const source=fs.readFileSync(path.join(stage,file),'utf8');const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);let found;
 function walk(n){if((ts.isMethodDeclaration(n)||ts.isFunctionDeclaration(n))&&n.name?.getText(sf)===name)found=n;ts.forEachChild(n,walk);}walk(sf);
 if(!found)throw Error('Missing method '+file+' '+name);
 replace(id,file,found.getText(sf),after);
}
function transform(id,file,fn){const before=fs.readFileSync(path.join(stage,file),'utf8');replace(id,file,before,fn(before));}

replace('BUG-GOV-01','src/governor/contextGovernor.ts','timestamp: Date.now()','timestamp: 0 // Deterministic compatibility field; event timestamps belong in telemetry.');
method('BUG-GOV-01','src/governor/evidencePolicy.ts','getPolicy',`public static getPolicy(taskType: TaskType): TaskPolicy {
        const policy = this.POLICIES[taskType] || this.POLICIES.completion;
        return { ...policy, requiredEvidence: policy.requiredEvidence.map(requirement => ({ ...requirement })) };
    }`);
method('BUG-GOV-02','src/governor/evidenceSafetyGate.ts','auditEvidence',`public static auditEvidence(required: EvidenceRequirement[], provided: EvidenceCategory[]): EvidenceSafetyResult {
        const present = new Set(provided);
        const missing = required.filter(requirement => !present.has(requirement.category));
        return {
            passed: missing.length === 0,
            required: required.map(requirement => ({ ...requirement })),
            provided: [...present],
            missing: missing.map(requirement => ({ ...requirement })),
            confidence: required.length ? (required.length - missing.length) / required.length : 1,
            actionTaken: missing.length ? 'fail_closed_fallback' : 'proceed'
        };
    }`);
method('BUG-GOV-02','src/governor/contextGovernor.ts','validateEvidenceSafety',`public validateEvidenceSafety(
        decision: ContextGovernorDecision,
        providedEvidence: EvidenceCategory[],
        _options?: { workspaceRetrievalAuthorized?: boolean }
    ): EvidenceSafetyResult {
        return EvidenceSafetyGate.auditEvidence(decision.requiredEvidence, providedEvidence);
    }`);
replace('BUG-GOV-02','src/engine/pipelineOrchestrator.ts',"const inlineEvidence = InlineEvidenceClassifier.classify(request.messages.map(message => message.content));", "const inlineEvidence = InlineEvidenceClassifier.classify(optimizedMessages.map(message => message.content));");
replace('BUG-GOV-02','src/engine/pipelineOrchestrator.ts','...evidenceRetrieval.covered, ...inlineEvidence.categories',`...evidenceRetrieval.selected.filter(candidate => optimizedMessages.some(message =>
                message.content.includes(candidate.content))).map(candidate => candidate.category), ...inlineEvidence.categories`);
replace('BUG-GOV-02','src/engine/pipelineOrchestrator.ts','        // Every restore path has run, so the payload is settled.',`        // Verify what is emitted after every restore/reduction. Missing evidence is a request error,
        // not permission to send an incomplete request labelled as evidence-safe.
        if (!request.preserveProtocol && !isConversationalOnly(userInstruction)) {
            const finalText = optimizedMessages.map(message => message.content);
            const finalCategories = new Set<EvidenceCategory>(InlineEvidenceClassifier.classify(finalText).categories);
            for (const candidate of evidenceRetrieval?.selected || []) {
                if (candidate.content.length > 0 && finalText.some(text => text.includes(candidate.content))) {
                    finalCategories.add(candidate.category);
                }
            }
            const finalAudit = governor.validateEvidenceSafety(governorDecision, [...finalCategories]);
            if (!finalAudit.passed) throw new Error('REQUIRED_EVIDENCE_MISSING: '
                + finalAudit.missing.map(requirement => requirement.category).join(', '));
        }

        // Every restore path has run, so the payload is settled.`);

// Keep every schema keyword and literal value, including property names that resemble keywords.
method('BUG-SCHEMA-01','src/cache/schemaMinifier.ts','compressTool',`private static compressTool(tool: any, _level: SchemaCompressionLevel): any {
        return tool;
    }`);
method('BUG-SCHEMA-01','src/cache/schemaMinifier.ts','compressSchemaNode',`private static compressSchemaNode(node: any, _level: SchemaCompressionLevel): any {
        return node;
    }`);
replace('BUG-SCHEMA-01','src/cache/schemaMinifier.ts',"if (level === 'deferred') {", "if (false) { // No executable meta-tool adapter is registered; preserve the real tools.");
replace('BUG-SCHEMA-01','src/cache/schemaMinifier.ts',"if (level === 'high' && toolCount > META_TOOL_THRESHOLD) {", "if (false) { // A text-only catalog cannot replace executable schemas.");
replace('BUG-SCHEMA-01','src/cache/schemaMinifier.ts',"const output = Array.isArray(parsed) ? compressed\r\n                : (tools.length === 1 ? compressed[0] : compressed);", "const output = Array.isArray(parsed) ? compressed\r\n                : (Array.isArray(parsed?.tools) ? { ...parsed, tools: compressed } : compressed[0]);");
replace('BUG-CACHE-01','src/cache/schemaMinifier.ts','const minifiedJson = JSON.stringify(output);',`const minifiedJson = JSON.stringify(output, (_key, value) => {
                if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
                return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
            });`);
method('BUG-CACHE-02','src/cache/normalizer.ts','normalizeCacheableText',`public static normalizeCacheableText(text: string): string {
        // Source, regex literals, string escapes and timestamp instructions are semantic data.
        // Canonicalize structure before assembly, never arbitrary payload bytes here.
        return text;
    }`);

// Conservative degradation is deliberate until language-specific parsers prove boundaries.
replace('BUG-AST-01','src/ast/pruner.ts','pruned = this.pruneWithStatefulParser(workingCode, detectedLang, options);','pruned = codeWithoutInjections;');
replace('BUG-AST-01','src/ast/pruner.ts','pruned = this.pruneWithStatefulParser(workingCode, detectedLang, options);','pruned = codeWithoutInjections;');
const prunerSource=fs.readFileSync(path.join(stage,'src/ast/pruner.ts'),'utf8');
const t0Start=prunerSource.indexOf("        if (options.structuralTier === 'T0')");
const t0End=prunerSource.indexOf('        // 3. Apply dependency',t0Start);
replace('BUG-AST-01','src/ast/pruner.ts',prunerSource.slice(t0Start,t0End),"        // T0 may use the complete T1 syntax; individual lines cannot prove subtree boundaries.\n\n");
method('BUG-AST-01','src/ast/pruner.ts','formatJsTsClass',`private formatJsTsClass(node: any, exportPrefix: string = ''): string {
        const prefix = exportPrefix && !node.text.startsWith('export') ? exportPrefix : '';
        return prefix + node.text;
    }`);
replace('BUG-AST-01','src/ast/pruner.ts','            const rootNode = syntaxTree.rootNode;',`            const rootNode = syntaxTree.rootNode;
            if (rootNode.hasError) return codeText;`);
replace('BUG-AST-01','src/ast/pruner.ts','        const prunedTokens = TokenCounter.countTokens(pruned);','        pruned = pruned || codeWithoutInjections;\n        const prunedTokens = TokenCounter.countTokens(pruned);');
replace('BUG-AST-01','src/ast/pruner.ts','cacheKey = this.blobAstCache.computeCacheKey(codeText, options, languageHint);',`cacheKey = this.blobAstCache.computeCacheKey(codeText, options, languageHint)
                + (this.hasTreeSitterActive() ? ':wasm' : ':verbatim');`);
method('BUG-AST-02','src/ast/treeShaker.ts','sliceModuleContext',`public static sliceModuleContext(moduleCode: string, _referencedSymbols: Set<string> | string[]): TreeShakeResult {
        // Lexical name matching cannot establish transitive closure, side effects, wildcard
        // exports, runtime imports, inheritance, or language-specific declaration boundaries.
        const tokens = TokenCounter.countTokens(moduleCode);
        return { shakenCode: moduleCode, originalTokens: tokens, shakenTokens: tokens,
            retainedSymbols: [], prunedSymbols: [], savedTokens: 0 };
    }`);

replace('BUG-MEM-01','src/cache/blobAstCache.ts',"const sizeBytes = Buffer.byteLength(result.prunedCode, 'utf8') + 256;",`const sizeBytes = result.prunedCode.length * 2 + key.length * 2 + 256;
        if (sizeBytes > this.maxMemoryBytes) { this.delete(key); return; }`);
replace('BUG-MEM-01','src/cache/blobAstCache.ts','            result,\r\n            sizeBytes,','            result: { ...result },\r\n            sizeBytes,');
replace('BUG-MEM-01','src/cache/blobAstCache.ts','return entry.result;','return { ...entry.result };');
replace('BUG-MEM-02','src/search/invertedIndex.ts','    private docIndexToId: string[] = [];','    private docIndexToId: string[] = [];\n    private freeDocIndices: number[] = [];');
replace('BUG-MEM-02','src/search/invertedIndex.ts','        const docIndex = this.docIndexToId.length;\r\n        this.docIndexToId.push(id);','        const docIndex = this.freeDocIndices.pop() ?? this.docIndexToId.length;\n        this.docIndexToId[docIndex] = id;');
replace('BUG-MEM-02','src/search/invertedIndex.ts',"this.docIndexToId[docIndex] = ''; // Invalidate slot","this.docIndexToId[docIndex] = ''; // Reuse deleted slots on the next insertion.\n        this.scoreBuf[docIndex] = 0;\n        this.freeDocIndices.push(docIndex);");
replace('BUG-MEM-02','src/search/invertedIndex.ts','        this.docIndexToId.length = 0;','        this.docIndexToId.length = 0;\n        this.freeDocIndices.length = 0;');
replace('BUG-MEM-03','src/engine/ramManager.ts','        this.isWarming = true;','        this.isWarming = true;\n        this.symbolIndex = [];');
replace('BUG-MEM-03','src/engine/ramManager.ts','                            this.symbolIndex.push(sym);',`                            if (this.usedBytes + this.symbolBytes(sym) > this.config.ramBudgetMB * 1024 * 1024) break;
                            this.symbolIndex.push(sym);
                            this.usedBytes += this.symbolBytes(sym);`);
replace('BUG-MEM-03','src/engine/ramManager.ts','        this.symbolIndex = [];\n        const startTime',`        this.usedBytes = [...this.skeletonCache.values()].reduce((sum, entry) => sum + entry.sizeBytes, 0)
            + this.turnCodeRegistry.size * 128;
        this.symbolIndex = [];
        const startTime`);
replace('BUG-MEM-03','src/engine/ramManager.ts','        this.symbolIndex = this.symbolIndex.filter(s => s.file !== filePath);',`        this.symbolIndex = this.symbolIndex.filter(symbol => {
            if (symbol.file !== filePath) return true;
            this.usedBytes -= this.symbolBytes(symbol);
            return false;
        });`);
replace('BUG-MEM-03','src/engine/ramManager.ts','            this.turnCodeRegistry.clear();','            this.usedBytes -= this.turnCodeRegistry.size * 128;\n            this.turnCodeRegistry.clear();');
replace('BUG-MEM-03','src/engine/ramManager.ts','    private isOverBudget(): boolean {',`    private symbolBytes(symbol: IndexedSymbol): number {
        return 256 + (symbol.name.length + symbol.file.length + symbol.signature.length) * 2
            + [...symbol.terms].reduce((sum, term) => sum + 32 + term.length * 2, 0);
    }

    private isOverBudget(): boolean {`);
replace('BUG-MEM-03','src/engine/ramManager.ts','        // Also prune turn code registry if needed',`        while (this.usedBytes > maxBytes && this.symbolIndex.length > 0) {
            this.usedBytes -= this.symbolBytes(this.symbolIndex.pop()!);
        }

        // Also prune turn code registry if needed`);
replace('BUG-MEM-03','src/engine/ramManager.ts','this.usedBytes > maxBytes && this.turnCodeRegistry.size > 50','this.usedBytes > maxBytes && this.turnCodeRegistry.size > 0');

method('BUG-COMP-01','src/engine/agenticCompactor.ts','maskHeadTail',`public static maskHeadTail(content: string, _headLines: number = 6, _tailLines: number = 6): string {
        // Unknown middle lines can be the only causal evidence; retain until provenance marks
        // individual observations optional and a final evidence audit verifies the replacement.
        return content;
    }`);
method('BUG-COMP-01','src/engine/agenticCompactor.ts','condenseToolMessageContent',`private static condenseToolMessageContent(content: string): string { return content; }`);
method('BUG-COMP-02','src/compression/observationMasking.ts','maskObservations',`export function maskObservations<T extends MaskableMessage>(messages: readonly T[],
    _options: ObservationMaskingOptions = DEFAULT_OBSERVATION_MASKING): ObservationMaskingResult<T> {
    // No per-observation evidence obligations or persisted epoch are available at this boundary.
    // Retaining observations preserves both required evidence and append-only prefix bytes.
    return { messages: [...messages], maskedCount: 0, charsRemoved: 0,
        totalObservationChars: 0, applied: false, skippedReason: 'disabled' };
}`);
replace('BUG-LIMIT-01','src/metrics/circuitBreaker.ts','        const now = Date.now();',`        if (!Number.isFinite(tokensConsumed) || tokensConsumed < 0) {
            return { tripped: true, reason: 'velocity_exceeded', message: 'Invalid token accounting; request paused.',
                tokensPerMinute: 0, consecutiveDuplicateCount: 0, recommendedAction: 'pause_agent' };
        }
        const now = Date.now();`);
replace('BUG-LIMIT-01','src/proxy/chatParticipant.ts','            if (cbStatus.tripped) {\n                response.markdown(`> ${cbStatus.message}\\n\\n`);\n            }',`            if (cbStatus.tripped) {
                response.markdown(\`> \${cbStatus.message}\\n\\n\`);
                compiler.fail(compiled, 'CIRCUIT_BREAKER_TRIPPED');
                activeCompilation = undefined;
                return;
            }`);

// Credential contexts are scanned once, rather than matching ambiguous nested name/value spans.
method('BUG-SEC-01','src/security/sanitizer.ts','isMockOrDummy',`public static isMockOrDummy(_variableName: string, value: string): boolean {
        return /^(?:mock|test|fake|dummy|sample|example|placeholder|changeme|your_api_key|none|null|undefined|xxx)$/i.test(value);
    }`);
method('BUG-SEC-01','src/security/sanitizer.ts','sanitizeSecrets',`public static sanitizeSecrets(text: string): SanitizationResult {
        if (!text) return { sanitized: text, redactedCount: 0, categories: [], residualSecret: false };
        let count = 0;
        const categories = new Set<string>();
        const marker = (category: string) => { count++; categories.add(category); return '[REDACTED_SECRET]'; };
        let sanitized = text;
        // Consume complete PEM regions, or the rest of an unterminated key, in one forward scan.
        const begin = /-----BEGIN (?:[A-Z ]{0,32})PRIVATE KEY-----/g;
        let match: RegExpExecArray | null;
        const pieces: string[] = [];
        let consumed = 0;
        while ((match = begin.exec(sanitized)) !== null) {
            pieces.push(sanitized.slice(consumed, match.index), marker('private-key'));
            const endMarker = match[0].replace('BEGIN', 'END');
            const end = sanitized.indexOf(endMarker, begin.lastIndex);
            consumed = end < 0 ? sanitized.length : end + endMarker.length;
            begin.lastIndex = consumed;
        }
        pieces.push(sanitized.slice(consumed));
        sanitized = pieces.join('');
        // Structural credentials do not receive a dummy-value exemption.
        for (const pattern of this.SECRET_PATTERNS) {
            if (pattern.name === 'credential-assignment' || pattern.name === 'private-key') continue;
            pattern.regex.lastIndex = 0;
            sanitized = sanitized.replace(pattern.regex, () => marker(pattern.name));
        }
        // Decode only bounded, contiguous transport encodings; never rewrite ordinary encoded data.
        sanitized = sanitized.replace(/[A-Za-z0-9_%+\\/=-]{16,}/g, token => {
            if (token.length > 8192) return marker('oversized-encoded-value');
            const decoded: string[] = [];
            if (token.includes('%')) { try { decoded.push(decodeURIComponent(token)); } catch {} }
            if (/^[A-Za-z0-9+\\/_-]+={0,2}$/.test(token)) {
                try { decoded.push(Buffer.from(token, 'base64').toString('utf8')); } catch {}
            }
            const secret = decoded.some(value => this.SECRET_PATTERNS.some(pattern => {
                if (pattern.name === 'credential-assignment') return false;
                pattern.regex.lastIndex = 0;
                return pattern.regex.test(value);
            }));
            return secret ? marker('encoded-credential') : token;
        });
        // Recognize key=value and quoted JSON keys, then consume the entire value including spaces.
        const names = /[A-Za-z_][A-Za-z0-9_-]*/g;
        const output: string[] = [];
        let offset = 0;
        while ((match = names.exec(sanitized)) !== null) {
            if (!/(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret)/i.test(match[0])) continue;
            let cursor = names.lastIndex;
            if (sanitized[cursor] === '"' || sanitized[cursor] === "'") cursor++;
            while (cursor < sanitized.length && /\\s/.test(sanitized[cursor])) cursor++;
            if (sanitized[cursor] !== ':' && sanitized[cursor] !== '=') continue;
            cursor++;
            while (cursor < sanitized.length && /\\s/.test(sanitized[cursor])) cursor++;
            const quote = sanitized[cursor] === '"' || sanitized[cursor] === "'" ? sanitized[cursor++] : '';
            const start = cursor;
            while (cursor < sanitized.length) {
                if (quote) {
                    if (sanitized[cursor] === '\\\\') { cursor += 2; continue; }
                    if (sanitized[cursor] === quote) break;
                } else if (/[\\s,;}{]/.test(sanitized[cursor])) break;
                cursor++;
            }
            cursor = Math.min(cursor, sanitized.length);
            const value = sanitized.slice(start, cursor);
            names.lastIndex = Math.max(names.lastIndex, cursor);
            if (!value || value.includes('[REDACTED_') || this.isMockOrDummy(match[0], value)) continue;
            output.push(sanitized.slice(offset, start), marker('credential-assignment'));
            offset = cursor;
        }
        output.push(sanitized.slice(offset));
        return { sanitized: output.join(''), redactedCount: count, categories: [...categories].sort(), residualSecret: false };
    }`);
method('BUG-SEC-01','src/security/sanitizer.ts','containsSecret',`public static containsSecret(text: string): boolean {
        return this.sanitizeSecrets(text).redactedCount > 0;
    }`);
replace('BUG-LOG-01','src/security/anonymizedLogger.ts','        let result = text;','        let result = text.slice(0, 16_384);');
replace('BUG-LOG-01','src/security/anonymizedLogger.ts','            component,\r\n            message: sanitizedMsg,','            component: this.sanitize(component).slice(0, 128),\r\n            message: sanitizedMsg,');
replace('BUG-LOG-01','src/security/anonymizedLogger.ts','        return result;\r\n    }',`        // Retain line/column diagnostics without exporting private POSIX roots or UNC paths.
        result = result.replace(/(?:\\\\\\\\[^\\s:]+|\\/[^\\s:()]*)/g, '<path>');
        return result;
    }`);
method('BUG-SCRATCH-01','src/engine/scratchpadManager.ts','readState',`public readState(): ScratchpadState {
        const empty = (): ScratchpadState => ({ activeGoal: 'General assistance', completedSteps: [],
            pendingSteps: [], keyDecisions: [], knownBlockers: [], lastUpdated: 0 });
        if (!this.scratchpadPath) return empty();
        try {
            const stat = fs.lstatSync(this.scratchpadPath);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) return empty();
            const value: unknown = JSON.parse(fs.readFileSync(this.scratchpadPath, 'utf8'));
            if (!value || typeof value !== 'object') return empty();
            const state = value as Record<string, unknown>;
            if (typeof state.activeGoal !== 'string' || state.activeGoal.length > 4096) return empty();
            for (const key of ['completedSteps', 'pendingSteps', 'keyDecisions', 'knownBlockers']) {
                const items = state[key];
                if (!Array.isArray(items) || items.length > 64 || items.some(item => typeof item !== 'string' || item.length > 4096)) return empty();
            }
            if (typeof state.lastUpdated !== 'number' || !Number.isFinite(state.lastUpdated)) return empty();
            return state as unknown as ScratchpadState;
        } catch { return empty(); }
    }`);

// Reconcile on filesystem events, including edits made outside the VS Code editor.
replace('BUG-IDX-01','src/extension.ts','    // Dynamic configuration listener',`    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    const reconcileDisk = (uri: vscode.Uri, deleted = false) => {
        if (!workspaceIsTrusted() || !automaticWorkspaceIndexing()) return;
        responseCache.invalidateForFile(uri.fsPath);
        if (/[/\\\\](?:\\.gitignore|\\.tokenignore)$/.test(uri.fsPath)) {
            void workspaceIndex.rebuild().catch(error => logger.error('WorkspaceIndex', 'Rebuild failed.', error));
        } else if (deleted) workspaceIndex.delete(uri.fsPath);
        else workspaceIndex.scheduleUpsert(uri.fsPath);
    };
    context.subscriptions.push(fileWatcher,
        fileWatcher.onDidCreate(uri => reconcileDisk(uri)),
        fileWatcher.onDidChange(uri => reconcileDisk(uri)),
        fileWatcher.onDidDelete(uri => reconcileDisk(uri, true)),
        vscode.workspace.onDidCloseTextDocument(document => {
            if (workspaceIsTrusted() && automaticWorkspaceIndexing()) workspaceIndex.scheduleUpsert(document.fileName);
        }));

    // Dynamic configuration listener`);
// In-flight disk reads must not publish after dispose/trust/root changes.
replace('BUG-IDX-02','src/workspace/workspaceIndex.ts','        const validBuffer = buffer &&', '        const operationEpoch = this.epoch;\n        const validBuffer = buffer &&');
replace('BUG-IDX-02','src/workspace/workspaceIndex.ts','        if (this.sequences.get(identified.key) !== sequence) return false;', '        if (operationEpoch !== this.epoch || !this.trusted || this.sequences.get(identified.key) !== sequence) return false;');
// A hash proves byte identity, not that a heuristic window contains the entire function.
method('BUG-AST-05','src/workspace/semanticChunk.ts','extractChunkRanges',`export function extractChunkRanges(content: string, symbols: readonly ChunkSourceSymbol[],
    context: ChunkExtractionContext): SemanticChunkRange[] {
    if (!content || !symbols.length || Buffer.byteLength(content) > MAX_CHUNK_BYTES) return [];
    const contentHash = sha256(content);
    // Whole-file evidence is conservative until a grammar proves declaration boundaries.
    return symbols.map(symbol => Object.freeze({
        chunkId: context.fileKey + '#' + symbol.name + '@' + symbol.line,
        fileKey: context.fileKey, relativePath: context.relativePath, language: context.language,
        symbolName: symbol.name, symbolKind: symbol.kind, boundary: 'line_window' as const,
        startLine: 1, endLine: content.split('\\n').length, startOffset: 0, endOffset: content.length,
        chunkHash: contentHash, fileContentHash: contentHash, sourceVersion: context.sourceVersion,
        snapshotGeneration: context.snapshotGeneration, estimatedTokens: Math.ceil(content.length / 4)
    }));
}`);
// Release the parser allocation on extension teardown.
replace('BUG-LIFE-01','src/ast/pruner.ts','    public hasTreeSitterActive(): boolean {',`    public dispose(): void {
        this.parser?.delete();
        this.parser = null;
        this.languages.clear();
        this.isInitialized = false;
    }

    public hasTreeSitterActive(): boolean {`);
replace('BUG-LIFE-01','src/extension.ts','    const astEngine = new AstPrunerEngine();','    const astEngine = new AstPrunerEngine();\n    context.subscriptions.push(astEngine);');

replace('BUG-GOV-03','src/protocol/canonicalCompiler.ts','            evidenceSignals: request.evidenceSignals,','            evidenceSignals: request.evidenceSignals,\n            signalSnapshot: request.signalSnapshot,');
replace('BUG-GOV-03','src/engine/pipelineOrchestrator.ts','        const governorDecision = await executePipelineStage',`        const governorSignals = request.signalSnapshot?.snapshotGeneration === request.workspaceSnapshot?.generation
            ? request.signalSnapshot : undefined;
        const terminal = governorSignals?.terminalContext;
        const governorDecision = await executePipelineStage`);
replace('BUG-GOV-03','src/engine/pipelineOrchestrator.ts','                cursorLine: request.cursorLine, optimizationMode })',`                cursorLine: request.cursorLine, optimizationMode,
                diagnosticsCount: governorSignals?.diagnostics?.filter(item => item.severity === 'error').length,
                hasFailingTests: governorSignals?.testOutcomes?.some(item => item.isFailing),
                terminalErrorSnippet: terminal?.userConsented && terminal.source !== 'unauthorized'
                    && terminal.exitCode !== undefined && terminal.exitCode !== 0 ? terminal.rawText : undefined })`);
// A retained initialization promise must also release a parser allocated after deactivation.
replace('BUG-LIFE-01','src/ast/pruner.ts','        this.parser?.delete();\n        this.parser = null;',`        void this.initPromise?.then(() => { this.parser?.delete(); this.parser = null; this.languages.clear(); this.isInitialized = false; });
        this.parser?.delete();
        this.parser = null;`);

// Proven superlinear expressions: constrain starts and prohibit multiline whitespace retry loops.
const suspects=JSON.parse(fs.readFileSync(path.join(__dirname,'regex-suspects.json'),'utf8'));
const regexFixes=[];
for(const row of suspects.filter(row=>row.file.startsWith('src/'))){
 let after=row.pattern;
 if(row.file==='src/cache/normalizer.ts')continue; // Entire mutating normalizer removed above.
 if(row.file==='src/ast/systemDependenceGraph.ts')after='/(?<![a-zA-Z0-9_])'+after.slice(1);
 else if(row.file==='src/compression/conservativePathCompressor.ts')after=String.raw`/(?<![ \t])[ \t]+$/gm`;
 else if(row.file==='src/engine/imageRightsizer.ts')after='/(?<![\\w\\-./\\\\])'+after.slice(1);
 else if(row.file==='src/retrieval/structuredPreservation.ts')after='/(?<![^\\s:])'+after.slice(1);
 else if(row.file==='src/history/contextEpoch.ts')after=String.raw`/(?<![\w./-])[\w.-]+\/[\w./-]{0,4096}\.[a-z]{1,4}\b|(?<![\w-])[\w-]+\.(?:ts|tsx|js|jsx|py|go|rs|java|cs|cpp|h|json|md)\b/gi`;
 else after=after.replace(/\\s/g,'[ \\t]');
 // A stack frame has overlapping function/path fields; bounded fields prevent polynomial growth.
 if(row.file==='src/governor/inlineEvidenceClassifier.ts'&&row.line===54)after=String.raw`/^[ \t]*at[ \t]+[^\r\n]{1,1024}:\d{1,10}(?::\d{1,10})?\)?[ \t]*$/m`;
 if(after===row.pattern)throw Error('No regex remediation '+row.file+':'+row.line);
 const existing=fs.readFileSync(path.join(stage,row.file),'utf8');
 if(existing.includes(row.pattern))replace('BUG-REGEX-01',row.file,row.pattern,after);
 regexFixes.push({...row,after});
}
fs.writeFileSync(path.join(__dirname,'regex-fixes.json'),JSON.stringify(regexFixes,null,2));

replace('BUG-CACHE-03','src/cache/providerCapabilities.ts',"modelId: 'claude-3-5-haiku',\n            minCacheableTokens: 512,","modelId: 'claude-3-5-haiku',\n            minCacheableTokens: 2048,");
replace('BUG-CACHE-03','src/cache/providerCapabilities.ts',"modelId: 'claude-3-7-sonnet',\n            minCacheableTokens: 512,","modelId: 'claude-3-7-sonnet',\n            minCacheableTokens: 1024,");
method('BUG-CACHE-03','src/cache/providerCapabilities.ts','resolve',`public static resolve(modelIdOrAlias?: string, provider?: string): ProviderCacheCapability {
        const needle = (modelIdOrAlias || '').toLowerCase().trim();
        const providerNeedle = (provider || '').toLowerCase().trim();
        const matched = this.CAPABILITIES.find(capability => (!providerNeedle || capability.provider === providerNeedle)
            && (needle === capability.modelId || needle.startsWith(capability.modelId + '-')));
        if (matched) return { ...matched };
        // Unknown model thresholds are unavailable, not inherited from an unrelated model.
        return { ...this.CAPABILITIES.find(capability => capability.provider === 'generic')!,
            provider: providerNeedle || 'generic', modelId: needle || 'unknown',
            minCacheableTokens: Number.MAX_SAFE_INTEGER, supportsExplicitBreakpoint: false };
    }`);
replace('BUG-CACHE-03','src/engine/pipelineOrchestrator.ts',"                    hasNativeTools: Boolean(profile.capabilities.toolCalling),", "                    modelId: request.targetModel,\n                    hasNativeTools: Boolean(profile.capabilities.toolCalling),");
for(const line of fs.readFileSync(path.join(stage,'src/search/embeddingProvider.ts'),'utf8').split('\n').filter(line=>line.includes('\x08'))) {
    replace('BUG-EMBED-01','src/search/embeddingProvider.ts',line,line.replace(/\x08/g,'\\b'));
}
// TSC also compiles otherwise-unreachable evaluators into out/. The imported preservation gate
// remains part of the program even when its directory is excluded from the root file glob.
fs.copyFileSync(path.join(root,'tsconfig.json'),path.join(stage,'tsconfig.source.json'));
const tsconfigBefore=fs.readFileSync(path.join(root,'tsconfig.json'),'utf8');
const tsconfigAfter=tsconfigBefore.replace('"exclude": [','"exclude": ["src/evaluation/**", ');
edits.push({id:'BUG-BUILD-01',file:'tsconfig.json',line:1,before:tsconfigBefore,after:tsconfigAfter});
fs.writeFileSync(path.join(__dirname,'tsconfig.proposed.json'),tsconfigAfter);

replace('BUG-REGEX-02','src/ignore/tokenIgnore.ts','interface IgnoreRule { negative: boolean; regex: RegExp; }','interface IgnoreRule { negative: boolean; regex: { test(value: string): boolean }; }');
method('BUG-REGEX-02','src/ignore/tokenIgnore.ts','globToRegex',`private globToRegex(pattern: string): { test(value: string): boolean } {
        const anchored = pattern.startsWith('/');
        const source = pattern.replace(/^\\//, '').replace(/\\\\/g, '/').replace(/\\/$/, '/**');
        type Token = { type: 'star' | 'deep' | 'any' | 'literal'; text?: string };
        const tokens: Token[] = [];
        for (let i = 0; i < source.length; i++) {
            if (source[i] === '*') {
                const deep = source[i + 1] === '*';
                if (deep) i++;
                tokens.push({ type: deep ? 'deep' : 'star' });
            } else tokens.push(source[i] === '?' ? { type: 'any' } : { type: 'literal', text: source[i].toLowerCase() });
        }
        return { test(value: string): boolean {
            // Oversized rules/paths conservatively exclude, rather than widening the source boundary.
            if (tokens.length > 1024 || value.length > 32768) return true;
            let states = new Set<number>([0]);
            const closure = () => {
                for (const position of states) {
                    if (tokens[position]?.type === 'star' || tokens[position]?.type === 'deep') states.add(position + 1);
                }
            };
            for (const character of value.toLowerCase()) {
                closure();
                if (states.has(tokens.length) && character === '/') return true;
                const next = new Set<number>();
                for (const position of states) {
                    const token = tokens[position];
                    if (!token) continue;
                    if (token.type === 'deep' || token.type === 'star' && character !== '/') next.add(position);
                    else if (token.type === 'any' && character !== '/' || token.type === 'literal' && token.text === character) next.add(position + 1);
                }
                if (!anchored && character === '/') next.add(0);
                states = next;
            }
            closure();
            return states.has(tokens.length);
        } };
    }`);

const sanitizerFile='src/security/sanitizer.ts';
replace('BUG-REGEX-01',sanitizerFile,String.raw`sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, (block) => {`,String.raw`sanitized = this.replaceDelimited(sanitized, '/*', '*/', (block) => {`);
replace('BUG-REGEX-01',sanitizerFile,'    public static escapeRegExp(str: string): string {',`    private static replaceDelimited(text: string, open: string, close: string, rewrite: (part: string) => string): string {
        const parts: string[] = [];
        let cursor = 0;
        while (cursor < text.length) {
            const start = text.indexOf(open, cursor);
            if (start < 0) break;
            const end = text.indexOf(close, start + open.length);
            if (end < 0) break;
            parts.push(text.slice(cursor, start), rewrite(text.slice(start, end + close.length)));
            cursor = end + close.length;
        }
        parts.push(text.slice(cursor));
        return parts.join('');
    }

    public static escapeRegExp(str: string): string {`);

replace('BUG-IDX-02','src/workspace/workspaceIndex.ts','    public async rename(oldPath: string, newPath: string): Promise<boolean> {','    public async rename(oldPath: string, newPath: string): Promise<boolean> {\n        const operationEpoch = this.epoch;');
replace('BUG-IDX-02','src/workspace/workspaceIndex.ts','        if (this.sequences.get(oldIdentity.key) !== oldSequence || this.sequences.get(newIdentity.key) !== newSequence) return false;','        if (operationEpoch !== this.epoch || !this.trusted || this.sequences.get(oldIdentity.key) !== oldSequence || this.sequences.get(newIdentity.key) !== newSequence) return false;');
replace('BUG-LOG-01','src/security/anonymizedLogger.ts','[${level}] [${component}] ${sanitizedMsg}','[${level}] [${entry.component}] ${sanitizedMsg}');
replace('BUG-LOG-01','src/security/anonymizedLogger.ts','100% Sanitized (No usernames, secrets, or file paths)','Sanitized locally; bounded diagnostic content');
replace('BUG-LOG-01','src/security/anonymizedLogger.ts','Report generated locally by Tokonomics. Contains zero user data.','Report generated locally by Tokonomics.');

// Capture all source changes as exact before/after edits.
fs.writeFileSync(path.join(__dirname,'edits.json'),JSON.stringify(edits,null,2));
fs.writeFileSync(path.join(stage,'tsconfig.json'),JSON.stringify({extends:path.join(root,'tsconfig.json'),compilerOptions:{rootDir:'src',outDir:'out'},include:['src/**/*'],exclude:['src/evaluation/**']},null,2));
console.log('Prepared '+edits.length+' exact edits in '+stage);
