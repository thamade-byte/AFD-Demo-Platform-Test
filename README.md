# SOLARIS AFRICA - Solar Grid Monitoring Dashboard (V1 Demo)

A modern, self-contained single-page SCADA web application that enables energy operators to monitor solar energy production across multiple African regions in real-time.

Compliant with the Product Requirements Document (`PRD.md`) and the Design System (`Design-System.md`).

---

## 🚀 Live Demo Quick Access

The platform is running on your local machine:
- **Local URL**: [http://localhost:3000](http://localhost:3000) (or [http://127.0.0.1:3000](http://127.0.0.1:3000))

---

## 🛠 Tech Stack

- **Tailwind CSS**: Modern utility-first responsive styling with custom Solaris design tokens (Solar Yellow `#F9D648`, Energy Green `#73C66E`, Deep Navy `#0F172A`).
- **Leaflet.js**: Vector GIS mapping engine configured **without proprietary tile servers** (no Mapbox, Google Maps, or Carto API keys, zero watermarks).
- **Chart.js**: High-performance diurnal generation and forecast charts with custom light/dark theme adaptation and dual-axis telemetry.
- **Lucide Icons**: Crisp SVG iconography for SCADA indicators, alerts, and navigation.
- **Standalone Africa GeoJSON**: High-precision vector layer containing all 55 African countries with regional groupings.

---

## 🌟 Key Features

### 1. Interactive Africa Map (Zero API Keys)
- **100% Vector GeoJSON Map**: Pan, zoom, and select country boundaries across Africa without external tile servers.
- **Pan-African Transmission Corridors**:
  - **WAPP** (West African Power Pool, 330 kV / 225 kV AC) with animated current flow.
  - **SAPP** (Southern African Power Pool, 533 kV HVDC / 400 kV AC) with regional interconnectors.
  - **EAPP** (Eastern Africa Power Pool, 500 kV HVDC / 220 kV AC) cross-border intertie.
- **Solar Plant Substations**: 22 authentic utility-scale solar installations (Benban, Noor Ouarzazate, De Aar, Garissa, Ashama, etc.) with pulsating health markers (Optimal, Warning, Critical).
- **Interactive SCADA Popups**: Live telemetry for output (MW), capacity, irradiance (W/m²), cell temperature (°C), and performance ratio (PR %).

### 2. Fast Anomaly Detection (<30s Operator SLA)
- High-visibility operator alert banner meeting the PRD criteria: *"Users can identify underperforming regions in less than 30 seconds"*.
- Live 30-second countdown timer with depleting progress bar.
- **One-Click Drill-Down**: Automatically flies map to the affected plant (Ashama Solar Bay 3), opens the technical telemetry drawer, and highlights the incident row in the SCADA table.
- **Acknowledge Action**: Logs operator ID (`OP-4402`), silences alarm, and updates status.

### 3. Top KPI Cards & Sustainability Impact Strip
- **Total Production**: Real-time aggregate generation (3,842.6 MW), installed capacity progress bar (4,550 MW), capacity factor (84.5%), and daily yield (28.4 GWh).
- **Active Solar Sites**: 21 / 22 Operational (95.5%) with breakdown of Optimal, Throttled, and Critical nodes.
- **Network SLA**: 99.82% availability across interconnectors with 18ms telemetry latency.
- **Active SCADA Alerts**: Dynamic count of open incidents.
- **Design System Impact Metrics**: CO₂ avoided today (20,550 Metric Tons) and clean households powered (2.49M homes).

### 4. Generation Curves & Forecasting (Chart.js)
- **24h Diurnal Curve**: Actual solar generation bell curve with gradient fill vs theoretical Clear-Sky baseline curve, plus secondary Y-axis for pyranometer irradiance (GHI W/m²).
- **7-Day Production Forecast**: Multi-day outlook with peak capacity projection (MW) and daily energy yield (GWh).

### 5. Regional Production Comparison
- Breakdown across North, Southern, West, East, and Central Africa.
- Interactive filtering: clicking any region immediately isolates map nodes, alerts, and metrics to that region.

### 6. Operational Alert Center
- Filterable by category (**Equipment**, **Anomaly**, **Outage**) and live search.
- Interactive **Resolve**, **Acknowledge**, and **Drill Down** actions.
- **Export to CSV**: Download operational SCADA logs with a single click.

### 7. Plant Telemetry Slide-Over Drawer
- Detailed inspection drawer with 12 Inverter String Status Matrix, busbar voltage, frequency, pyranometer metrics, remote diagnostic sweep simulation, and SCADA CSV export.

### 8. Light / Dark Mode & Live Simulation
- Light Mode by default, interactive Light/Dark toggle in top navigation bar.
- Live telemetry simulation engine generating realistic 3-second SCADA polling ticks (can be toggled/paused).
