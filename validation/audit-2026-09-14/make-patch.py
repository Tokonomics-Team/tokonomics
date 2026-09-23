"""Generate a unified candidate patch without modifying the working tree."""
from pathlib import Path
import difflib
import json

audit = Path(__file__).resolve().parent
root = audit.parent.parent
edits = json.loads((audit / "edits.json").read_text(encoding="utf-8"))
patch = []
for file in sorted({edit["file"] for edit in edits}):
    before = (root / file).read_bytes().decode("utf-8")
    target = audit / "tsconfig.proposed.json" if file == "tsconfig.json" else audit / "staged" / file
    after = target.read_bytes().decode("utf-8")
    patch.extend(difflib.unified_diff(
        before.splitlines(keepends=True), after.splitlines(keepends=True),
        fromfile="a/" + file, tofile="b/" + file, n=3,
    ))
(audit / "remediation.patch").write_bytes("".join(patch).encode("utf-8"))
print(f"Generated patch for {len({edit['file'] for edit in edits})} files.")
