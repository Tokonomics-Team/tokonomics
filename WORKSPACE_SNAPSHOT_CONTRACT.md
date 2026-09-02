# Tokonomics versioned workspace snapshot contract

Phase 3 replaces production dirty flags and independently mutable workspace indexes
with one `VersionedWorkspaceIndex`. Repository maps, symbol search, compiler retrieval,
and future graph/LSP adapters must read from a captured immutable snapshot.

## Identity

Every workspace root receives a stable ID derived from its real, normalized path.
Every file key is `root-id:relative/path`; separators are `/`, `.` segments are removed,
and casing follows the host filesystem policy. Existing files resolve through realpath,
so symlink aliases cannot create a second identity or escape a root. Multi-root files
with the same relative path remain distinct. Untitled buffers are never indexed.

## Snapshot

A snapshot contains:

- a monotonically increasing generation and creation time;
- root identities and an ignore-policy version;
- immutable file records with canonical identity, content hash, source version,
  language, skeleton, symbols, byte cost, and update sequence;
- one derived symbol collection and fully accounted estimated memory cost.

A request captures one snapshot reference before retrieval and compilation. Later file
events publish a new snapshot and cannot mutate the captured reference.

## Updates and races

Create/change/delete/rename and saved-buffer events enter one facade. Updates are
debounced per canonical file. Each key has a monotonically increasing update sequence;
an async read may publish only if its sequence is still current. Delete supersedes any
in-flight read. Rename reads the destination and publishes old removal plus new content
atomically. Ignore-policy or workspace-root changes trigger a versioned rebuild.

## Memory

The configured envelope accounts for canonical keys, root metadata, file records,
hashes, skeleton strings, symbol objects, signatures, term sets, arrays, and map/set
overhead. Files are considered by deterministic priority rather than traversal order.
If the next immutable state would exceed the envelope, lower-priority records are
evicted before publication. Old snapshots remain valid only while request references
keep them alive; no mutable global history retains them.

## Compatibility boundary

Legacy `FileWatchIndex`, `RepoMapEngine`, `RamContextManager`, `WorkspaceGraph`, and
`ScipIndexer` remain available to existing callers during migration, but production
workspace retrieval and repository mapping use the snapshot facade. LSP results are
request-local overlays and must not mutate a captured snapshot.

Phase 4 evidence ranking and Phase 5 global token selection are deliberately outside
this contract.
