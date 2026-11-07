# TULPAR Classroom
Backend prototype, not deployed. Existing website still needs integration.

## Architecture
Cloudflare Worker: classroom/worker.mjs; D1 schema: classroom/schema.sql.
Super Admin creates classes; student joins with class code and name, receives HttpOnly cookie. No student API tokens.
AI requests use internal service binding AI_GATEWAY to existing server/gateway.mjs; provider keys remain server-side.

## Deployment requirements
1. Create D1 database, apply schema.sql and bind as DB.
2. Deploy existing gateway Worker with a real provider secret and TULPAR_ACCESS_TOKEN.
3. Deploy classroom Worker with service binding AI_GATEWAY to gateway Worker.
4. Set ALLOWED_ORIGIN to exact website origin and configure gateway ALLOWED_ORIGINS accordingly.
5. Set TULPAR_ACCESS_TOKEN and a distinct ADMIN_SETUP_SECRET as Cloudflare Worker secrets.
6. Owner bootstraps via trusted command-line request to POST /api/admin/bootstrap using Authorization Bearer ADMIN_SETUP_SECRET.
7. Implement student join/login and admin class management frontend using credentials: include.
8. Add Cloudflare rate limiting, quotas, session revocation and enrollment limits.
9. Test end-to-end on deployed Worker. GitHub Pages alone cannot enforce membership.

## Routes
POST /api/admin/bootstrap — one-time owner session.
POST /api/admin/classes — admin-only; body name; returns one-time class code.
POST /api/class/join — class code and student name; issues session cookie.
GET /api/me — role/session state.
POST /api/chat — authenticated gateway proxy.

## Security and limitations
Join code can be shared; require approval/expiry for stronger access.
Cross-site browser cookies may be blocked; use same-site custom domain/proxy.
Existing website settings are not yet changed. This is not a live class-only product.
Rate limiting and per-student billing quotas must be enforced before opening enrollment.