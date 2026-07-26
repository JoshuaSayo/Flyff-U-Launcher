# Changelog

All notable changes made by the Flyff-U-Automation fork are documented here. Upstream launcher history remains available in the localized files under `app/patchnotes/`.

## Unreleased

### Added

- Beginner-friendly `AUTOMATION_INSTRUCTIONS.md` with the complete calibration, observer-mode, Combat FSM, recovery, and troubleshooting workflow.

### Fixed

- An acknowledged Combat FSM start now restores and transfers foreground focus to the selected game client before input ownership is armed.
- The workbench no longer clips the lower controls. Its right sidebar now scrolls independently, and the supervised-session controls remain visible at the top.

## [4.0.2-automation.1] - 2026-07-26

### Added

- Dedicated supervised Vision Automation Workbench for running launcher profiles.
- Compositor-backed frame capture that supports hardware-accelerated Electron game views.
- Per-profile calibration for player HP, target HP, and target scan regions.
- Local structural templates for target, loot, and death detection.
- Observer-only mode as the safe default.
- Foreground-only combat finite-state machine with searching, approaching, attacking, healing, looting, paused, and faulted states.
- Explicit supervision acknowledgement and global `Ctrl+Shift+F12` emergency stop.
- Central input ownership facade that releases tracked inputs on pause, stop, or failure.
- Hardened workbench window and sender-validated IPC boundary.
- Unit tests for configuration normalization, structural perception, FSM transitions, and architecture boundaries.
- `AUTOMATION.md`, `FORK_NOTICE.md`, and `SECURITY.md`.

### Changed

- Fork identity, package metadata, installer identifiers, update provider, and release URLs now target `JoshuaSayo/Flyff-U-Launcher`.
- Runtime dependencies updated to audited versions; the production dependency audit reports zero known vulnerabilities.
- The upstream rate-limiter test now uses a deterministic clock.

### Security

- Automation cannot import or consume API Fetch, plugin, network, quest, monster, or item data.
- Automation input is rejected unless the selected game client is focused.
- Focus loss, workbench close, death detection, and state timeouts pause input.
- No memory access, packets, DOM inspection, debugger control, client injection, or anti-cheat bypass is implemented.

### Known limitations

- Calibration is resolution- and UI-layout-specific.
- Hardware-accelerated capture requires the selected launcher game view to be rendered and visible.
- The inherited repository-wide lint baseline contains pre-existing findings outside the new automation modules.
- Development-only dependency audits include inherited Electron Forge and lint-toolchain advisories; production dependencies are clean.
