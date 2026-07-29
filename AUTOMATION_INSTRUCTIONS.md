# How to Use Flyff-U-Automation

This is the practical, click-by-click guide for the supervised Vision Automation Workbench. For technical architecture and security boundaries, see [AUTOMATION.md](AUTOMATION.md).

> **Account warning:** Automation may violate Flyff Universe rules and can put a game account at risk. The app requires supervision, but that does not make its use approved or risk-free.

## What you need

- Flyff-U-Automation installed or launched from the packaged application.
- One launcher profile for Main.
- A different launcher profile for Support when using healer/buffer mode.
- A Flyff Universe session opened from each selected profile.
- A stable game resolution, HUD scale, and window layout.
- Skills assigned to keyboard keys such as `1`, `2`, `3`, and `4`.

The automation can control one explicit Main client and one explicitly paired Support client while either Flyff or the Automation Workbench remains in front. Both must be embedded launcher sessions; external Brave, Chrome, or Edge windows are not supported.

> **Required after upgrading to 4.0.2-automation.2:** The old vision regions and templates are cleared once because earlier builds captured the parent launcher background instead of the embedded game. Click **Refresh frame**, confirm you can see the actual Flyff game, and recalibrate the pixel regions and templates below. Your keys, thresholds, and timing settings are preserved.

> **Automatic in 4.0.2-automation.8:** Existing profiles keep their calibration, but Main healing starts disabled. Incorrect player or target HP regions can no longer block basic targeting; the red combat crosshair is authoritative. Enable Main healing only after its HP telemetry is verified.

## Quick start: Observer mode

Use Observer mode first. It analyzes the screen without sending mouse or keyboard input.

1. Open Flyff-U-Automation.
2. Start the launcher profile you want to observe.
3. Log in and enter the game manually.
4. In the session window, click the **★ Tools** button.
5. Select **Supervised Automation**.
6. Select the correct **Main profile** at the top of the workbench.
7. Click **Refresh frame** and confirm the actual game scene is visible—not a black panel or blue/red launcher gradient.
8. Leave **Mode** set to **Observer only**.
9. Click **Save profile**.
10. Click **Start**.

The large preview is a periodically refreshed screenshot, not a live video feed. It normally refreshes about every 2.5 seconds while the workbench is visible.

Check the status panel:

- `OBSERVING` means perception is running without input.
- `HP` is the detected player HP after that region is calibrated.
- `Target` and `Loot` show structural match scores.
- `Capture` and `Analyze` show processing time.
- `Actions` should remain zero in Observer mode.

## Calibrate screen regions

Pause or stop automation before changing calibration.

For each region:

1. Arrange the game so the element is clearly visible.
2. Return to the workbench and click **Refresh frame**.
3. Click the required calibration button.
4. Drag a rectangle over the element in the preview.
5. Click **Save profile** after region changes.

### Player HP region (optional Main healing)

Click **Player HP region**, then select only the colored interior of the player's HP bar.

- Include the full horizontal fill length.
- Exclude the frame, HP text, portrait, icons, and shadows.
- Calibrate while the bar is visible and preferably full.
- If the selection covers a large panel or much of the screen, the workbench rejects it; select only the bar interior.

Player HP calibration is required only when **Use optional Main heal key** is enabled. With Main healing off, HP remains monitor-only and cannot block targeting.

Before enabling Main healing, run Observer mode while the HUD HP bar is full. Live `HP` should be near 100%. Recalibrate tightly around only the colored fill until the telemetry agrees.

### Target HP region (optional telemetry)

Select a monster manually so its HP bar appears. Refresh the frame, click **Target HP region**, and drag over only the colored interior of that target HP bar.

This region is optional telemetry. Keep it away from names, numbers, and the bar border. The red crosshair confirms combat engagement even when no target-HP region is configured.

Flyff shows a white crosshair after selection and a red crosshair after combat engages. You do not calibrate either crosshair: the workbench detects the red marker structurally near the clicked monster.

### Target scan area

Click **Target scan area** and draw one large rectangle over the part of the game world where monsters and loot normally appear.

- Exclude chat, skill bars, menus, player status panels, and other fixed UI.
- A smaller scan area is faster and produces fewer false matches.
- Do not make the scan area smaller than the target or loot template.

## Capture structural templates

Templates are saved locally for the selected profile. The badge changes from **missing** to **ready** after a successful capture.

### Target template

