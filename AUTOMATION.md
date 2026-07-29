# Supervised Vision Automation

Flyff-U-Automation adds a local, supervised automation workbench to the upstream launcher. It can control one explicit Main client and one explicitly paired Support client while either Flyff or the hardened Workbench remains in front. It does not promise compliance with Flyff Universe rules, and using it may put a game account at risk.

For a beginner-friendly click-by-click walkthrough, start with [AUTOMATION_INSTRUCTIONS.md](AUTOMATION_INSTRUCTIONS.md).

## Scope and trust boundary

Automation may use:

- pixels captured directly from the selected embedded game `WebContents` on Windows and macOS, with the platform-safe host capture fallback retained on Linux;
- locally saved regions of interest and image templates;
- the CDP `Input` domain for keyboard and mouse delivery to the explicit Main client and one explicitly paired Support client;
- per-profile settings stored under the launcher's user-data directory.

Automation does not use:

- game-process memory, injection, hooks, or client modification;
- network packets, traffic interception, or protocol emulation;
- DOM queries, JavaScript evaluation, or CDP Runtime/DOM/Network inspection;
- official Flyff API data, API Fetch output, plugins, quest data, item data, or monster databases;
- input delivery to any client other than the explicit Main and paired Support profiles;
- anti-cheat bypasses or claims of undetectability.

The architectural boundary is enforced by an automated test in `app/src/main/automation/boundary.test.ts`. All emitted automation input is centralized in `app/src/main/automation/inputFacade.ts`.

## Before you start

1. Launch the Main profile and, for paired support, a different Support profile in a session window and log in manually.
2. Use a stable resolution, UI scale, camera angle, and game HUD layout.
3. Put skills on the keys you intend to configure.
4. Keep both clients rendered in a Grid/Split layout while calibrating paired support.
5. Decide whether you want observer telemetry, Main combat, Support healer/buffer, or both combat and support.

## Open the workbench

In a running session, open **Tools > Supervised Automation**. Select the intended client profile, then click **Refresh frame**. On Windows and macOS, the preview comes directly from the selected embedded game `WebContents`, not from the parent session renderer behind it. This avoids both GDI black frames and the launcher's decorative background appearing in place of the game.

Only the dedicated workbench can save automation configuration, capture templates, or start and control a run. Closing the workbench pauses an active run.

## Calibrate a profile

Choose a calibration action and drag a tight rectangle on the current preview:

- **Player HP region (optional)**: the colored fill area of the player's HP bar, used only when Main healing is enabled;
- **Target HP region (optional)**: the colored fill area of the active monster's HP bar for telemetry;
- **Target scan area**: the gameplay region where target and loot templates should be searched;
- **Main party HP (Support view)**: the colored fill inside the Main character's party HP bar as seen by Support;
- **Main party row (Support view)**: the Main character's name row that Support clicks before casting;
- **Support HP (Support view)**: the colored fill inside Support's own HP bar, required only when Support self-heal is enabled;
- **Support MP (Support view)**: the colored fill inside Support's own blue MP bar, required only when MP potion is enabled;
- **Capture target label**: a small, distinctive monster label or other stable target structure;
- **Capture loot**: a small, distinctive loot structure;
- **Capture death dialog (optional)**: a stable, distinctive part of the death/respawn dialog; required only when optional death detection or Support auto-resurrection is enabled.

Template matching is brightness-normalized and structural. Tight selections with distinctive edges work better than large areas, animated effects, or single flat colors. Capture templates at the same UI scale used during operation.

The red combat crosshair does not require a separate template. After the monster-body click, the analyzer searches near that stored click point for saturated red pixels arranged in Flyff's multi-direction radial crosshair structure. This confirmation is authoritative even when target-HP telemetry is absent. A red bar, red text, or the white selection crosshair is insufficient.

Version `4.0.2-automation.2` migrates the vision configuration to schema version 2. The first load preserves behavior, keys, and timing but clears version 1 HP regions and target/loot/death templates because those pixels may have come from the parent renderer. Confirm that the preview visibly shows Flyff, then recalibrate once. Oversized HP regions and oversized or low-detail templates are rejected.

Click **Save profile** after changing regions, templates, keys, or thresholds. Calibration cannot be changed while the selected profile is armed; pause or stop first.

## Configure behavior

