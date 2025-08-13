/// <reference lib="dom" />

const DEFAULT_PORT = Number(process.env.PORT || 4870);

// i know this shi workin in just a single file, but if you want to split it up, go ahead. i just wanted to keep it simple and easy to understand.


type UpstreamAttempt = {
	origin: string;
	referer: string;
};

// alr niggas this might look as if its only usable for the two hosts above, but really it's just an array of objects. Adding a new host is as easy as adding a new object to the array. its also used as fallback if the first attempt fails. also trust me, it works. so dont judge me for custom origins just pass them in params as origin=https://somefuckingurl.com or something.

const ATTEMPTS: UpstreamAttempt[] = [
	{ origin: "https://megaplay.buzz", referer: "https://megaplay.buzz/" },
	{ origin: "https://dotstream.buzz", referer: "https://dotstream.buzz/" }
];


// this is a fixed user agent. i dont think it matters much but it's here just in case.
// using more common user agents to avoid blocks

const USER_AGENTS = [
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0"
];

function getRandomUserAgent(): string {
	return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
}

function buildCorsHeaders(extra?: HeadersInit): Headers {
	const headers = new Headers(extra);
	headers.set("Access-Control-Allow-Origin", "*");
	headers.set(
		"Access-Control-Allow-Headers",
		"Origin, X-Requested-With, Content-Type, Accept, Range, Referer"
	);
	headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
	headers.set(
		"Access-Control-Expose-Headers",
		"Content-Length, Content-Type, Accept-Ranges, Content-Range"
	);
	headers.set("Cross-Origin-Resource-Policy", "cross-origin");
	return headers;
}


//this shi checks if the content type is a playlist. don't worry about it too much just know it's used to determine if the content is a playlist.

function isLikelyPlaylist(url: URL, upstreamContentType: string | null): boolean {
	if (url.pathname.endsWith(".m3u8")) return true;
	if (!upstreamContentType) return false;
	const ct = upstreamContentType.toLowerCase();
	return (
		ct.includes("application/vnd.apple.mpegurl") ||
		ct.includes("application/x-mpegurl") ||
		ct.includes("vnd.apple.mpegurl")
	);
}

// this just builds the url for the proxy. it's used to build the url for the proxy which your lazy ass might want to use. like for worker request origin headers. you wouldn't but there it is.
function proxify(target: string, proxyBase: string, originParam?: string | null): string {
    const base = `${proxyBase}?url=${encodeURIComponent(target)}`;
    const result = originParam ? `${base}&origin=${encodeURIComponent(originParam)}` : base;
    console.log(`[DEBUG] Proxifying ${target} with base ${proxyBase} -> ${result}`);
    return result;
}


// this just absolutify the url, ya know relativify it to the base url.
function absolutify(relativeOrAbsolute: string, baseUrl: string): string {
	try {
		return new URL(relativeOrAbsolute, baseUrl).toString();
	} catch {
		return relativeOrAbsolute;
	}
}


//this shi just rewrites the URI attribute to the proxy url and your shit at it.
function rewriteAttributeUri(line: string, playlistUrl: string, proxyBase: string, originParam?: string | null): string {
    return line.replace(/URI="([^"]+)"/g, (_m, p1: string) => {
        const absolute = absolutify(p1, playlistUrl);
        return `URI="${proxify(absolute, proxyBase, originParam)}"`;
    });
}

// now this is where the real magic happens. it rewrites the playlist to the proxy url and adds the origin param if its there.

function rewritePlaylist(content: string, playlistUrl: string, proxyBase: string, originParam?: string | null): string {
	const lines = content.split(/\r?\n/);
	let output: string[] = [];
	let expectUriAfterStreamInf = false;

	for (const rawLine of lines) {
		let line = rawLine;

		if (line.startsWith("#EXT-X-STREAM-INF")) {
			expectUriAfterStreamInf = true;
			output.push(line);
			continue;
		}


        //this shi just rewrites the key, session key, map, i-frame stream inf, and media attributes to the proxy url, works fine for providers like animepahe.ru or those that use the same format.
        if (
			line.startsWith("#EXT-X-KEY") ||
			line.startsWith("#EXT-X-SESSION-KEY") ||
			line.startsWith("#EXT-X-MAP") ||
			line.startsWith("#EXT-X-I-FRAME-STREAM-INF") ||
			line.startsWith("#EXT-X-MEDIA")
		) {
            output.push(rewriteAttributeUri(line, playlistUrl, proxyBase, originParam));
			continue;
		}

		if (line.length === 0 || line.startsWith("#")) {
			output.push(line);
			continue;
		}
        const absolute = absolutify(line, playlistUrl);
        const proxied = proxify(absolute, proxyBase, originParam);
		output.push(proxied);
		expectUriAfterStreamInf = false;
	}

	return output.join("\n");
}


// this just copies the headers from the upstream response to the response. adds compression headers and cache control headers, shi just does that (i think)
function copyPassthroughHeaders(upstream: Response): HeadersInit {
	const headers = new Headers();

	const passthroughHeaderNames = [
		"content-type",
		"content-length",
		"accept-ranges",
		"content-range",
        "content-encoding",
        "cache-control",
        "expires",
        "vary",
		"etag",
		"last-modified"
	];

	for (const name of passthroughHeaderNames) {
		const value = upstream.headers.get(name);
		if (value) headers.set(name, value);
	}

	return headers;
}

// it fetches the upstream response and returns it. it also adds the origin and referer headers to the request, also adds the range, if-range, if-none-match, and if-modified-since headers to the request.

