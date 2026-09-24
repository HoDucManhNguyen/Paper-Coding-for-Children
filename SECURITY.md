# Security and privacy

## Supported version

The latest commit on the default branch is supported.

## Reporting a vulnerability

Please open a GitHub security advisory for the repository rather than a public issue. Include reproduction steps, affected browser/device, and impact. Do not attach identifiable images of children.

## Security model

- The arithmetic interpreter does not use `eval`, `Function`, or dynamic imports derived from user input.
- Camera access requires an explicit browser permission and user action.
- The application includes no analytics, account, database, remote OCR provider, or persisted image storage.
- The local macOS service binds only to 127.0.0.1. Its OCR endpoint checks Host/Origin and a custom header, accepts only bounded image bodies, and permits one process at a time with a 30-second deadline.
- Images travel through process stdin, not temporary files. No OCR text or request bodies are logged. A cancelled client request cannot replace a later result.
- A Content Security Policy limits scripts and network requests to the application origin. The printed-text fallback assets are bundled.
- OCR text and images are untrusted. The DOM is updated through text nodes, not raw HTML.

Do not expose the Python development service to a public interface or a reverse proxy. Any school deployment needs a separate authentication and data-handling design. Apple Vision models are system supplied; record the macOS version for reproducibility.