| Setting | Purpose | Default |
|---|---|---:|
| Mode | `Observer only` analyzes frames without input; `Combat FSM` may emit supervised Chromium input | Observer only |
| Main healing | Opt-in player-HP gate and heal key; requires a tight Player HP region | Disabled |
| Pause on death dialog | Opt-in local template match; also active when bounded Support resurrection is enabled | Disabled |
| Use skill rotation | Opt-in skill keys after the red crosshair is confirmed | Disabled |
| Skill rotation | Optional comma-separated keys cycled while engaged | 1, 2, 3 |
| Heal key | Key used below the heal threshold | 4 |
| Pickup key | Fallback key when no loot template is visible | Z |
| Search/camera key | Periodic key used while searching | Right |
| Heal below | Player HP ratio that enters healing | 0.40 |
| Resume above | Player HP ratio that returns to attacking | 0.75 |
| Target match threshold | Minimum structural-match score; the red crosshair verifies the subsequent click | 0.60 |
| Vision tick | Delay between perception cycles | 500 ms |
| Action interval | Minimum interval between repeated actions | 850 ms |
| Support client | Different live launcher profile containing the healer/buffer | None |
| Support heal key | Heal skill on the Support client's action bar | 4 |
| Heal Main below / until | Hysteresis thresholds for reactive healing | 0.50 / 0.80 |
| Heal interval | Minimum interval between reactive heals | 1100 ms |
| Emergency heal | Immediate Main heal threshold and faster repeat interval | 0.25 / 300 ms |
| Stable low samples | Consecutive low Main HP readings required for normal healing | 2 |
| Deselect key | Clears Main targeting before a self-only Support action | Backquote |
| Support self-heal | Optional Support HP thresholds, key, and interval | Disabled |
| MP potion | Optional Support MP threshold, key, and cooldown | Disabled |
| Auto-resurrection | Optional death-template-driven key, retry interval, and attempt limit | Disabled |
| Buffs | Comma-separated `key:seconds:target` entries, such as `1:600:main, F3:900:self` | Empty |
| Auto-follow key / interval | Periodically resumes following Main | Z / 5000 ms |

The implementation also bounds approach, loot, and global state timeouts. Invalid or unsafe values are normalized before they are persisted.

## Run safely

Start with **Observer only** and confirm that the HP values and template scores react correctly. Observer mode never claims the input facade.

To use **Combat FSM**:

1. Capture a small monster-name label and confirm the scan area covers the play field.
2. Leave **Main healing** and **Use skill rotation** off for the first normal click-to-attack test.
3. Select **Combat FSM** and save the profile.
4. Focus the selected game client, acknowledge supervision, and click **Start**. You may then keep either Flyff or the Automation Workbench in front.
5. Confirm telemetry changes to **Crosshair RED** before the state becomes **ATTACKING**.

The targeting sequence is deliberately gated:

1. Match a monster label.
2. Translate the match to a point below the label and click the monster body to select it.
3. Click again if the red crosshair has not appeared.
4. Enter **ATTACKING** only after the red crosshair is structurally confirmed.

Selection clicks are limited to three per approach attempt. Failure to obtain the red crosshair returns the FSM to searching after the approach timeout. Target HP remains visible as optional diagnostic telemetry when calibrated.

Combat mode pauses when neither the selected Flyff window nor the Automation Workbench has application focus. It also pauses when the workbench closes, an explicitly enabled death template matches, or a state exceeds its safety timeout. Death detection is disabled by default. After correcting the cause, return to Flyff or the Workbench, acknowledge supervision again, and click **Resume**.

To use paired Support with the shortest safe setup:

1. Put Main and Support in a launcher Grid/Split layout and select **Support healer/buffer** mode.
2. Click **Apply starter preset**. This enables only Main healing and follow; optional self-care and resurrection remain off.
3. Select the Ringmaster/healer under **Support client**. The same profile cannot fill both roles.
4. Open the party panel on Support.
5. Complete the two numbered buttons: **1. Main party HP** and **2. Main party row**.
6. Follow the live **Setup Assistant** until every required item is checked, then save and start while playing Main manually.

The workbench keeps emergency/stability settings, optional self-care, resurrection, and advanced timing in collapsed sections. Enable optional features one at a time after basic Main healing is verified. The assistant adds only the extra calibration each enabled feature needs.

Support action priority is:

1. Verified auto-resurrection.
2. Emergency Main healing.
3. Support self-healing.
4. Stable normal Main healing.
5. Support MP potion.
6. One due Main- or self-targeted buff.
7. Periodic auto-follow.

