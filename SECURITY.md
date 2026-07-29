# Security Policy

## Supported version

Security fixes are currently applied to the latest Flyff-U-Automation release line, `4.0.2-automation.x`.

## Reporting a vulnerability

Do not publish secrets, session data, cookies, captured templates, or exploit details in a public issue. Use GitHub's private vulnerability reporting for [JoshuaSayo/Flyff-U-Launcher](https://github.com/JoshuaSayo/Flyff-U-Launcher/security/advisories/new) when available. Include the affected version, operating system, reproducible steps, expected result, actual result, and the smallest safe diagnostic material.

## Sensitive data

Launcher profiles can contain authenticated Electron session cookies and local storage. Automation templates contain cropped pixels from the game view. Logs may include profile identifiers and runtime errors. Treat exported profiles, the Electron user-data directory, screenshots, templates, and logs as private.

## Automation boundary

The automation subsystem is intentionally limited to captured pixels, local configuration/templates, and CDP `Input` events for the explicitly selected Main client and one explicitly paired Support client. Main party HP, Support HP, Support MP, selected-monster HP, red-crosshair engagement, and optional death state are derived only from explicitly calibrated pixel regions or local structural templates. Death matching is opt-in unless bounded Support resurrection needs it. Red-crosshair confirmation uses local HSV and radial pixel structure near the clicked target; it does not inspect game state through an API or the DOM.

It must not gain a dependency on:

- the official Flyff API or API Fetch data;
- launcher plugins or their databases;
- process memory, code injection, network interception, or packet manipulation;
- game-page DOM access, `executeJavaScript`, CDP Runtime/DOM/Network domains, or debugger use outside `inputFacade.ts`;
- anti-cheat bypass or evasion features.

The narrow input exception may attach Electron's Chromium debugger only to dispatch keyboard and mouse events through the CDP `Input` domain to the selected Main and paired Support clients. It must never evaluate page JavaScript, inspect the DOM, read traffic, or attach to an unpaired client. Optional Main healing, Support self-heal, MP potion, and auto-resurrection reuse that same isolated input path; healing is opt-in and resurrection attempts are finite and verified through captured Main-party HP pixels. Main-client target selection is bounded to three click attempts and requires a local structural red-crosshair confirmation. Either the selected Flyff window or the hardened Automation Workbench must remain focused while automation is armed; focus on an unrelated application pauses the run.

Changes to `app/src/main/automation` must keep `boundary.test.ts` passing. All Main and Support input emission must remain centralized in `inputFacade.ts`, and workbench mutations must remain restricted to the dedicated trusted renderer.

## Dependency policy

Production dependencies must pass `npm audit --omit=dev` before release. Development-only advisories inherited from Electron Forge or the lint/build toolchain must be reviewed and documented; do not use a forced audit fix that downgrades or breaks the application.
