/**
 * Execution topology: where this extension is running relative to the code it reads.
 *
 * In a remote setup - SSH, Dev Containers, WSL, Codespaces - the workspace lives on the remote
 * machine and VS Code splits extensions between a local UI host and a remote workspace host. An
 * extension that reads workspace files must run on the workspace side. If it ran locally and reached
 * the files over a bridge, every read would cross a machine boundary: slow, and worse, it would mean
 * source code was being copied to a machine the user did not choose to put it on.
 *
 * Tokonomics declares `extensionKind: workspace` so VS Code places it correctly. This module exists
 * because a declaration is not a guarantee: it reports what actually happened, so a misplacement is
 * visible as a diagnostic instead of appearing as unexplained latency.
 *
 * It deliberately does not change behaviour. Indexing already happens wherever the extension host
 * runs, which is the correct place by construction. What was missing was the ability to say so.
 *
 * The `vscode` dependency is injected so the policy stays testable outside an Extension Host.
 */

/** The subset of the VS Code environment this needs. */
export interface TopologyEnvironment {
    /** `undefined` when local; otherwise the remote authority kind, e.g. 'ssh-remote', 'wsl'. */
    readonly remoteName?: string;
    /** VS Code's UI kind: 'desktop' or 'web'. */
    readonly uiKind?: string;
    /** Absolute path of the first workspace root, when there is one. */
    readonly workspaceRootPath?: string;
    /** Scheme of the workspace root URI: 'file', 'vscode-remote', 'vscode-vfs', ... */
    readonly workspaceScheme?: string;
}

export type TopologyKind = 'local' | 'remote-workspace' | 'virtual-filesystem' | 'unknown';

export interface TopologyReport {
    readonly kind: TopologyKind;
    /** True when the extension host runs beside the source it indexes. */
    readonly indexingIsDataLocal: boolean;
    /** True when the workspace is not a real filesystem, so indexing must not be attempted. */
    readonly requiresVirtualFileSupport: boolean;
    readonly remoteName?: string;
    readonly description: string;
}

/**
 * Describes the current topology.
 *
 * The distinction that matters is not local-versus-remote - a remote workspace is perfectly fine, and
 * is where this extension is designed to run. It is whether the extension host sits on the same side
 * as the files. A `vscode-remote` scheme seen from a host with no remote name means the opposite:
 * the extension is local and the files are not, which is the one arrangement that must not index.
 */
export function describeTopology(environment: TopologyEnvironment): TopologyReport {
    const remoteName = environment.remoteName;
    const scheme = environment.workspaceScheme;

    // A virtual filesystem (GitHub Repositories, a vfs provider) has no real files to read. Indexing
    // would either fail or silently pull file contents across the network one request at a time.
    if (scheme && scheme !== 'file' && scheme !== 'vscode-remote') {
        return Object.freeze({
            kind: 'virtual-filesystem' as const,
            indexingIsDataLocal: false,
            requiresVirtualFileSupport: true,
            remoteName,
            description: `The workspace uses the '${scheme}' scheme, which is not a real filesystem. `
                + 'Workspace indexing is not attempted; explicit selections remain available.'
        });
    }

    if (remoteName) {
        // The extension host runs on the remote machine alongside the workspace. This is the
        // intended arrangement for SSH, WSL, containers and Codespaces.
        return Object.freeze({
            kind: 'remote-workspace' as const,
            indexingIsDataLocal: true,
            requiresVirtualFileSupport: false,
            remoteName,
            description: `Running in the '${remoteName}' workspace host, beside the source it indexes. `
                + 'Source is read locally on that machine and is not copied across the connection.'
        });
    }

    if (scheme === 'vscode-remote') {
        // Files are remote but this host is not: the misplacement case.
        return Object.freeze({
            kind: 'unknown' as const,
            indexingIsDataLocal: false,
            requiresVirtualFileSupport: false,
            remoteName,
            description: 'The workspace is remote but this extension host is local. Indexing would '
                + 'read source across the connection, so it is not treated as data-local.'
        });
    }

    return Object.freeze({
        kind: 'local' as const,
        indexingIsDataLocal: true,
        requiresVirtualFileSupport: false,
        remoteName,
        description: 'Running locally beside the workspace source.'
    });
}

/**
 * Whether workspace indexing should run at all.
 *
 * Refuses where reading would cross a machine boundary or where there is no real filesystem behind
 * the workspace. Both cases fail closed to explicit selections, which still work: the user pointing
 * at code is always authorised evidence regardless of where the code lives.
 */
export function indexingIsPermitted(report: TopologyReport): boolean {
    return report.indexingIsDataLocal && !report.requiresVirtualFileSupport;
}
