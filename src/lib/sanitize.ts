/**
 * Allowlist HTML sanitiser for remote/user text (Steam descriptions, requirement
 * tables). The app runs with no CSP, so any markup that reaches the DOM unfiltered
 * could execute script with access to every backend command. This keeps only
 * harmless formatting tags and safe attributes and drops everything else.
 */
const DROP = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "form", "input", "button", "textarea", "select", "svg", "math", "base", "noscript", "template"]);
const ALLOWED = new Set([
    "a", "b", "i", "u", "s", "em", "strong", "p", "br", "hr", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
    "span", "div", "img", "blockquote", "code", "pre", "table", "thead", "tbody", "tr", "td", "th", "sub", "sup", "del", "small",
]);

const safeUrl = (v: string, allowData = false) => {
    const t = v.trim();
    return /^https?:\/\//i.test(t) || /^mailto:/i.test(t) || (allowData && /^data:image\/(png|jpe?g|gif|webp);/i.test(t));
};

function clean(node: Node, out: Node, doc: Document) {
    node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
            out.appendChild(doc.createTextNode(child.textContent ?? ""));
            return;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (DROP.has(tag)) return;
        if (!ALLOWED.has(tag)) { clean(el, out, doc); return; } // unwrap unknown tags, keep their text
        const copy = doc.createElement(tag);
        if (tag === "a") {
            const href = el.getAttribute("href");
            if (href && safeUrl(href)) { copy.setAttribute("href", href); copy.setAttribute("rel", "noreferrer noopener"); copy.setAttribute("data-external", "1"); }
        } else if (tag === "img") {
            const src = el.getAttribute("src");
            if (!src || !safeUrl(src, true)) return;
            copy.setAttribute("src", src);
            copy.setAttribute("loading", "lazy");
            copy.setAttribute("alt", el.getAttribute("alt") ?? "");
            copy.setAttribute("referrerpolicy", "no-referrer");
        }
        clean(el, copy, doc);
        out.appendChild(copy);
    });
}

export function sanitizeHtml(html: string | null | undefined): string {
    if (!html) return "";
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    const root = doc.createElement("div");
    clean(doc.body, root, doc);
    return root.innerHTML;
}