1. Stand near the monster type you want to recognize.
2. Make one monster label or another stable visual feature clearly visible.
3. Refresh the frame.
4. Click **Capture target label**.
5. Drag a tight rectangle around the distinctive label or feature.

Use a small structure with clear edges. Avoid animated effects, the surrounding landscape, or a large part of the monster. Oversized and low-detail selections are rejected because they create false matches. A target template is required for Combat FSM mode.

### Loot template

1. Place a representative drop on the ground.
2. Refresh the frame.
3. Click **Capture loot**.
4. Drag tightly around the stable loot label or icon.

If no loot template is captured or matched, the FSM uses the configured **Pickup key** during looting.

### Death template (optional)

1. Display a known death or respawn dialog when safely possible.
2. Refresh the frame.
3. Click **Capture death dialog (optional)**.
4. Select a stable, distinctive part of the dialog.

The saved template is ignored unless you enable **Pause when the optional death-dialog template is visually confirmed** or enable auto-resurrection. When enabled for combat, a match pauses automation for manual recovery. Auto-resurrection uses the same template to decide when to cast the configured resurrection key and pauses if its verification limit is exhausted. Capture only a distinctive dialog element—never grass, terrain, sky, or another ordinary game-scene patch.

## Test calibration in Observer mode

Before enabling combat:

1. Start **Observer only**.
2. Damage and heal the character manually; confirm the `HP` percentage moves in the correct direction.
3. Move the target template into and out of the scan area.
4. Confirm the `Target` score rises above the configured threshold only when the intended target is visible.
5. Repeat the same check for loot.
6. Pause and recalibrate any region that behaves incorrectly.

The default target threshold is `0.60`. It is applied to a normalized structural-correlation score, and live status shows `Target score / need`. The demonstrated 65.4% match clears this default. Selection HP plus the red crosshair still verify that the following click actually targeted and engaged a monster. Raise the threshold if unrelated objects match, and always test absent-target frames too.

## Set up Main and Support

This replaces SmartFS's name scan with explicit launcher profile pairing. The launcher already knows each profile and its configured character name, so you choose the roles directly.

### Fastest basic healer setup (recommended)

1. Create separate launcher profiles for the Main character and Ringmaster/healer.
2. Open both profiles, log in manually, and put them in **Grid View** or a two-client Split layout so both game surfaces remain rendered.
3. Open the workbench for Main and select **Support healer/buffer** mode.
4. Click **Apply starter preset**. It enables only Main healing and follow with conservative defaults.
5. Under **Support client**, select the Ringmaster/healer.
6. Open the party panel on Support and make sure Main is visible.
7. Click **1. Main party HP**. The preview switches to Support. Drag only over the colored interior of Main's party HP bar.
8. Click **2. Main party row** and drag over Main's clickable name row.
9. Confirm the Support heal and follow keys match the game's action bar.
10. Use the **Setup Assistant** checklist. When every required row is checked, click **Save profile**.
11. Check the supervision acknowledgement and click **Start Support**.

That is the complete minimum setup. The detailed emergency, optional self-care, resurrection, and advanced timing sections stay collapsed until you need them. The assistant reports exactly what is missing instead of letting Start fail silently.

The role selection is stored on the Main automation profile. Main and Support cannot be the same launcher profile.

### Verify basic healing

1. Keep Main or the Automation Workbench in the foreground.
2. Watch **Main party** in the status metrics. Damage Main manually and confirm the percentage decreases.
3. When it passes **Heal Main below**, confirm Support clicks Main's calibrated row and uses the heal key.
4. Confirm healing continues only until **Heal Main until** is reached.
5. Read **Support** for the last action, such as `Heal 4` or `Auto-follow Z`.
6. Stop and correct calibration immediately if Support selects the wrong party member.

After this test, select **Combat + Support** if you want the existing Main Combat FSM and the Support healer/buffer scheduler running together.

### Add Main and self buffs

Enter one buff per comma using `key:seconds:target`:

- `1:600:main` selects Main and casts key 1 every 600 seconds.
- `F3:900:self` presses the configured deselect key, then casts F3 on Support every 900 seconds.

The default deselect key is **Backquote**. It must match the game's “clear target” binding before using self-heal or self-targeted buffs. Each buff has an independent timer.

### Enable optional self-care

Enable optional features one at a time and verify each metric before enabling the next:

