# Security notes (trial build)

Review date: 2026-10-23. Scope: app code, engine, export, local storage, and dependencies.

## Fixed in this review

- **Hang on hostile feet-inches input.** The parser used a pattern with overlapping whitespace
  quantifiers; a 3,000-space entry took over a minute. Replaced with a linear pattern on
  whitespace-stripped text, with an entry length cap. Test: `tests/security.test.ts`.
- **Unbounded plot and room sizes.** Any positive number was accepted, so a very large plot could
  make the search and furniture placement slow. Generation now refuses plots outside 10-200 ft,
  setbacks outside 0-100 ft, and room sizes outside 2-60 ft, with a message. `engine/limits.ts`.
- **Damaged saved-plan store.** Saved plans are now shape-checked on load; anything malformed is
  dropped rather than rendered.
- **Unused dependency.** `expo-linking` was installed but never imported. Removed.

## Checked and fine

- No secrets, tokens or keys in the repository.
- No `dangerouslySetInnerHTML`, `eval`, or `WebView`; no network calls from the app.
- PDF and SVG output escapes every text value. Room labels and project names are fixed strings
  or numbers from the form.
- DXF text strips line breaks, so a value cannot inject a DXF group code.
- No Android permissions requested. Storage is AsyncStorage on the device; saved plans hold
  dimensions and choices only, with no personal data.

## Open (not fixed)

- **Dependency advisories (npm audit: 49 at high or critical).** Most are in build and dev
  tooling: Metro, Jest, Vite, tar, and the Expo CLI. They are not in the phone bundle, but
  `tar` matters on any build machine that unpacks untrusted archives. The direct `vitest`
  critical (Vitest UI server file read) only applies when the test UI is running, which is not
  part of this project's scripts. Fixing these needs major upgrades (Expo SDK 58, React Native
  0.88, Vitest 5). Plan that as its own step with the test suite.
- **Web PDF path** writes HTML into a new window with `document.write`. The content is escaped
  and built from fixed templates, so the risk is low. Using a blob URL with `noopener` would
  remove it entirely; not done yet because printing needs the window reference.
- **Plan storage is not encrypted.** It holds no personal data, so this is acceptable for the
  trial. Revisit if accounts are added.
