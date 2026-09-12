# Scanner gate

Semgrep now uses the immutable OCI index digest for release 1.176.0, resolved from Docker Hub's tag metadata: sha256:12672acdb0949e19f9f6a4c2b288edd0b404f268f0ca7738a2c06f372f50362e . Sources: https://github.com/semgrep/semgrep/releases/tag/v1.176.0 and https://hub.docker.com/v2/repositories/semgrep/semgrep/tags/1.176.0 . No mutable latest image is used.

The scan step temporarily continues only so SARIF can upload. A final always-run gate checks the original step outcome and fails on findings or scanner failure. This replaces the old unconditional shell success. The community auto rules remain remotely selected, so the engine is pinned but the rule set is not claimed to be fully immutable.

Required-check/protection settings and GitHub-managed AI review are separate administrative gates. The current AI-review failures have not been waived. A prior unsupported-model failure does not prove the cause of a later failure without that run's evidence.