async function fetchUpstream(
	targetUrl: URL,
	clientReq: Request,
	attempts: UpstreamAttempt[],
	method: "GET" | "HEAD" = "GET"
): Promise<Response> {
	const clientRange = clientReq.headers.get("range");
	const ifRange = clientReq.headers.get("if-range");
	const ifNoneMatch = clientReq.headers.get("if-none-match");
	const ifModifiedSince = clientReq.headers.get("if-modified-since");

    for (const attempt of attempts) {
		const upstreamHeaders: HeadersInit = {
			"User-Agent": getRandomUserAgent(),
			Accept: "*/*",
			"Accept-Encoding": clientRange ? "identity" : "gzip, deflate, br, zstd",
			"Accept-Language": "en-US,en;q=0.9",
			"Cache-Control": "no-cache",
			"Pragma": "no-cache",
			Origin: attempt.origin,
			Referer: attempt.referer,
			"Sec-Fetch-Dest": "empty",
			"Sec-Fetch-Mode": "cors",
			"Sec-Fetch-Site": "cross-site",
			"Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
			"Sec-Ch-Ua-Mobile": "?0",
			"Sec-Ch-Ua-Platform": '"Linux"',
			Connection: "keep-alive"
		};

        // yup exactly as i said above

		if (clientRange) {
			(upstreamHeaders as Record<string, string>)["Range"] = clientRange;
		}
		if (ifRange) (upstreamHeaders as Record<string, string>)["If-Range"] = ifRange;
		if (ifNoneMatch)
			(upstreamHeaders as Record<string, string>)["If-None-Match"] = ifNoneMatch;
		if (ifModifiedSince)
			(upstreamHeaders as Record<string, string>)["If-Modified-Since"] = ifModifiedSince;

		try {
			const res = await fetch(targetUrl, {
				method,
				headers: upstreamHeaders,
				signal: (clientReq as any).signal ?? undefined,
				redirect: "follow"
			});
			if (!(res.status === 403 || res.status === 401)) {
				return res;
			}
			// small delay before trying next attempt to avoid rate limits
			await new Promise(resolve => setTimeout(resolve, 500));
		} catch (err) {
			// small delay on error too
			await new Promise(resolve => setTimeout(resolve, 300));
		}
	}

	return fetch(targetUrl);
}

function usage(): Response {
	const headers = buildCorsHeaders({ "Content-Type": "text/plain; charset=utf-8" });
	return new Response(
        "Usage: /?url=<encoded m3u8 or segment URL>[&origin=<origin-or-referer-url>]\nExample: /?url=" +
			encodeURIComponent(
				"https://somefuckingurl.com/master.m3u8"
			),
		{ status: 400, headers }
	);
}

const server = Bun.serve({
	port: DEFAULT_PORT,
	fetch: async (req: Request) => {
		const url = new URL(req.url);

		if (req.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: buildCorsHeaders() });
		}

		const target = url.searchParams.get("url");
        const originParamRaw = url.searchParams.get("origin");
		if (!target) {
			return usage();
		}

		let targetUrl: URL;
		try {
			targetUrl = new URL(target);
		} catch {
			return new Response("Invalid URL", { status: 400, headers: buildCorsHeaders() });
		}

        // this is where the origin param is handled. if its there, it's used to build the attempts array.

        let attempts = ATTEMPTS;
        if (originParamRaw) {
            try {
                const u = new URL(originParamRaw);
                const referer = originParamRaw.endsWith("/") ? originParamRaw : originParamRaw + "/";
                attempts = [{ origin: u.origin, referer }, ...ATTEMPTS];
            } catch {}
        }

        // this is where the method is handled. if its a head request, it's used to build the attempts array.

        const method = req.method === "HEAD" ? "HEAD" : "GET";
        const upstream = await fetchUpstream(targetUrl, req, attempts, method);
		const upstreamContentType = upstream.headers.get("content-type");
        const isPlaylistReq = method === "GET" && isLikelyPlaylist(targetUrl, upstreamContentType);

        // this is where the playlist is handled. if its a playlist request, it's rewritten to the proxy url and the origin param is added.

		if (isPlaylistReq) {
			const playlistText = await upstream.text();
            // Fix mixed content issues by using the same protocol as the request
            // Check for forwarded protocol (common with reverse proxies)
            const forwardedProto = req.headers.get('x-forwarded-proto') || req.headers.get('x-forwarded-protocol');
            const protocol = forwardedProto ? `${forwardedProto}:` : url.protocol;
            const proxyBaseUrl = `${protocol}//${url.host}/`;
            console.log(`[DEBUG] URL protocol: ${url.protocol}, forwarded: ${forwardedProto}, final: ${protocol}, proxy base: ${proxyBaseUrl}`);
            const rewritten = rewritePlaylist(playlistText, targetUrl.toString(), proxyBaseUrl, originParamRaw);
			const headers = buildCorsHeaders({
				"Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
				"Cache-Control": "no-cache, no-store, must-revalidate"
			});
			return new Response(rewritten, { status: upstream.status, headers });
		}

		const passthrough = copyPassthroughHeaders(upstream);
		const headers = buildCorsHeaders(passthrough);
        return new Response(method === "HEAD" ? null : upstream.body, {
			status: upstream.status,
			statusText: upstream.statusText,
			headers
		});
	}
});

// i know this is a lot of comments but i just wanted to explain what each part of the code does.AND DON'T JUDGE ME FOR THE COMMENTS OR MY HALF ASS CODE.

console.log(`always the goat proxy listening on http://localhost:${server.port}`);