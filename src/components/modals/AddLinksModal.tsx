import { useEffect, useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { DownloadCloud, FolderOpen, Link as LinkIcon, AlertTriangle } from "lucide-react";
import { useHttpStore } from "../../store/httpStore";
import { useSettingsStore } from "../../store/settingsStore";
import { errMsg } from "../../lib/tauri";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Field, ProgressBar, TextArea, TextInput } from "../ui/controls";

/** "https://host/abc#Game_--_fitgirl-repacks.site_--_.part1.rar" -> "Game [Fitgirl Repack]" */
export function autoFormatFolderName(urlOrFilename: string): string {
    if (!urlOrFilename) return "";
    let raw = urlOrFilename;
    if (raw.includes("#")) raw = raw.split("#")[1];
    else if (raw.includes("/")) raw = raw.split("/").pop()?.split("?")[0] || raw;
    try { raw = decodeURIComponent(raw); } catch { /* keep raw */ }

    raw = raw.replace(/\.(part\d+|0\d+|\d+)\.(rar|zip|7z|bin)$/i, "").replace(/\.(rar|zip|7z|bin|exe|iso)$/i, "");

    let tag = "";
    if (/fitgirl/i.test(raw)) {
        tag = " [Fitgirl Repack]";
        raw = raw.replace(/--_fitgirl-repacks\.site_--_|[-._]fitgirl-repacks\.site|[-._]fitgirl[-._]repack|[-._]fitgirl/gi, "");
    } else if (/dodi/i.test(raw)) {
        tag = " [DODI Repack]";
        raw = raw.replace(/[-._]dodi[-._]repacks?|[-._]dodi/gi, "");
    } else if (/elamigos/i.test(raw)) {
        tag = " [ElAmigos Repack]";
        raw = raw.replace(/[-._]elamigos/gi, "");
    }
    const clean = raw.replace(/--+/g, " ").replace(/[._]/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (l) => l.toUpperCase());
    return clean ? `${clean}${tag}` : "";
}

const CONCURRENCY = 4;
const unsafe = /[\\/:*?"<>|]/g;

/** Runs `worker` over `items` with at most `limit` in flight, preserving result order. */
async function pool<T, R>(items: T[], limit: number, worker: (item: T, i: number) => Promise<R>, onDone: () => void): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const i = next++;
            results[i] = await worker(items[i], i);
            onDone();
        }
    }));
    return results;
}