1. **Support self-heal:** enable it, set the key and thresholds, then calibrate **Support HP** over Support's own red HP fill.
2. **MP potion:** enable it, set the key and cooldown, then calibrate **Support MP** over Support's own blue MP fill.
3. Confirm **Support HP** and **Support MP** move correctly in the status panel.

The Setup Assistant adds a required calibration row only for the optional feature you enabled.

### Enable auto-resurrection

1. Capture a small, reliable **death dialog** template while Main is dead.
2. Enable auto-resurrection and set the Support resurrection key.
3. Keep the default bounded retry interval and attempt limit for the first test.
4. Supervise a safe test. The scheduler selects Main, casts resurrection, and verifies success by waiting for Main party HP to return.
5. If HP is not restored after the configured attempts, automation pauses instead of retrying forever.

Support action priority is:

1. Verified auto-resurrection.
2. Emergency Main healing.
3. Support self-healing.
4. Stable normal Main healing.
5. Support MP potion.
6. One due Main- or self-targeted buff.
7. Periodic auto-follow.

Normal healing requires the configured number of consecutive low-HP samples. Emergency healing reacts immediately below its lower threshold. This helps reject a single noisy HP reading without delaying critical healing.

Do not open DevTools or activate controller **Forward Hold** on either automated client while automation is armed. Main and Support input use the same restricted Chromium `Input` mechanism, so automation fails closed instead of competing for an existing debugger attachment.

## Configure Combat FSM

| Field | Example | Meaning |
|---|---|---|
| Mode | Combat FSM | Enables supervised Chromium input |
| Use optional Main heal key | Off | Enable only after Player HP reads correctly |
| Pause on death dialog | Off | Optional; enable only after capturing a distinctive death-dialog detail |
| Use skill keys | Off | Optional; click-to-attack works without skills |
| Skill rotation (optional) | `1, 2, 3` | Keys cycled only after red-crosshair confirmation |
| Heal key | `4` | Key used below the heal threshold |
| Pickup key | `Z` | Fallback pickup key |
| Search/camera key | `RIGHT` | Periodic key used while searching |
| Heal below | `0.40` | Enter healing below 40% HP |
| Resume above | `0.75` | Return to attacking above 75% HP |
| Target match threshold | `0.60` | Minimum accepted label score before click verification |
| Vision tick | `500` | Milliseconds between perception cycles |
| Action interval | `850` | Minimum delay between repeated actions |

Allowed keys are letters, digits, arrows, `Space`, `Tab`, `Escape`, `Backquote`, and `F1` through `F12`. Optional skill keys must be separated with commas. Leave **Use skill keys** off for normal click-to-attack.

Click **Save profile** after changing the settings.

## Start Combat FSM

1. Confirm the target-label template badge says **ready**.
2. Confirm the Monster scan area covers the visible monsters.
3. Select **Combat FSM**.
4. Leave optional Main healing and skill keys off for the first test.
5. Click **Save profile**.
6. Check: **I am supervising the Main client or this Workbench and accept the game-account risk.**
7. Click **Start**.

The acknowledged Start action restores and initially focuses the selected game session before arming Chromium input. If the client cannot receive initial focus, the app refuses to arm. After Start, you may keep either Flyff or the Automation Workbench in front.

Keep supervising the game. Focusing an unrelated application pauses automation; switching between the selected Flyff window and the Automation Workbench does not.

The target gate is deliberate:

1. The scan finds the saved monster label.
2. The app automatically shifts below the label and clicks the monster body to select it.
3. If necessary, the app clicks the same monster again to engage it.
4. `ATTACKING` begins only after a red crosshair is detected near that monster.

A white crosshair or a visible monster label alone is not accepted as combat. Selection/engagement retries are limited to three clicks and the approach timeout still applies.

## Understand the status

| Status | What the app is doing |
|---|---|
| `SEARCHING` | Looking for the target template and periodically using the search key |
| `APPROACHING` | Clicking below the matched label and waiting for a red crosshair |
| `ATTACKING` | Continuing click-to-attack; optional skill keys run only when enabled |
| `HEALING` | Using the heal key until HP reaches the safe threshold |
| `LOOTING` | Clicking matched loot or using the pickup key |
| `SUPPORTING` | Running the bounded Support priority scheduler; inspect Main/Support HP, MP, burst, resurrection attempts, and last action |
| `PAUSED` | Sending no input; manual resume is required |
| `FAULTED` | Capture, client, or validation failed; read the reason shown |
| `STOPPED` | Runtime and input ownership are fully stopped |