Each buff has its own next-due timestamp. Normal healing requires consecutive low readings and remains active until the safe threshold is reached; emergency healing reacts immediately. The Main client or Automation Workbench must remain in front, and input is delivered only to the selected Main and paired Support profiles.

Use **Emergency stop** for a normal immediate stop, or press the global shortcut `Ctrl+Shift+F12` even when another window is active. Stop and pause both release all keys and mouse buttons tracked by the input facade.

## Finite-state behavior

| State | Behavior | Normal exit |
|---|---|---|
| Observing | Captures and analyzes without input | User pauses or stops |
| Searching | Looks for the target template and periodically sends the search key | Target match |
| Approaching | Clicks below the matched label and retries the body click if needed | Red crosshair confirmation, or approach timeout |
| Attacking | Maintains click-to-attack and optionally cycles skill keys | Selected HP disappears for three frames, red crosshair is lost, or player HP is low |
| Healing | Repeats the heal key at the action interval | Player HP reaches the safe threshold |
| Looting | Clicks matched loot or uses the fallback pickup key | Loot timeout with no visible loot |
| Supporting | Runs the bounded Support priority scheduler and reports Main/Support HP, MP, burst, and resurrection telemetry | User pauses or stops |
| Paused | No input; held input is released | Explicit supervised resume |
| Faulted | No input after capture, validation, or client errors | Correct the problem and start again |

## Troubleshooting

### The preview is black

- Confirm the game is running inside a launcher session rather than a separate external browser.
- Restore the session if it is minimized and keep the chosen view visible.
- Click **Refresh frame** after the game finishes loading.
- Update the graphics driver and restart the launcher if Electron's compositor itself is black.

The Windows/macOS preview intentionally captures the selected game `WebContents` instead of Win32 BitBlt or the parent launcher window. If the visible launcher game view is correct but the preview remains black, attach the launcher log and a screenshot to a GitHub issue.

### HP is missing or inaccurate

- Select only the interior colored fill of the bar.
- Avoid the frame, numbers, icons, shadows, and overlapping effects.
- Recalibrate after changing resolution, HUD scale, theme, or layout.
- When Main healing is disabled, live HP is monitor-only and cannot block target search.
- Before enabling Main healing, confirm full HUD HP reads near 100%; otherwise recalibrate the tight colored fill first.
- For `Main party` telemetry, ensure the preview says **Support view** and select the Main's party HP bar—not Support's own HP.

### Support does not heal or buff

- Confirm both different profiles are open inside this launcher.
- Keep both profiles rendered in Grid/Split view during setup.
- Confirm the Support preview shows the Ringmaster/healer client.
- Recalibrate both **Main party HP** and **Main party row** from the Support view.
- Use `key:seconds:target` buff entries, for example `1:600:main, 2:600:main, F3:900:self`.
- Close DevTools and disable controller Forward Hold for both automated profiles; those features cannot share the Chromium input attachment.
- Read **Main party**, **Support HP**, **Support MP**, and **Support** in the status metrics to see perceived values and the last dispatched action.
- If self-heal or MP potion is enabled, calibrate the matching Support bar and verify its metric before arming.
- Auto-resurrection requires a reliable death template. It pauses after the configured attempt limit if Main HP is not restored.

### Target or loot does not match

- Capture a smaller, visually distinctive structure.
- Keep the template inside the target scan area.
- Start with the 0.60 default threshold. Live status shows `Target score / need`; raise it only if absent-target frames produce false matches.
- Re-capture after a UI-scale or resolution change.
- For a monster target, capture the name label tightly; the runtime automatically clicks below that label on the body.

### Monster is selected but combat does not begin

- Confirm the world scan area includes the monster and its crosshair but excludes chat and fixed red UI.
- Watch **Crosshair** telemetry. It must report `RED`; the white selection crosshair intentionally does not qualify.
- Target HP is optional telemetry in automation.8 and does not gate combat.
- Keep skill rotation disabled while testing. The second click should start Flyff's normal attack without pressing a skill.
- If the marker turns red in-game but telemetry does not, preserve the same resolution/HUD scale and attach a screenshot plus launcher log to an issue.

### The session pauses immediately

Read the status reason. Focus loss, enabled death detection, enabled Main healing, and state timeouts intentionally pause. A capture or selected-client error moves the runtime to **Faulted**. Version `4.0.2-automation.8` migrates Main healing to disabled so inaccurate HP telemetry cannot block basic targeting.

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
