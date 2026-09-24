# Security and privacy

## Supported version

The latest commit on the default branch is supported.

## Reporting a vulnerability

Please open a GitHub security advisory for the repository rather than a public issue. Include reproduction steps, affected browser/device, and impact. Do not attach identifiable images of children.

## Security model

- The arithmetic interpreter does not use `eval`, `Function`, or dynamic imports derived from user input.
- Camera access requires an explicit browser permission and user action.
- The application includes no analytics, account, database, or upload endpoint.
- A Content Security Policy limits executable and network origins to the app and the pinned OCR distribution hosts.
- OCR text and images are untrusted. The DOM is updated through text nodes, not raw HTML.

For a school-controlled deployment, self-host Tesseract.js and its language assets, pin their hashes, and apply the institution’s data-protection review.
