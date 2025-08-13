# decorsify — F*CK cors

A universal CORS-enabled proxy for M3U8 playlists and HLS segments. Works with both Bun/Node.js and Cloudflare Workers.

## Quick Deploy

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/madss-dev/decorsify)

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

## Local Development

### Bun/Node.js Runtime
```bash
# Install dependencies
bun install

# Start local development server
bun run dev
```

### Cloudflare Workers
```bash
# Install dependencies (if not already done)
bun install

# Start local Wrangler development server
bun run dev:worker

# Or start with local mode (no Cloudflare binding)
bun run preview
```

## Deployment

### Cloudflare Workers

1. **Install Wrangler CLI** (if not already installed):
   ```bash
   npm install -g wrangler
   # or
   bun add -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   wrangler auth login
   ```

3. **Configure your domain** (optional):
   Edit `wrangler.toml` and uncomment the routes section:
   ```toml
   [[routes]]
   pattern = "your-domain.com/*"
   zone_name = "your-domain.com"
   ```

4. **Build and deploy**:
   ```bash
   bun run build
   bun run deploy
   ```

5. **Your worker will be available at**:
   ```
   https://m3u8-proxy.<your-subdomain>.workers.dev
   ```

### Other Platforms

For other serverless platforms, you can adapt the worker code in `src/worker.ts` or use the original `index.ts` for traditional Node.js hosting.

## Features

- ✅ CORS-enabled for browser usage
- ✅ M3U8 playlist rewriting and proxification
- ✅ Range request support for video segments
- ✅ Multiple upstream fallback attempts
- ✅ Custom origin/referer header support
- ✅ Works with Bun, Node.js, and Cloudflare Workers
- ✅ Handles various HLS playlist formats

## Architecture

The proxy automatically detects M3U8 playlists and rewrites internal URLs to go through the proxy, ensuring all resources are accessible. For non-playlist requests, it acts as a simple CORS proxy.
