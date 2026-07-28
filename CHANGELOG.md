# Changelog

All notable changes made by the Flyff-U-Automation fork are documented here. Upstream launcher history remains available in the localized files under `app/patchnotes/`.

## [4.0.2-automation.4] - 2026-07-28

### Added

- Guided setup assistant with an ordered readiness checklist, actionable preflight errors, mode-aware calibration buttons, and a one-click Support starter preset.
- Emergency burst healing that immediately preempts every maintenance action below a critical Main HP threshold.
- Consecutive-sample stability gating for normal healing to suppress one-frame HP-bar glitches.
- Optional Support self-heal using a configurable deselect key and independently calibrated Support HP bar.
- Optional MP-potion recovery using structural blue-bar detection and a dedicated anti-spam cooldown.
- Optional auto-resurrection with Main death-template detection, bounded retries, party-HP verification, and a safety pause after exhausted attempts.
- Main- and self-targeted timed buffs using the `key:seconds:target` format.
- Support HP, MP, emergency state, resurrection-attempt, and last-action telemetry.
- Focused tests for setup readiness, blue MP detection, priority preemption, self-targeting, migration, and resurrection exhaustion.

### Changed

- Basic Support controls remain visible while emergency, self-care, resurrection, and timing sections use progressive disclosure.
- Support priority is now resurrection, emergency Main heal, Support self-heal, stable Main heal, MP potion, one due buff, then verified auto-follow.
- Auto-follow retargets the calibrated Main row when the preceding action targeted Support.
- Automation configuration schema is now version 4. Existing version 3 pairing, vision calibration, and buff schedules migrate without destructive reset; legacy buffs default to Main.
- Supported input keys now include `BACKQUOTE` and `ESCAPE` for configurable target deselection.

### Safety

- Optional features are disabled by default and add their calibration requirements to the setup checklist only when enabled.
- Resurrection never runs without a captured Main death template and never retries indefinitely.
- Main remains the required foreground client. Background delivery remains restricted to the paired Support client and the CDP `Input` domain.

## [4.0.2-automation.3] - 2026-07-28

### Added

- Explicit Main and Support profile pairing using launcher-owned profile identities and character labels.
- `Support healer/buffer` and `Combat + Support` modes.
- Support-view calibration for the Main character's party HP bar and clickable party row.
- Reactive Support healing with low/safe HP hysteresis, independently scheduled buff keys, and periodic auto-follow.
- Main-party HP and last Support action telemetry in the workbench.
- Dedicated tests for schema migration, support FSM behavior, paired capture, and background Support key/click delivery.

### Changed

- Automation configuration schema is now version 3. Version 2 vision calibration is preserved during migration.
- The centralized input facade may use only the CDP `Input` domain for the explicitly paired background Support client. It does not evaluate JavaScript, inspect the DOM, read network traffic, or consume official API/plugin data.

### Security

- The Main client must remain focused for every armed mode.
- Support input ownership is released on pause, stop, fault, workbench close, or emergency stop.
- Support mode refuses to start without two different live profiles and both Support-view party calibrations.
- DevTools and controller Forward Hold cannot share the Support client's debugger attachment; the runtime fails closed with an actionable error.

## [4.0.2-automation.2] - 2026-07-28

### Added

- Beginner-friendly `AUTOMATION_INSTRUCTIONS.md` with the complete calibration, observer-mode, Combat FSM, recovery, and troubleshooting workflow.

### Changed

- Template matching now uses normalized cross-correlation so the configured confidence threshold measures structural similarity instead of brightness error.
- Version 1 vision calibration is invalidated once on upgrade because it was captured from the wrong rendering surface. Behavior and key settings are preserved.

### Fixed

- Windows automation capture now reads the selected game `WebContents` surface directly instead of capturing the parent session renderer behind its embedded BrowserView.
- Template capture rejects oversized or low-detail selections that are likely to produce false target, loot, or death matches.
- HP calibration rejects implausibly large regions instead of silently accepting most of the screen.
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
