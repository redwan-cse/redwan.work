# Direct public asset uploads

The Assets UI now sends only filename/MIME/byte-count metadata through server actions. The browser PUTs the file directly to R2, so a 5 MB asset no longer travels inside a Vercel function request. The server requires a current active admin, validated extension/MIME/integer size, fail-closed DB rate budget and configured public bucket/CDN before issuing a short-lived signed URL. Confirmation HEAD checks actual length and content type before presenting the CDN URL.

Path-style signing uses the existing R2 endpoint CSP origin. Public-bucket CORS must independently permit the application origin, PUT and Content-Type; private-bucket CORS does not automatically apply. The old uploadAssetAction remains a compatibility surface but is no longer imported by the production Assets UI. Delete requires explicit browser confirmation and uses the existing guarded action; cached CDN copies may outlive origin deletion.

Regression tests cover the exact 5 MB boundary, no file Body in server-side signing, path-style configuration, invalid metadata and stored mismatch. Actual bucket CORS, signed PUT and CDN byte identity remain deployment-environment acceptance checks. No production object was uploaded/deleted by development tools.
