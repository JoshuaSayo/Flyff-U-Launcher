# Supervised Vision Automation

Flyff-U-Automation adds a local, foreground-only automation workbench to the upstream launcher. The feature is designed for explicit setup and continuous human supervision. It does not promise compliance with Flyff Universe rules, and using it may put a game account at risk.

## Scope and trust boundary

Automation may use:

- pixels captured from the selected Electron game view through the host window compositor;
- locally saved regions of interest and image templates;
- the selected client's foreground input channel;
- per-profile settings stored under the launcher's user-data directory.

Automation does not use:

- game-process memory, injection, hooks, or client modification;
- network packets, traffic interception, or protocol emulation;
- DOM queries, JavaScript evaluation in the game page, or Chromium debugging;
- official Flyff API data, API Fetch output, plugins, quest data, item data, or monster databases;
- background input or control of an unfocused client;
- anti-cheat bypasses or claims of undetectability.

The architectural boundary is enforced by an automated test in `app/src/main/automation/boundary.test.ts`. All emitted automation input is centralized in `app/src/main/automation/inputFacade.ts`.

## Before you start

1. Launch one profile in a session window and log in manually.
2. Use a stable resolution, UI scale, camera angle, and game HUD layout.
3. Put skills on the keys you intend to configure.
4. Keep the selected game client visible. Covered, minimized, resized, or visually changed clients can invalidate calibration.
5. Decide whether you only want telemetry or whether you accept the risk of arming the combat FSM.

## Open the workbench

In a running session, open **Tools > Supervised Automation**. Select the intended client profile, then click **Refresh frame**. The preview is captured from the same compositor-backed game view used by the launcher, so it avoids the black frames commonly returned by GDI capture of hardware-accelerated Chromium content.

Only the dedicated workbench can save automation configuration, capture templates, or start and control a run. Closing the workbench pauses an active run.

## Calibrate a profile

Choose a calibration action and drag a tight rectangle on the current preview:

- **Player HP region**: the colored fill area of the player's HP bar;
- **Target HP region**: the colored fill area of the active target's HP bar;
- **Target scan area**: the gameplay region where target and loot templates should be searched;
- **Capture target label**: a small, distinctive monster label or other stable target structure;
- **Capture loot**: a small, distinctive loot structure;
- **Capture death dialog**: a stable part of the death/respawn dialog.

Template matching is brightness-normalized and structural. Tight selections with distinctive edges work better than large areas, animated effects, or single flat colors. Capture templates at the same UI scale used during operation.

Click **Save profile** after changing regions, templates, keys, or thresholds. Calibration cannot be changed while the selected profile is armed; pause or stop first.

## Configure behavior

| Setting | Purpose | Default |
|---|---|---:|
| Mode | `Observer only` analyzes frames without input; `Combat FSM` may emit foreground input | Observer only |
| Attack rotation | Comma-separated keys cycled while attacking | 1, 2, 3 |
| Heal key | Key used below the heal threshold | 4 |
| Pickup key | Fallback key when no loot template is visible | Z |
| Search/camera key | Periodic key used while searching | Right |
| Heal below | Player HP ratio that enters healing | 0.40 |
| Resume above | Player HP ratio that returns to attacking | 0.75 |
| Template threshold | Minimum structural-match score | 0.82 |
| Vision tick | Delay between perception cycles | 500 ms |
| Action interval | Minimum interval between repeated actions | 850 ms |

The implementation also bounds approach, loot, and global state timeouts. Invalid or unsafe values are normalized before they are persisted.

## Run safely

Start with **Observer only** and confirm that the HP values and template scores react correctly. Observer mode never claims the input facade.

To use **Combat FSM**:

1. Capture at least a target template and complete the important HP/scan regions.
2. Select **Combat FSM** and save the profile.
3. Focus the selected game client.
4. Check the supervision acknowledgement.
5. Click **Start** and continue watching both the client and status panel.

Combat mode pauses when the client loses focus. It also pauses when the workbench closes, a death template matches, or a state exceeds its safety timeout. After correcting the cause, refocus the game client, acknowledge supervision again, and click **Resume**.

Use **Emergency stop** for a normal immediate stop, or press the global shortcut `Ctrl+Shift+F12` even when another window is active. Stop and pause both release all keys and mouse buttons tracked by the input facade.

## Finite-state behavior

| State | Behavior | Normal exit |
|---|---|---|
| Observing | Captures and analyzes without input | User pauses or stops |
| Searching | Looks for the target template and periodically sends the search key | Target match |
| Approaching | Clicks the center of the matched target | Target remains visible, or approach timeout |
| Attacking | Cycles configured attack keys | Target absent for three frames, or low player HP |
| Healing | Repeats the heal key at the action interval | Player HP reaches the safe threshold |
| Looting | Clicks matched loot or uses the fallback pickup key | Loot timeout with no visible loot |
| Paused | No input; held input is released | Explicit supervised resume |
| Faulted | No input after capture, validation, or client errors | Correct the problem and start again |

## Troubleshooting

### The preview is black

- Confirm the game is running inside a launcher session rather than a separate external browser.
- Restore the session if it is minimized and keep the chosen view visible.
- Click **Refresh frame** after the game finishes loading.
- Update the graphics driver and restart the launcher if Electron's compositor itself is black.

The automation preview intentionally uses the launcher compositor instead of Win32 BitBlt. If the visible launcher game view is correct but the preview remains black, attach the launcher log and a screenshot to a GitHub issue.

### HP is missing or inaccurate

- Select only the interior colored fill of the bar.
- Avoid the frame, numbers, icons, shadows, and overlapping effects.
- Recalibrate after changing resolution, HUD scale, theme, or layout.

### Target or loot does not match

- Capture a smaller, visually distinctive structure.
- Keep the template inside the target scan area.
- Start with the default threshold, then reduce it in small steps while observing false matches.
- Re-capture after a UI-scale or resolution change.

### The session pauses immediately

Read the status reason. Focus loss, death detection, and state timeouts intentionally pause. A capture or selected-client error moves the runtime to **Faulted**.

## Data and logs

Configuration and locally captured templates are stored under the application's Electron `userData/automation` directory, separated by profile. Runtime transitions and faults use the existing launcher log. Templates can contain parts of the visible game screen; treat profile data and exported diagnostics as private.

## Development verification

From the `app` directory:

```powershell
npm ci
npx tsc --noEmit
npx vitest run
npx eslint src/main/automation src/renderer/automation src/shared/automation.ts
npm audit --omit=dev
npm run package
```

The repository-wide lint baseline includes inherited upstream findings. New automation modules are linted separately and are expected to pass without warnings.
