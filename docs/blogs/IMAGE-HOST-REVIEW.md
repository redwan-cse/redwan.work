# Image hostname review

The read-only security inventory returned four open CodeQL records, two each for the two image optimization expressions introduced in main's blog-thumbnail change. Both expressions matched substrings anywhere in the URL, so a path/query or a lookalike host could satisfy them.

The branch keeps the legitimate CDN thumbnail behavior but shares a parsed URL policy requiring HTTPS, no credentials, the standard port and exact hostname equality for cdn.jsdelivr.net or raw.githubusercontent.com. Tests cover valid hosts, lookalike suffixes, path/query tricks, userinfo, non-HTTPS and nonstandard ports. This flag controls browser-vs-optimizer image handling, not general URL authorization; no broader server-fetch exploit is claimed solely from the alert.

No main commit is reverted or overwritten. The production alerts remain open until an approved merge/deployment and GitHub rescan establish their resolution. This branch change is not a reason to dismiss them manually.
