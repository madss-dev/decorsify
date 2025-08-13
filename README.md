# decorsify — F*CK cors

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
