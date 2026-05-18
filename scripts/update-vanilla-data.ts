import { dirname, join } from 'jsr:@std/path@^1';
import { unzipSync } from 'npm:fflate';

// Files to extract from the server zip.
// Each regex is matched against the full zip entry path.
const EXTRACT: RegExp[] = [/^behavior_packs\/vanilla\/entities\/player\.json$/];

// Maps a zip path prefix to a local output root.
const PACK_ROOTS: { from: string; to: string }[] = [
    { from: 'behavior_packs/vanilla/', to: 'vanilla_data/bp/' },
    { from: 'resource_packs/vanilla/', to: 'vanilla_data/rp/' },
];

const BDS_VERSIONS_URL =
    'https://raw.githubusercontent.com/Bedrock-OSS/BDS-Versions/main/versions.json';

function newestFirst(versions: string[]): string[] {
    return [...versions].sort((a, b) => {
        const ap = a.split('.').map(Number);
        const bp = b.split('.').map(Number);
        for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
            const diff = (bp[i] ?? 0) - (ap[i] ?? 0);
            if (diff !== 0) return diff;
        }
        return 0;
    });
}

const versionsResp = await fetch(BDS_VERSIONS_URL);
if (!versionsResp.ok) throw new Error(`Failed to fetch BDS versions: ${versionsResp.status}`);
const versionsData = await versionsResp.json();

const latest = newestFirst(versionsData.linux?.versions ?? [])[0];
if (!latest) throw new Error('No linux BDS versions found');
console.log(`Latest BDS version: ${latest}`);

const infoResp = await fetch(
    `https://raw.githubusercontent.com/Bedrock-OSS/BDS-Versions/main/linux/${latest}.json`,
);
if (!infoResp.ok) throw new Error(`Failed to fetch version info: ${infoResp.status}`);
const { download_url } = await infoResp.json();
console.log(`Downloading: ${download_url}`);

const zipResp = await fetch(download_url);
if (!zipResp.ok) throw new Error(`Download failed: ${zipResp.status}`);
const zip = new Uint8Array(await zipResp.arrayBuffer());

const files = unzipSync(zip, { filter: (f) => EXTRACT.some((re) => re.test(f.name)) });

const decoder = new TextDecoder();
for (const [zipPath, data] of Object.entries(files)) {
    const root = PACK_ROOTS.find((r) => zipPath.startsWith(r.from));
    if (!root) {
        console.warn(`No output root for ${zipPath} — skipping`);
        continue;
    }
    const outPath = join(root.to, zipPath.slice(root.from.length));
    await Deno.mkdir(dirname(outPath), { recursive: true });
    await Deno.writeTextFile(outPath, decoder.decode(data));
    console.log(`Written ${outPath}`);
}
