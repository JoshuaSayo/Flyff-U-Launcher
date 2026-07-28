# How to Use Flyff-U-Automation

This is the practical, click-by-click guide for the supervised Vision Automation Workbench. For technical architecture and security boundaries, see [AUTOMATION.md](AUTOMATION.md).

> **Account warning:** Automation may violate Flyff Universe rules and can put a game account at risk. The app requires supervision, but that does not make its use approved or risk-free.

## What you need

- Flyff-U-Automation installed or launched from the packaged application.
- At least one launcher profile.
- A Flyff Universe session opened from that profile.
- A stable game resolution, HUD scale, and window layout.
- Skills assigned to keyboard keys such as `1`, `2`, `3`, and `4`.

The automation controls one selected foreground game client. It does not control an external Brave, Chrome, or Edge window.

> **Required after upgrading to 4.0.2-automation.2:** The old vision regions and templates are cleared once because earlier builds captured the parent launcher background instead of the embedded game. Click **Refresh frame**, confirm you can see the actual Flyff game, and recalibrate the pixel regions and templates below. Your keys, thresholds, and timing settings are preserved.

## Quick start: Observer mode

Use Observer mode first. It analyzes the screen without sending mouse or keyboard input.

1. Open Flyff-U-Automation.
2. Start the launcher profile you want to observe.
3. Log in and enter the game manually.
4. In the session window, click the **★ Tools** button.
5. Select **Supervised Automation**.
6. Select the correct **Client profile** at the top of the workbench.
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

### Player HP region

Click **Player HP region**, then select only the colored interior of the player's HP bar.

- Include the full horizontal fill length.
- Exclude the frame, HP text, portrait, icons, and shadows.
- Calibrate while the bar is visible and preferably full.
- If the selection covers a large panel or much of the screen, the workbench rejects it; select only the bar interior.

Player HP calibration is required before Combat FSM mode can start.

### Target HP region

Select a monster manually so its HP bar appears. Refresh the frame, click **Target HP region**, and drag over only the colored interior of that target HP bar.

This region improves target-health telemetry. Keep it away from names, numbers, and the bar border.

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

### Death template

1. Display a known death or respawn dialog when safely possible.
2. Refresh the frame.
3. Click **Capture death dialog**.
4. Select a stable, distinctive part of the dialog.

When this template matches, automation pauses and requires manual recovery. Capturing it is strongly recommended.

## Test calibration in Observer mode

Before enabling combat:

1. Start **Observer only**.
2. Damage and heal the character manually; confirm the `HP` percentage moves in the correct direction.
3. Move the target template into and out of the scan area.
4. Confirm the `Target` score rises above the configured threshold only when the intended target is visible.
5. Repeat the same check for loot.
6. Pause and recalibrate any region that behaves incorrectly.

The default template threshold is `0.82`. It is applied to a normalized structural-correlation score. Reduce it only in small steps if the intended image does not match. Raise it if unrelated objects match. Never tune only while the intended target is visible; test absent-target frames too.

## Configure Combat FSM

| Field | Example | Meaning |
|---|---|---|
| Mode | Combat FSM | Enables supervised foreground input |
| Attack rotation | `1, 2, 3` | Keys cycled during attacking |
| Heal key | `4` | Key used below the heal threshold |
| Pickup key | `Z` | Fallback pickup key |
| Search/camera key | `RIGHT` | Periodic key used while searching |
| Heal below | `0.40` | Enter healing below 40% HP |
| Resume above | `0.75` | Return to attacking above 75% HP |
| Template threshold | `0.82` | Minimum accepted match score |
| Vision tick | `500` | Milliseconds between perception cycles |
| Action interval | `850` | Minimum delay between repeated actions |

Allowed keys are letters, digits, arrows, `Space`, `Tab`, and `F1` through `F12`. Attack keys must be separated with commas.

Click **Save profile** after changing the settings.

## Start Combat FSM

1. Confirm **Player HP region** is calibrated.
2. Confirm the target template badge says **ready**.
3. Select **Combat FSM**.
4. Check all configured keys and thresholds.
5. Click **Save profile**.
6. Check: **I am supervising the selected foreground client and accept the game-account risk.**
7. Click **Start**.

The acknowledged Start action restores and focuses the selected game session before arming input. If the client cannot receive foreground focus, the app refuses to arm.

Keep supervising the game. Opening another application or moving focus away from the selected client pauses automation.

## Understand the status

| Status | What the app is doing |
|---|---|
| `SEARCHING` | Looking for the target template and periodically using the search key |
| `APPROACHING` | Clicking the center of the matched target |
| `ATTACKING` | Cycling the configured attack keys |
| `HEALING` | Using the heal key until HP reaches the safe threshold |
| `LOOTING` | Clicking matched loot or using the pickup key |
| `PAUSED` | Sending no input; manual resume is required |
| `FAULTED` | Capture, client, or validation failed; read the reason shown |
| `STOPPED` | Runtime and input ownership are fully stopped |

The reason text below the status explains the last transition or safety stop.

## Pause, resume, and emergency stop

- **Pause** stops the active loop and releases tracked keys and mouse buttons.
- **Resume** requires the supervision checkbox again for Combat FSM mode.
- **Emergency stop** fully stops the session and releases input ownership.
- `Ctrl+Shift+F12` is the global emergency-stop shortcut.
- Closing the workbench pauses the session.
- A detected death, lost focus, or state timeout pauses the session.

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
- the Player HP region exists;
- the target template badge says **ready**;
- the supervision checkbox is checked;
- the selected game client can be restored and focused.

If the state immediately changes to **PAUSED** with “Death screen detected” while the character is alive, verify that you are running `4.0.2-automation.2` or newer. Refresh the frame, confirm it shows the game, then recapture a small death-dialog detail only when that dialog is actually visible.

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
- One selected foreground client is controlled at a time.
- Official API, API Fetch, quest, monster, item, and plugin data are intentionally unavailable to automation.
- The app does not read process memory, inspect packets, inspect the game DOM, modify the client, or bypass anti-cheat systems.
- Supervision safeguards reduce accidental unattended operation; they do not remove game-account or terms-of-service risk.
