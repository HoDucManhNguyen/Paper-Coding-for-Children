# Contributing

1. Keep the v1 language small and deterministic.
2. Add tests for every interpreter change.
3. Never add silent semantic correction without a research and consent review.
4. Do not add cloud image upload, analytics, or child-data persistence by default. The loopback-only OCR service must keep images in memory.
5. Run `npm test`, `npm run test:server`, and `npm run check` before proposing a change. Check native changes on macOS.
6. Test recognition using unmodified image content, not glyphs rearranged to fit the algorithm. Report failing examples as well as successful ones.

Bug reports should include the expected transcription, actual transcription, device/browser, and a synthetic or consented example image. Never post identifiable child data publicly.
