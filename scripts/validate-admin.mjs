import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const errors = [];
const stats = { html: 0, javascript: 0, inlineScripts: 0, localAssets: 0 };
const skipDirs = new Set([".git", "node_modules", "_site", "dist", "build"]);

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}
function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}
function attr(source, name) {
  const m = source.match(new RegExp("(?:^|\\s)" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}
function checkInline(source, label, module) {
  if (module) {
    const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", cwd: ROOT });
    if (result.status !== 0) errors.push(label + ": " + (result.stderr || result.stdout || "module syntax error"));
  } else {
    try { new vm.Script(source, { filename: label }); }
    catch (error) { errors.push(label + ": " + (error?.stack || String(error))); }
  }
}
function checkAsset(from, raw, label) {
  const value = String(raw || "").trim();
  if (!value || value.startsWith("#") || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value) || /[{}<>]/.test(value)) return;
  let pathname = value.split("#", 1)[0].split("?", 1)[0];
  try { pathname = decodeURIComponent(pathname); } catch { errors.push(label + ": invalid URL encoding in " + value); return; }
  const target = pathname.startsWith("/")
    ? path.resolve(ROOT, pathname.replace(/^\/+/, ""))
    : path.resolve(path.dirname(from), pathname);
  if (!target.startsWith(ROOT + path.sep) && target !== ROOT) {
    errors.push(label + ": path escapes repository: " + value); return;
  }
  const finalPath = fs.existsSync(target) && fs.statSync(target).isDirectory() ? path.join(target, "index.html") : target;
  if (!fs.existsSync(finalPath) || !fs.statSync(finalPath).isFile()) errors.push(label + ": missing local asset " + value);
  else stats.localAssets++;
}

const files = walk(ROOT);
const htmlFiles = files.filter(file => /\.html?$/i.test(file));
const jsFiles = files.filter(file => /\.js$/i.test(file));
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  stats.html++;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (attr(m[1], "src") || !m[2].trim()) continue;
    const type = (attr(m[1], "type") || "").toLowerCase();
    if (type && !["module", "text/javascript", "application/javascript", "text/ecmascript", "application/ecmascript"].includes(type)) continue;
    checkInline(m[2], rel(file) + ":inline-" + (++stats.inlineScripts), type === "module");
  }
  for (const m of html.matchAll(/<(script|img|iframe|source|audio|track|link)\b([^>]*)>/gi)) {
    const tag = m[1].toLowerCase(), attrs = m[2];
    let key = ["script", "img", "iframe", "source", "audio", "track"].includes(tag) ? "src" : null;
    if (tag === "link") {
      const rels = (attr(attrs, "rel") || "").toLowerCase().split(/\s+/);
      if (rels.some(v => ["stylesheet", "icon", "manifest", "apple-touch-icon", "preload", "modulepreload"].includes(v))) key = "href";
    }
    if (key) {
      const value = attr(attrs, key);
      if (value !== null) checkAsset(file, value, rel(file));
    }
  }
}

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8", cwd: ROOT });
  if (result.status !== 0) errors.push(rel(file) + ": " + (result.stderr || result.stdout || "JavaScript syntax error"));
  else stats.javascript++;
}

// Guard security invariants that must not regress when the admin UI is refactored.
const admin = fs.readFileSync(path.join(ROOT, "js/admin.js"), "utf8");
const passkey = fs.readFileSync(path.join(ROOT, "supabase/functions/admin-passkey-verify-session/index.ts"), "utf8");
const email = fs.readFileSync(path.join(ROOT, "supabase/functions/admin-verify-email/index.ts"), "utf8");
const authorizationSql = fs.readFileSync(path.join(ROOT, "supabase/admin-control-center.sql"), "utf8");
const tokenSql = fs.readFileSync(path.join(ROOT, "supabase/admin-auth.sql"), "utf8");

assert.match(admin, /storageKey:\s*["'][^"']+-admin-center-auth["']/);
assert.match(admin, /admin_is_authorized/);
assert.match(admin, /function isVerified\(\)[\s\S]*?return false;/, "Browser storage must never grant administrator verification");
assert.match(passkey, /auth\.getUser\(accessToken\)/, "Passkey JWT must be validated by Supabase Auth");
assert.match(passkey, /latestMethod\?\.method !== ["']passkey["']/);
assert.match(passkey, /profile\.is_admin !== true/);
assert.match(passkey, /user_level \?\? 0/);
assert.match(passkey, /ipCount[^;]*userCount/s);
assert.match(email, /auth\.getUser\(accessToken\)/);
assert.match(email, /!profile\?\.is_admin/);
assert.match(email, /Number\([\s\S]*?profile\.user_level[\s\S]*?< 10/);
assert.match(email, /\.eq\([\s\S]*?["']used["']\s*,\s*false\)/);
assert.match(email, /if \(!consumed\)/);
assert.match(authorizationSql, /u\.user_id = auth\.uid\(\)/);
assert.match(authorizationSql, /u\.is_admin = true/);
assert.match(authorizationSql, /coalesce\(u\.user_level, 0\) >= 10/);
assert.match(authorizationSql, /revoke all on function public\.admin_is_authorized\(\) from public/i);
assert.match(tokenSql, /enable row level security/i);
assert.match(tokenSql, /revoke all on table public\.admin_verification_tokens from anon, authenticated/i);

if (errors.length) {
  for (const error of errors) console.error("ERROR " + error);
  console.error("Admin quality check failed: " + errors.length + " error(s).");
  process.exitCode = 1;
} else {
  console.log("DORI ADMIN QUALITY CHECK PASSED");
  console.log(JSON.stringify(stats, null, 2));
  console.log("Admin authorization, passkey freshness, one-use email token and RLS invariants verified.");
}
