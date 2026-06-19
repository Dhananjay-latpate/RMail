# RMail Branded Web Admin

The embedded admin UI is delivered as a ZIP bundle configured via `webadmin.resource` in the server config.

## Rebrand to RMail

1. Fork [stalwartlabs/webadmin](https://github.com/stalwartlabs/webadmin)
2. Apply branding changes:
   - Replace logo and favicon with RMail assets
   - Update app title to "RMail Workspace Admin"
   - Apply colors from `resources/webadmin/rmail-theme.css`
3. Build the bundle: `trunk build --release`
4. Package as ZIP and host at a stable URL
5. Add to `multi-org-config.toml`:

```toml
webadmin.resource = "https://your-cdn.example.com/rmail-webadmin.zip"
```

## Theme Override

The file `rmail-theme.css` provides CSS variables matching the product portal branding.
Per-tenant branding is applied at runtime via `GET /api/manage/branding`.

## Per-Tenant Dynamic Branding

Tenant principals store `brandName`, `brandLogoUrl`, and `brandTheme` (JSON).
Client apps (portal, webmail) fetch branding from the Management API and apply CSS variables.
