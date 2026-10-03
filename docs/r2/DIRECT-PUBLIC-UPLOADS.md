# Direct public asset uploads

The Assets UI now sends only filename/MIME/byte-count metadata through server actions. The browser PUTs the file directly to R2, so a 5 MB asset no longer travels inside a Vercel function request. The server requires a current active admin, validated extension/MIME/integer size, fail-closed DB rate budget and configured public bucket/CDN before issuing a short-lived signed URL. Confirmation HEAD checks actual length and content type before presenting the CDN URL.

Path-style signing uses the existing R2 endpoint CSP origin. Public-bucket CORS must independently permit the application origin, PUT and Content-Type; private-bucket CORS does not automatically apply. The old uploadAssetAction remains a compatibility surface but is no longer imported by the production Assets UI. Delete requires explicit browser confirmation and uses the existing guarded action; cached CDN copies may outlive origin deletion.

Regression tests cover the exact 5 MB boundary, no file Body in server-side signing, path-style configuration, invalid metadata and stored mismatch. Actual bucket CORS, signed PUT and CDN byte identity remain deployment-environment acceptance checks. No production object was uploaded/deleted by development tools.

## Metadata-only signing contract

The public presigning client sets `requestChecksumCalculation: 'WHEN_REQUIRED'`. It has metadata, not the future browser file body; automatic optional checksums can otherwise bind the URL to an empty-body checksum. This is scoped to `lib/r2-public-upload.ts`, not a global change to private downloads, recovery storage or server-side uploads with real bodies. The request still uses SigV4, a ten-minute expiry, the configured endpoint, the public bucket and its existing opaque asset key.

The presigner explicitly includes `content-type` in `signableHeaders`. Setting `ContentType` on `PutObjectCommand` alone does not make that header signed in the locked SDK. `ContentLength` remains bound to the declared byte count. The browser must send the normalized MIME type and exactly that many bytes; it supplies Content-Length through the actual File request body, not a manually set forbidden browser header. The URL query must not be edited after signing.

`tests/reliability/public-assets-signing.test.mjs` runs the actual signer with lockfile-installed AWS packages and synthetic `.example.test` configuration. It checks one byte and exactly 5,242,880 bytes, the absence of optional empty-body checksum parameters, MIME/size tamper rejection using an independent fixture SigV4 verifier, MIME normalization, namespace, endpoint, expiry and invalid metadata. It makes no storage request and does not log signed URLs. The existing mock-based tests still verify metadata and HEAD-confirmation boundaries; they cannot establish actual SDK signing defaults.

### October 2 development evidence

Related tracker: [issue #32](https://github.com/redwan-cse/redwan.work/issues/32). The owner approved the production-portal master plan and development contract; AGY is reserved for consolidated local acceptance after development, while isolated tests and CI continue per slice.

On unchanged production source from main `a86b2934556af04c74279d00ad1b0dbde3d81ec6`, the test-only candidate `628fafd4416a8474bf4ed9c9ff89a5d480748879` produced the expected assertion failure: `public asset presign does not bind an empty-body checksum for 1 bytes`. [Exact CI run](https://github.com/redwan-cse/redwan.work/actions/runs/36991947971). The lockfile resolves `@aws-sdk/client-s3` 3.1118.0 and `@aws-sdk/s3-request-presigner` 3.1117.0. This records an executable signing defect, not a guessed CORS diagnosis.

The owner's reported browser NetworkError has not been traced to a hosted request stage. This repair does not establish that the production failure has only one cause, that public-bucket CORS is correct, or that stored bytes are safe content. HEAD metadata validation is not a cryptographic file-identity or malware-scanning guarantee.

Before hosted closeout, identify the actual failed stage and retain only a sanitized method/status or browser-block category, time and deployed revision. Never copy a signed URL, URL query, raw provider body, credentials, cookies or customer content into diagnostic evidence. A valid presign still needs the correct public-bucket CORS and emitted browser CSP. A successful PUT is not UI success until confirmation passes.

Future merge/deployment and any real upload, deletion or configuration change require their own approval. Keep issue #32 open until the remaining relevant isolated/browser and separately authorized hosted acceptance is recorded.

References: [AWS checksum configuration](https://docs.aws.amazon.com/sdkref/latest/guide/feature-dataintegrity.html), [AWS explicit signed headers](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/), [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) and [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/).
