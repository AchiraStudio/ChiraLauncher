#!/usr/bin/env python3
"""
FuckingFast.co direct downloader (HTMX-aware)
Usage:
    python ff.py "https://fuckingfast.co/smeekt12mped#filename.rar"
"""

import sys
import re
import cloudscraper
from urllib.parse import urlparse, unquote
from tqdm import tqdm

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
    """Load page, grab CSRF token, POST, and extract download link from HX-Redirect."""
    page_url = f"{BASE_URL}/{file_id}"

    # 1. Visit the download page to get cookies/clearance
    print("Loading page to obtain session...")
    page_resp = scraper.get(page_url)
    page_resp.raise_for_status()

    # 2. Extract CSRF token (if present)
    csrf_token = None
    match = re.search(r'<meta\s+name="csrf-token"\s+content="([^"]+)"', page_resp.text)
    if match:
        csrf_token = match.group(1)
        print(f"Found CSRF token: {csrf_token[:10]}...")

    # 3. Build POST headers (mimic HTMX click)
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

    # 4. POST to trigger the download button
    post_url = f"{BASE_URL}/f/{file_id}/go"
    print("Triggering download button...")
    resp = scraper.post(post_url, headers=headers, allow_redirects=False)

    # 5. Print all response headers for debugging
    print(f"\nPOST response status: {resp.status_code}")
    print("Response headers:")
    for key, value in resp.headers.items():
        print(f"  {key}: {value}")

    # 6. Extract the download URL
    download_url = None

    # a) Check standard redirect
    if resp.status_code in (301, 302, 303, 307, 308):
        download_url = resp.headers.get("Location")
    # b) HTMX HX-Redirect header (common for hx-swap="none")
    elif resp.status_code == 200:
        # Some frameworks use HX-Redirect, some use HX-Location (JSON)
        if "HX-Redirect" in resp.headers:
            download_url = resp.headers["HX-Redirect"]
        elif "HX-Location" in resp.headers:
            import json
            try:
                hx_loc = json.loads(resp.headers["HX-Location"])
                download_url = hx_loc.get("path") or hx_loc.get("url")
            except:
                pass
        elif "X-Redirect" in resp.headers:
            download_url = resp.headers["X-Redirect"]
        # Fallback: look inside response body
        if not download_url:
            match = re.search(r'https?://dl\.fuckingfast\.co/dl/[^"\'\s]+', resp.text)
            if match:
                download_url = match.group(0)

    if not download_url:
        raise Exception("Could not find download link in response headers or body.")

    if download_url.startswith("/"):
        download_url = BASE_URL + download_url
    return download_url

def download_file(scraper, url, filename=None):
    local_filename = filename or url.split("/")[-1].split("?")[0]
    print(f"\nDownloading to: {local_filename}")
    with scraper.get(url, stream=True) as r:
        r.raise_for_status()
        total_size = int(r.headers.get('content-length', 0))
        block_size = 1024 * 1024
        with tqdm(total=total_size, unit='iB', unit_scale=True, desc=local_filename) as pbar:
            with open(local_filename, 'wb') as f:
                for chunk in r.iter_content(block_size):
                    if chunk:
                        f.write(chunk)
                        pbar.update(len(chunk))
    print("Download complete.")

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    input_url = sys.argv[1]
    file_id, frag_filename = extract_id_and_filename(input_url)
    print(f"File ID: {file_id}")

    scraper = cloudscraper.create_scraper()

    try:
        final_url = get_download_url(scraper, file_id)
        print(f"\nDownload URL: {final_url}")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

    answer = input("Proceed with download? [Y/n]: ").strip().lower()
    if answer and answer != 'y':
        print("Aborted.")
        sys.exit(0)

    filename = frag_filename or final_url.split("/")[-1].split("?")[0] or "downloaded_file"
    download_file(scraper, final_url, filename)

if __name__ == "__main__":
    main()