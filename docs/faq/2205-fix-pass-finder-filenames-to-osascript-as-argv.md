# fix: pass Finder filenames to osascript as argv

<!-- source: Merged PR | id: 2205 | closed: 2026-10-29T14:02:17.964Z -->

## Question

fix: pass Finder filenames to osascript as argv

## Answer

**Summary**
- Code scanning alert 162 (`js/incomplete-sanitization`) is the Finder copy in `tools/lib/path-normalizer.js`. It escaped double quotes inside an AppleScript string and left backslashes alone.
- The filename is now an `osascript` argv item. `folderName` stays one of the two Finder literals.
- This does not touch `hermes-mobile`, so the iPad simulator job should skip.

**Verification**
- `node tests/test-path-normalizer.js` passed. The test feeds a name containing a quote and a backsl

[View source](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/2205)

---
