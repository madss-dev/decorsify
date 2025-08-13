# decorsify — a tiny HLS (m3u8) proxy

decorsify is a minimal, fast m3u8/HLS proxy built on Bun. It fetches HLS playlists and media segments on your behalf, rewrites playlists so all nested assets flow back through the proxy, and adds permissive CORS so you can use it safely from the browser.

Useful for:
- Working around restrictive CORS on HLS sources
- Passing a specific Origin/Referer to upstreams that require them
- Rewriting all playlist URIs (including keys, maps, and media) to the proxy

> Note: Please use responsibly. This is an open proxy by design; you are responsible for how and where you deploy it.

---

## Features

- Rewrites HLS playlists so every URI is proxied back through decorsify
- Passthrough streaming for segments with Range support
- Optional `origin` query parameter to control upstream `Origin`/`Referer`
- CORS enabled for `*` with `GET`, `HEAD`, and `OPTIONS`
- Sensible headers passthrough (`content-type`, `content-length`, `accept-ranges`, etc.)
- No caching for playlists; passthrough cache headers for media

---

## Quick start

### Prerequisites
- Bun installed (see `https://bun.sh`)

### Install
```bash
bun install
```

### Run (development)
```bash
# default port: 3000
bun run dev

# or run directly
PORT=3000 bun run index.ts
```

When running you should see:
```
always the goat proxy listening on http://localhost:3000
```

---

## Usage

The proxy has a single endpoint. Provide a target URL through `url` and optionally an `origin` to influence upstream headers.

```
GET /?url=<encoded m3u8 or segment URL>[&origin=<origin-or-referer-url>]
```

Examples:

```bash
# Proxy a playlist
curl 'http://localhost:3000/?url=https%3A%2F%2Fexample.com%2Fpath%2Fmaster.m3u8'

# Proxy with an explicit origin/referer (helpful for 403/401 upstreams)
curl 'http://localhost:3000/?url=https%3A%2F%2Fexample.com%2Fpath%2Fmaster.m3u8&origin=https%3A%2F%2Fsite.example%2F'

# Ask for segment headers only (Range and HEAD supported)
curl -I 'http://localhost:3000/?url=https%3A%2F%2Fexample.com%2Fvideo%2Fseg-001.ts'
```

### How it works
- If the target looks like a playlist (`.m3u8` or HLS content-type), decorsify fetches it, rewrites all URIs to point back through the proxy, and returns it with `application/vnd.apple.mpegurl`.
- For everything else (segments, keys, maps), it streams the upstream body as-is and passes through most relevant headers. Range requests are supported.
- CORS is open (`Access-Control-Allow-Origin: *`).

### What `origin` does
Some upstreams return 401/403 unless specific `Origin`/`Referer` headers are present. Add `&origin=https://mysite.example/` and decorsify will try that origin/referer first, then fall back to its built-in attempts. Example:

```bash
curl 'http://localhost:3000/?url=https%3A%2F%2Fupstream.example%2Fhls%2Fmaster.m3u8&origin=https%3A%2F%2Fmysite.example%2F'
```

---

## Using with a web player

You can feed the proxied URL directly into HLS.js or a player that supports HLS in the browser.

```html
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<video id="v" controls></video>
<script>
  const src = 'http://localhost:3000/?url=' + encodeURIComponent('https://example.com/hls/master.m3u8') + '&origin=' + encodeURIComponent('https://mysite.example/');
  const video = document.getElementById('v');
  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(src);
    hls.attachMedia(video);
  } else {
    video.src = src; // for Safari
  }
</script>
```

---

## Configuration

- Port: controlled via `PORT` env var (default `3000`).
- Upstream attempts: hardcoded list inside `index.ts` is used as fallback if `origin` is not supplied or doesn’t work.
- User-Agent: a fixed UA string is used for consistency.

---

## License

No license specified. If you intend to use this in production or redistribute it, consider adding a license.