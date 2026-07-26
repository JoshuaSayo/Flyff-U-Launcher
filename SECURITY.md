# Security Policy

## Supported version

Security fixes are currently applied to the latest Flyff-U-Automation release line, `4.0.2-automation.x`.

## Reporting a vulnerability

Do not publish secrets, session data, cookies, captured templates, or exploit details in a public issue. Use GitHub's private vulnerability reporting for [JoshuaSayo/Flyff-U-Launcher](https://github.com/JoshuaSayo/Flyff-U-Launcher/security/advisories/new) when available. Include the affected version, operating system, reproducible steps, expected result, actual result, and the smallest safe diagnostic material.

## Sensitive data

Launcher profiles can contain authenticated Electron session cookies and local storage. Automation templates contain cropped pixels from the game view. Logs may include profile identifiers and runtime errors. Treat exported profiles, the Electron user-data directory, screenshots, templates, and logs as private.

## Automation boundary

The automation subsystem is intentionally limited to compositor-captured pixels, local configuration/templates, and foreground input for one explicitly selected client.

It must not gain a dependency on:

- the official Flyff API or API Fetch data;
- launcher plugins or their databases;
- process memory, code injection, network interception, or packet manipulation;
- game-page DOM access, `executeJavaScript`, Chromium debugging, or background input;
- anti-cheat bypass or evasion features.

Changes to `app/src/main/automation` must keep `boundary.test.ts` passing. Input emission must remain centralized in `inputFacade.ts`, and workbench mutations must remain restricted to the dedicated trusted renderer.

## Dependency policy

Production dependencies must pass `npm audit --omit=dev` before release. Development-only advisories inherited from Electron Forge or the lint/build toolchain must be reviewed and documented; do not use a forced audit fix that downgrades or breaks the application.