export function AddLinksModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { resolveLink, addDownloads } = useHttpStore.getState();
    const defaultPath = useSettingsStore((s) => s.settings?.download_path || "");
    const [links, setLinks] = useState("");
    const [savePath, setSavePath] = useState("");
    const [folderName, setFolderName] = useState("");
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(0);
    const [failures, setFailures] = useState<{ url: string; error: string }[]>([]);

    useEffect(() => { if (open && !savePath && defaultPath) setSavePath(defaultPath); }, [open, defaultPath, savePath]);

    const urls = useMemo(() => links.split("\n").map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l)), [links]);

    // Suggest a folder name from the first pasted link (only until the user types their own)
    const [folderTouched, setFolderTouched] = useState(false);
    useEffect(() => {
        if (folderTouched || !urls[0]) return;
        const f = autoFormatFolderName(urls[0]);
        if (f) setFolderName(f);
    }, [urls, folderTouched]);

    const pickFolder = async () => {
        const sel = await openDialog({ directory: true, multiple: false, defaultPath: savePath || undefined }).catch(() => null);
        if (typeof sel === "string") setSavePath(sel);
    };

    const start = async () => {
        const target = (savePath || defaultPath).replace(/[/\\]$/, "");
        if (urls.length === 0) return toast.error("Paste at least one http(s) link");
        if (!target) return toast.error("Choose a folder to save into");

        const folder = folderName.trim().replace(unsafe, "_");
        setBusy(true); setDone(0); setFailures([]);

        const resolved = await pool(urls, CONCURRENCY, async (raw) => {
            try {
                const info = await resolveLink(raw);
                const name = info.title.replace(unsafe, "_");
                return { ok: true as const, raw, url: info.download_url, path: folder ? `${target}\\${folder}\\${name}` : `${target}\\${name}` };
            } catch (e) {
                return { ok: false as const, raw, error: errMsg(e) };
            }
        }, () => setDone((d) => d + 1));

        const good = resolved.filter((r): r is Extract<typeof r, { ok: true }> => r.ok);
        const bad = resolved.filter((r): r is Extract<typeof r, { ok: false }> => !r.ok).map((r) => ({ url: r.raw, error: r.error }));
        setFailures(bad);

        if (good.length > 0) {
            try {
                await addDownloads(good.map((g) => g.url), good.map((g) => g.path), folder || undefined, good.map((g) => g.raw));
                toast.success(`Queued ${good.length} download${good.length > 1 ? "s" : ""}`, { description: folder || "Downloads" });
                if (bad.length === 0) { setLinks(""); setFolderName(""); setFolderTouched(false); onClose(); }
            } catch (e) {
                toast.error("Couldn't queue downloads", { description: errMsg(e) });
            }
        }
        setBusy(false);
    };

    return (
        <Modal
            open={open}
            onClose={() => !busy && onClose()}
            dismissable={!busy}
            size="lg"
            icon={<DownloadCloud size={19} />}
            title="Add downloads"
            subtitle="Paste direct or FuckingFast links, one per line"
            footer={
                <>
                    <span className="text-xs text-fg-mute">{urls.length > 0 ? `${urls.length} link${urls.length > 1 ? "s" : ""} detected` : "No links yet"}</span>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
                        <Button variant="primary" loading={busy} disabled={urls.length === 0} icon={<DownloadCloud size={16} />} onClick={() => void start()}>
                            {busy ? `Resolving ${done}/${urls.length}…` : `Start ${urls.length || ""} download${urls.length === 1 ? "" : "s"}`.replace("  ", " ")}
                        </Button>
                    </div>
                </>
            }
        >
            <div className="space-y-5">
                <Field label={<span className="inline-flex items-center gap-1.5"><LinkIcon size={13} /> Links</span>}>
                    <TextArea
                        mono
                        value={links}
                        onChange={(e) => setLinks(e.target.value)}
                        disabled={busy}
                        rows={7}
                        placeholder={"https://fuckingfast.co/abc123#Game_--_fitgirl-repacks.site_--_.part1.rar\nhttps://fuckingfast.co/def456#Game_--_fitgirl-repacks.site_--_.part2.rar"}
                    />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Folder name" hint="Multi-part files are grouped under this name.">
                        <TextInput value={folderName} onChange={(e) => { setFolderName(e.target.value); setFolderTouched(true); }} disabled={busy} placeholder="Game name" />
                    </Field>
                    <Field label="Save to">
                        <div className="flex gap-2">
                            <TextInput mono value={savePath} onChange={(e) => setSavePath(e.target.value)} disabled={busy} placeholder="Choose a folder" />
                            <Button variant="secondary" icon={<FolderOpen size={15} />} onClick={() => void pickFolder()} disabled={busy} aria-label="Browse" />
                        </div>
                    </Field>
                </div>

                {busy && <ProgressBar value={urls.length ? (done / urls.length) * 100 : 0} />}

                {failures.length > 0 && (
                    <div className="rounded-xl border border-danger/30 bg-danger/[0.07] p-3.5">
                        <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-danger"><AlertTriangle size={15} /> {failures.length} link{failures.length > 1 ? "s" : ""} couldn't be resolved</div>
                        <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-fg-mute">
                            {failures.map((f) => <li key={f.url} className="break-all"><span className="text-fg-soft">{f.url}</span> — {f.error}</li>)}
                        </ul>
                    </div>
                )}
            </div>
        </Modal>
    );
}
