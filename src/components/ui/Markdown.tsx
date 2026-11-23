import { Fragment, type ReactNode } from "react";

/**
 * Minimal, safe markdown for release notes: headings, bullet lists, **bold**,
 * `code` and links. Renders React nodes only (never injects HTML), so a
 * malicious release body can't script the app.
 */
function inline(text: string): ReactNode[] {
    const out: ReactNode[] = [];
    const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(text))) {
        if (m.index > last) out.push(text.slice(last, m.index));
        const tok = m[0];
        if (tok.startsWith("**")) out.push(<strong key={i++} className="font-semibold text-fg">{tok.slice(2, -2)}</strong>);
        else if (tok.startsWith("`")) out.push(<code key={i++} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px] text-fg">{tok.slice(1, -1)}</code>);
        else {
            const [, label, href] = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!;
            out.push(<a key={i++} href={href} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">{label}</a>);
        }
        last = m.index + tok.length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}

export function Markdown({ source }: { source: string }) {
    const lines = source.replace(/\r\n/g, "\n").split("\n");
    const blocks: ReactNode[] = [];
    let list: string[] = [];
    const flush = () => {
        if (!list.length) return;
        blocks.push(
            <ul key={`ul${blocks.length}`} className="my-2 space-y-1.5">
                {list.map((li, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-fg-soft">
                        <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-fg-mute" />
                        <span>{inline(li)}</span>
                    </li>
                ))}
            </ul>,
        );
        list = [];
    };
    for (const raw of lines) {
        const line = raw.trimEnd();
        const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
        const heading = /^(#{1,4})\s+(.*)$/.exec(line);
        if (bullet) { list.push(bullet[1]); continue; }
        flush();
        if (heading) {
            blocks.push(<h4 key={blocks.length} className="mb-1 mt-4 text-[13px] font-semibold text-fg first:mt-0">{inline(heading[2])}</h4>);
        } else if (line.trim()) {
            blocks.push(<p key={blocks.length} className="my-1.5 text-[13px] leading-relaxed text-fg-soft">{inline(line)}</p>);
        }
    }
    flush();
    return <Fragment>{blocks}</Fragment>;
}