The reason text below the status explains the last transition or safety stop.

## Pause, resume, and emergency stop

- **Pause** stops the active loop and releases tracked keys and mouse buttons.
- **Resume** requires the supervision checkbox again for every input-emitting mode.
- **Emergency stop** fully stops the session and releases input ownership.
- `Ctrl+Shift+F12` is the global emergency-stop shortcut.
- Closing the workbench pauses the session.
- A detected death pauses the session only when optional death detection is enabled; bounded auto-resurrection enables that detector automatically. Focus outside Flyff/the Workbench or a state timeout always pauses.

After a pause, correct the cause, return to the workbench, acknowledge supervision, and click **Resume**.

## If the preview is black

The preview should show the selected launcher game view. If it is black:

1. Confirm the selected profile is open inside a Flyff-U-Automation session.
2. Do not select an external Brave, Chrome, or Edge game window.
3. Restore the session window if it is minimized.
4. Wait until the game is fully loaded.
5. Keep the game view visible and click **Refresh frame**.
6. Restart the launcher after updating the graphics driver if the visible Electron game view is also black.

On Windows and macOS, the app captures the selected embedded game `WebContents` directly. It does not use GDI/BitBlt and it does not capture the parent launcher renderer behind the game.

## If combat does not start

Read the error toast and verify:

- the selected profile is currently open;
- **Combat FSM** is saved;
- the target template badge says **ready**;
- the supervision checkbox is checked;
- the selected game client can be restored and focused.

Watch the live **Selected** and **Crosshair** values:

- **HP monitor only** means Main healing is disabled and cannot block targeting. Enable it only after full HUD HP reads near 100%.
- **Target below need** means no click will be sent yet. Version 4.0.2-automation.6 migrated the former 82% default to 60%.
- **Selected** is optional target-HP telemetry and may remain `no` without blocking combat.
- **Crosshair: no** after a click means Flyff did not engage combat. The app retries the same point up to its bounded limit.
- **Crosshair: RED** is the only condition that opens the attacking state.
- If you enabled skill keys, confirm the rotation contains valid keys. Skills are not required when the toggle is off.

If the state immediately changes to **PAUSED** with “Death screen detected” while the character is alive, install `4.0.2-automation.7`. Leave optional death detection off, or recapture a small distinctive death-dialog detail only while that dialog is actually visible. A grass or terrain crop will match ordinary gameplay and is not a valid death template.

## If Support does not heal or buff

Verify:

- Main and Support are different launcher profiles and both sessions are open.
- The workbench preview says **Support view** during party calibration.
- **Main party HP** covers only Main's party HP fill.
- **Main party row** covers Main's clickable name row.
- Buff entries use `key:seconds:target`, for example `1:600:main, F3:900:self`.
- Main or the Automation Workbench remains focused.
- DevTools is closed and controller Forward Hold is disabled for both automated clients.
- The status **Main party** value is changing and **Support** shows dispatched actions.
- Optional self-heal has a calibrated **Support HP** region and a valid metric.
- Optional MP potion has a calibrated **Support MP** region and a valid metric.
- Auto-resurrection has a reliable death template and is not paused after its configured attempt limit.

If the Support preview is blank, place both profiles in Grid/Split view, wait for both games to render, and refresh again.

## If detection is unreliable

- Restore the resolution and HUD scale used during calibration.
- Re-capture templates after changing zoom, resolution, layout, or UI scaling.
- Tighten the target scan area.
- Use smaller templates with stronger, distinctive edges.
- Raise the threshold to reduce false matches.
- Lower the threshold gradually to recover missed matches.
- Validate every change in Observer mode before re-arming combat.

## Important limitations

- The workbench operates only on pixels currently rendered by the selected launcher client.
- Calibration is specific to the profile's resolution and visual layout.
- One explicit Main and one explicitly paired Support client can be controlled together while Flyff or the Workbench is the active application.
- Official API, API Fetch, quest, monster, item, and plugin data are intentionally unavailable to automation.
- Main and paired Support input use only the CDP `Input` domain. The app does not evaluate page JavaScript, inspect the game DOM, read process memory or packets, modify the client, or bypass anti-cheat systems.
- Supervision safeguards reduce accidental unattended operation; they do not remove game-account or terms-of-service risk.
