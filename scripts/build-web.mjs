import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const webRoot = resolve(projectRoot, "www");

await mkdir(resolve(webRoot, "supabase"), { recursive: true });
await cp(resolve(projectRoot, "index.html"), resolve(webRoot, "index.html"));
await cp(resolve(projectRoot, "privacy.html"), resolve(webRoot, "privacy.html"));
await cp(resolve(projectRoot, "terms.html"), resolve(webRoot, "terms.html"));
await cp(resolve(projectRoot, "legal.css"), resolve(webRoot, "legal.css"));
await cp(resolve(projectRoot, "styles.css"), resolve(webRoot, "styles.css"));
await cp(resolve(projectRoot, "app.js"), resolve(webRoot, "app.js"));
await cp(resolve(projectRoot, "node_modules", "@capacitor", "app", "dist", "plugin.js"), resolve(webRoot, "capacitor-app.js"));
await cp(resolve(projectRoot, "node_modules", "@capacitor", "browser", "dist", "plugin.js"), resolve(webRoot, "capacitor-browser.js"));
await cp(resolve(projectRoot, "supabase", "config.js"), resolve(webRoot, "supabase", "config.js"));

console.log("DS CLASSES web assets copied to www/ with Google OAuth and demo mode disabled.");
