// Round 27f: adds getDisplayMode() (cutout.java.txt) to the LauncherActivity Bubblewrap generates, replacing its closing brace.
// Run inside the build container after `bubblewrap update` (which regenerates the class every time).
const fs = require("fs"), path = require("path");
const find = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? find(path.join(d, e.name)) : e.name === "LauncherActivity.java" ? [path.join(d, e.name)] : []);
const [file] = find("/work/app/src/main/java");
let src = fs.readFileSync(file, "utf8");
if (!src.includes("LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES")) {
  src = src.replace(/}\s*$/, fs.readFileSync(path.join(__dirname, "cutout.java.txt"), "utf8"));
  fs.writeFileSync(file, src);
}
console.log("camera strip override:", src.includes("LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES") ? "in place" : "MISSING");
