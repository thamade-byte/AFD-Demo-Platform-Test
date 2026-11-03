# Architecture

### Overview
The application follows a modern web architecture composed of a frontend, mock data layer and future API integrations.

### Components

#### Frontend
**Technology:**
- Next.js
- React
- TypeScript
- Tailwind CSS

**Responsibilities:**
- Dashboard rendering
- Data visualization
- User interaction
- Filtering

#### Data Layer
**Mock JSON datasets simulating:**
- Solar production
- Site information
- Network health
- Alerts

**Future integrations may include:**
- IoT Sensors
- SCADA Systems
- Energy APIs
- Data Warehouses

#### Visualization Layer
- KPI Cards
- Charts
- Maps
- Alert Tables

### Data Flow
`Energy Sources` → `Data Layer` → `Business Logic` → `Dashboard Components` → `End User`

### Security Principles
- Read-only operational data
- No sensitive personal information
- Secure API access for future integrations

### Scalability
- Additional countries
- Additional solar sites
- New energy sources
- More datasets
