export const $ = (i) => document.getElementById(i),
  esc = (s) =>
    s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const SW = new Set(
  "the a an of to in is are and or for on with what how do does can i my be at by it this that from as".split(
    " ",
  ),
);
export const tok = (t) =>
  (t.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((w) => !SW.has(w))
    .map((w) => w.replace(/(ing|es|s)$/, ""));
export const chunk = (t) =>
  t
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter((x) => x.length > 30);
