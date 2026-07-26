#!/usr/bin/env python3
import sys
import re
import json
import cloudscraper
from urllib.parse import urlparse, unquote

BASE_URL = "https://fuckingfast.co"

def extract_id_and_filename(url):
    if url.startswith("http"):
        parsed = urlparse(url)
        file_id = parsed.path.strip("/")
        fragment = parsed.fragment
        filename = unquote(fragment) if fragment else None
    else:
        file_id = url.split("#")[0]
        filename = url.split("#")[1] if "#" in url else None
    if not file_id:
        raise ValueError("Could not extract file ID from URL")
    return file_id, filename

def get_download_url(scraper, file_id):
    page_url = f"{BASE_URL}/{file_id}"
    page_resp = scraper.get(page_url)
    page_resp.raise_for_status()

    csrf_token = None
    match = re.search(r'<meta\s+name="csrf-token"\s+content="([^"]+)"', page_resp.text)
    if match:
        csrf_token = match.group(1)

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": page_url,
        "Origin": BASE_URL,
        "Accept": "*/*",
        "HX-Request": "true",
        "HX-Current-URL": page_url,
        "HX-Trigger": "click",
    }
    if csrf_token:
        headers["X-CSRF-TOKEN"] = csrf_token

    post_url = f"{BASE_URL}/f/{file_id}/go"
    resp = scraper.post(post_url, headers=headers, allow_redirects=False)

    download_url = None

    if resp.status_code in (301, 302, 303, 307, 308):
        download_url = resp.headers.get("Location")
    elif resp.status_code == 200:
        if "HX-Redirect" in resp.headers:
            download_url = resp.headers["HX-Redirect"]
        elif "HX-Location" in resp.headers:
            try:
                hx_loc = json.loads(resp.headers["HX-Location"])
                download_url = hx_loc.get("path") or hx_loc.get("url")
            except:
                pass
        elif "X-Redirect" in resp.headers:
            download_url = resp.headers["X-Redirect"]

        if not download_url:
            match = re.search(r'https?://dl\.fuckingfast\.co/dl/[^"\'\s]+', resp.text)
            if match:
                download_url = match.group(0)

    if not download_url:
        raise Exception("Could not find download link in response headers or body.")

    if download_url.startswith("/"):
        download_url = BASE_URL + download_url
    return download_url

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing URL argument"}))
        sys.exit(1)

    input_url = sys.argv[1]
    scraper = cloudscraper.create_scraper()

    try:
        if "fuckingfast.co" in input_url:
            file_id, frag_filename = extract_id_and_filename(input_url)
            final_url = get_download_url(scraper, file_id)
            title = frag_filename or final_url.split("/")[-1].split("?")[0] or "downloaded_file"
        else:
            final_url = input_url
            clean_url = input_url.split("?")[0]
            title = unquote(clean_url.split("/")[-1]) or "downloaded_file"

        # Query file size
        file_size = 0
        try:
            head_resp = scraper.head(final_url, allow_redirects=True, timeout=5)
            file_size = int(head_resp.headers.get("content-length", 0))
        except Exception:
            pass

        print(json.dumps({
            "title": title,
            "download_url": final_url,
            "file_size": file_size
        }))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
