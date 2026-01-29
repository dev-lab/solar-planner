# ☀️ Solar Planner

Mastering your solar configuration and efficiency tracking.

## Overview

**Solar Planner** helps you optimize solar panel placement and estimate energy generation with high precision. It combines astronomical calculations with historical weather patterns to produce both *ideal* and *realistic* energy estimates.

Key ideas:
- Precise location handling (reverse geocoding, timezone support)
- Interactive 3D orientation controls (azimuth & tilt)
- Weather-adjusted energy estimates using historical cloud cover
- Shadow/obstacle modeling and saved configuration comparisons

---

## Features

- **Location & Environment**
  - Auto-detect location via IP and optional "Pick on Map" for precise placement.
  - Reverse geocoding displays city and country.
  - Location name accuracy cached at ~110 m (0.001°).
  - Timezone offsets update automatically based on selected coordinates.

- **Panel Orientation**
  - Adjust **Azimuth** (horizontal direction) and **Tilt** (vertical angle).
  - Interactive 3D drag control + sidebar sliders.
  - `Optimize Orientation` finds best azimuth & tilt for:
    - Selected day
    - Custom period (e.g., April—October)
    - Full year
  - Optimizer samples representative days for a balance of accuracy and speed.

- **Energy Estimates**
  - **Ideal (Amber):** Energy under clear-sky (perfect) conditions.
  - **Real (Blue):** Weather-adjusted estimate using 3 years of cloud-cover data from Open‑Meteo.
  - **Efficiency Score:** Compares current setup against a perfectly oriented, unshaded panel at the same location.

- **Shadow Modeling (Obstacles)**
  - Define `From` and `To` times when the panel is shaded (trees, buildings).
  - App recalculates and displays energy loss immediately on charts and scores.

- **Comparisons & Saving**
  - Save configurations locally (IndexedDB): location, azimuth, tilt, nominal power (W), shadow ranges, timezone.
  - Quick-load by clicking a saved row; comparison table highlights yearly energy totals.

---

## Quick start

### Online
Simply visit the [Solar Planner](https://solar.etaras.com/).

### Offline / Local Development
Since the project uses no build tools, you can run it directly from the source:

1.  Clone this repository:
    ```bash
    git clone https://github.com/dev-lab/solar-planner.git
    ```
2.  Navigate to the `docs` folder (where the source code lives):
    ```bash
    cd solar-planner/docs
    ```
3.  Open `index.html` in your browser.

### Use it
1. Let the app detect your location automatically or click **Pick on Map** to set the exact site.
2. Drag the 3D panel or use the sliders to set **Azimuth** and **Tilt**.
3. Use **Optimize Orientation** to compute the best angle for a day, a custom period, or the full year.
4. Add shadow times (if applicable) to model energy loss from obstacles.
5. Click **Save Configuration** to store a setup locally and compare different options later.

---

## Developer notes

*Data & storage*
- Historical cloud-cover data: **Open‑Meteo** (3-year window).
- Saved configurations stored in **IndexedDB** on the device.

*Optimization algorithm*
- Samples representative days across the chosen range to quickly estimate the best tilt/azimuth with a good accuracy/performance tradeoff.

*Timezone handling*
- Timezone offsets are computed from the selected coordinates and update automatically.

---

## UI tips & pro tips

- **Pick on Map** for best accuracy (IP geolocation is convenient but less precise).
- **Azimuth:** 180° → due South (ideal in the Northern Hemisphere).
- **Tilt:** 0° → flat, 90° → vertical.
- When optimizing over a season (e.g., April—October), the tool balances daily production to maximize the chosen period’s yield rather than a single-day peak.

---

## License

This project is **Dual Licensed**:

1.  **Open Source (AGPLv3):** Ideal for hobbyists, educational use, and open-source projects.
2.  **Commercial License:** For proprietary use, internal corporate deployment without copyleft restrictions, or integration into closed-source workflows, a commercial license is available.

Please see [LICENSE](LICENSE) for details.
