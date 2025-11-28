# Backend hardening notes

Update the Flask service to only accept traffic from your site and to stop if configuration is missing. Suggested changes:

1) Enforce required env vars  
   - `PUBG_API_KEY` must be set and not equal to `CHANGE_ME` (exit if missing).  
   - `ALLOWED_ORIGINS` (comma‑separated) defaults to `https://pubgbanchecker.com,https://www.pubgbanchecker.com`.  
   - Optional: `PROXY_SHARED_SECRET` to require a private header from your reverse proxy.

2) Lock down CORS  
   ```python
   ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()] or [
       "https://pubgbanchecker.com",
       "https://www.pubgbanchecker.com",
   ]
   CORS(app, resources={r"/api/*": {"origins": ALLOWED_ORIGINS}, r"/check-ban*": {"origins": ALLOWED_ORIGINS}})
   ```

3) (Optional but recommended) Require a proxy-added secret so the raw Render URL cannot be abused:  
   ```python
   SECRET = os.getenv("PROXY_SHARED_SECRET")

   @app.before_request
   def enforce_proxy_secret():
       if not SECRET:
           return
       if request.path in {"/ping", "/"}:
           return
       if request.headers.get("X-Proxy-Secret") != SECRET:
           abort(401)
   ```
   Configure your proxy (e.g., Cloudflare Worker/Pages Function, Nginx, or Render service settings) to add this header on requests forwarded to Render.

4) Prefer an `/api` prefix  
   - Expose endpoints under `/api/*` (and keep legacy paths during the transition) so the frontend can call same-origin `/api/...`.  
   - In your proxy, route `https://pubgbanchecker.com/api/*` -> `https://pubg-ban-checker-backend.onrender.com/*`.

5) Keep outbound requests tight  
   - Keep `timeout=` on all `requests.get` calls (already present).  
   - Consider adding basic rate limiting (e.g., Flask-Limiter) and small sleep jitter if PUBG rate limits are hit.  
   - Return 503/429 on excessive traffic to protect upstream.

These changes, combined with the frontend updates to call `/api`, remove the Render hostname from client code and restrict who can hit the backend directly.
