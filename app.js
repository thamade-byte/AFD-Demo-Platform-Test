// ============================================================================
// SOLARIS AFRICA - Main SCADA Application Engine
// ============================================================================

(function () {
  'use strict';

  // Application Global State
  const state = {
    theme: localStorage.getItem('solaris_theme') || 'light',
    selectedRegion: 'All',
    selectedCountry: null,
    selectedPlant: null,
    alertCategory: 'All',
    alertSearch: '',
    isSimActive: true,
    slaSecondsRemaining: 26,
    slaAcknowledged: false,
    slaTimerInterval: null,
    simInterval: null,
    chartTab: 'diurnal', // 'diurnal' | 'forecast'
    corridorsVisible: true,
    map: null,
    geoJsonLayer: null,
    corridorsLayerGroup: null,
    plantsLayerGroup: null,
    chartInstance: null,
    alerts: [...window.SOLARIS_DATA.alerts],
    plants: [...window.SOLARIS_DATA.plants]
  };

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initClock();
    initSlaTimer();
    initMap();
    initCharts();
    renderRegionalBars();
    renderCorridorsList();
    renderAlertsTable();
    updateKpis();
    initEventListeners();
    startSimulation();

    // Render Lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  });

  // ==========================================================================
  // THEME MANAGEMENT (Light / Dark)
  // ==========================================================================
  function initTheme() {
    applyTheme(state.theme);
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        state.theme = state.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('solaris_theme', state.theme);
        applyTheme(state.theme);
        updateMapTheme();
        updateChartTheme();
      });
    }
  }

  function applyTheme(theme) {
    const htmlEl = document.documentElement;
    const moonIcon = document.getElementById('theme-icon-moon');
    const sunIcon = document.getElementById('theme-icon-sun');

    if (theme === 'dark') {
      htmlEl.classList.add('dark');
      htmlEl.classList.remove('light');
      if (moonIcon) moonIcon.classList.remove('hidden');
      if (sunIcon) sunIcon.classList.add('hidden');
    } else {
      htmlEl.classList.remove('dark');
      htmlEl.classList.add('light');
      if (moonIcon) moonIcon.classList.add('hidden');
      if (sunIcon) sunIcon.classList.remove('hidden');
    }
  }

  // ==========================================================================
  // CLOCK & HEADER
  // ==========================================================================
  function initClock() {
    const clockEl = document.getElementById('scada-clock');
    function updateClock() {
      const now = new Date();
      if (clockEl) {
        clockEl.textContent = now.toTimeString().split(' ')[0] + ' UTC+1';
      }
    }
    updateClock();
    setInterval(updateClock, 1000);
  }

  // ==========================================================================
  // FAST ANOMALY DETECTION SLA TIMER (<30s Operator SLA)
  // ==========================================================================
  function initSlaTimer() {
    const countdownEl = document.getElementById('sla-countdown');
    const kpiCriticalTime = document.getElementById('kpi-critical-time');

    state.slaTimerInterval = setInterval(() => {
      if (state.slaAcknowledged) return;

      if (state.slaSecondsRemaining > 0) {
        state.slaSecondsRemaining -= 1;
        const formatted = `00:${state.slaSecondsRemaining < 10 ? '0' : ''}${state.slaSecondsRemaining}`;
        if (countdownEl) countdownEl.textContent = formatted;
        if (kpiCriticalTime) kpiCriticalTime.textContent = formatted;
      } else {
        if (countdownEl) {
          countdownEl.textContent = 'EXPIRED';
          countdownEl.className = 'text-red-300 text-sm font-extrabold animate-pulse';
        }
      }
    }, 1000);
  }

  window.acknowledgeSlaAlert = function (alertId) {
    state.slaAcknowledged = true;
    clearInterval(state.slaTimerInterval);

    const banner = document.getElementById('anomaly-banner');
    const countdownEl = document.getElementById('sla-countdown');
    const ackBtn = document.getElementById('sla-ack-btn');
    const progressFill = document.getElementById('sla-progress-fill');

    if (countdownEl) {
      countdownEl.textContent = 'ACKNOWLEDGED';
      countdownEl.className = 'text-emerald-300 text-xs font-bold';
    }
    if (progressFill) {
      progressFill.style.animationPlayState = 'paused';
      progressFill.className = 'h-full bg-emerald-400';
    }
    if (ackBtn) {
      ackBtn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5"></i><span>Acked: OP-4402</span>';
      ackBtn.className = 'px-3 py-1.5 rounded-md bg-emerald-700/80 text-white font-semibold text-xs flex items-center space-x-1.5';
    }

    // Update alert status in table
    const targetAlert = state.alerts.find(a => a.id === alertId);
    if (targetAlert) {
      targetAlert.operator_acknowledged = true;
    }

    renderAlertsTable();
    showToast('Incident Acknowledged', 'Operator SLA recorded. Field crew dispatched to Ashama Bay 3.', 'success');

    if (window.lucide) window.lucide.createIcons();
  };

  window.dismissAnomalyBanner = function () {
    const banner = document.getElementById('anomaly-banner');
    if (banner) {
      banner.style.maxHeight = '0px';
      banner.style.padding = '0px';
      banner.style.opacity = '0';
      setTimeout(() => banner.classList.add('hidden'), 300);
    }
  };

  // ==========================================================================
  // LEAFLET AFRICA MAP (Zero API Keys Standalone Vector Layer)
  // ==========================================================================
  function initMap() {
    // Map bounds centered on African Continent
    const mapContainer = document.getElementById('africa-map');
    if (!mapContainer) return;

    state.map = L.map('africa-map', {
      center: [3.5, 20.0],
      zoom: 3.2,
      minZoom: 2.5,
      maxZoom: 8,
      zoomControl: true,
      attributionControl: false,
      bounceAtZoomLimits: true
    });

    // Custom attribution-free vector map
    renderGeoJsonLayer();
    renderCorridorsLayer();
    renderPlantMarkers();

    // Fit Africa bounds cleanly
    if (window.AFRICA_GEOJSON) {
      try {
        const bounds = L.geoJSON(window.AFRICA_GEOJSON).getBounds();
        state.map.fitBounds(bounds, { padding: [15, 15] });
      } catch (e) {
        console.warn('Could not fit bounds:', e);
      }
    }
  }

  // Country styling logic matching Design System colors
  function getCountryStyle(feature) {
    const isDark = state.theme === 'dark';
    const region = feature.properties ? feature.properties.region : null;
    const iso = feature.properties ? feature.properties['ISO3166-1-Alpha-3'] : null;

    // Check if this country is selected
    const isSelected = state.selectedCountry === iso;

    // Palette based on African Region
    let fillColor = isDark ? '#1e293b' : '#e2e8f0';
    if (region === 'North') fillColor = '#F9D648'; // Solar Yellow
    else if (region === 'Southern') fillColor = '#73C66E'; // Energy Green
    else if (region === 'West') fillColor = '#F59E0B'; // Sahelian Amber
    else if (region === 'East') fillColor = '#38BDF8'; // Sky Blue
    else if (region === 'Central') fillColor = '#A855F7'; // Congo Purple

    const fillOpacity = isSelected 
      ? (isDark ? 0.65 : 0.75) 
      : (state.selectedRegion === 'All' || state.selectedRegion === region) 
        ? (isDark ? 0.25 : 0.35) 
        : (isDark ? 0.08 : 0.12);

    return {
      fillColor: fillColor,
      weight: isSelected ? 2.5 : 1.0,
      opacity: 1,
      color: isSelected ? (isDark ? '#ffffff' : '#0f172a') : (isDark ? '#334155' : '#94a3b8'),
      fillOpacity: fillOpacity
    };
  }

  function renderGeoJsonLayer() {
    if (!window.AFRICA_GEOJSON || !state.map) return;

    if (state.geoJsonLayer) {
      state.map.removeLayer(state.geoJsonLayer);
    }

    state.geoJsonLayer = L.geoJSON(window.AFRICA_GEOJSON, {
      style: getCountryStyle,
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        const name = props.name || props.country_name || 'Country';
        const region = props.region || 'Africa';
        const capacity = props.capacity_mw || 0;
        const current = props.current_mw || 0;
        const sites = props.active_sites || 0;

        // Tooltip
        const tooltipContent = `
          <div class="font-sans">
            <div class="font-bold text-slate-100 flex items-center justify-between gap-3">
              <span>${name}</span>
              <span class="text-[10px] text-amber-400 font-semibold uppercase">${region} Africa</span>
            </div>
            <div class="mt-1 pt-1 border-t border-slate-700/80 text-[11px] text-slate-300 space-y-0.5">
              <div>Installed Solar: <strong class="text-white">${capacity ? capacity + ' MW' : 'Non-Interconnected'}</strong></div>
              ${capacity ? `<div>Current Output: <strong class="text-emerald-400">${current} MW</strong></div>` : ''}
              ${sites ? `<div>Active Substations: <strong class="text-white">${sites} Sites</strong></div>` : ''}
            </div>
          </div>
        `;
        layer.bindTooltip(tooltipContent, {
          className: 'country-tooltip',
          direction: 'top',
          sticky: true
        });

        // Hover effect
        layer.on('mouseover', (e) => {
          const l = e.target;
          l.setStyle({
            weight: 2.5,
            color: state.theme === 'dark' ? '#f8fafc' : '#0f172a',
            fillOpacity: state.theme === 'dark' ? 0.6 : 0.7
          });
          if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            l.bringToFront();
          }
        });

        layer.on('mouseout', (e) => {
          state.geoJsonLayer.resetStyle(e.target);
        });

        // Click to select country
        layer.on('click', (e) => {
          const iso = props['ISO3166-1-Alpha-3'];
          handleCountryClick(props, layer);
        });
      }
    }).addTo(state.map);
  }

  function handleCountryClick(props, layer) {
    state.selectedCountry = props['ISO3166-1-Alpha-3'];
    state.geoJsonLayer.setStyle(getCountryStyle);

    // Zoom map smoothly to bounds
    if (layer && layer.getBounds) {
      state.map.fitBounds(layer.getBounds(), { padding: [30, 30], maxZoom: 6 });
    }

    // Display floating country quick card
    const card = document.getElementById('country-quick-card');
    const nameEl = document.getElementById('country-card-name');
    const regionEl = document.getElementById('country-card-region');
    const capEl = document.getElementById('country-card-capacity');
    const outEl = document.getElementById('country-card-output');
    const sitesEl = document.getElementById('country-card-sites');

    if (card && nameEl) {
      nameEl.textContent = props.name || props.country_name;
      regionEl.textContent = `${props.region || 'African'} Region`;
      capEl.textContent = props.capacity_mw ? `${props.capacity_mw} MW` : 'N/A';
      outEl.textContent = props.current_mw ? `${props.current_mw} MW` : 'N/A';
      sitesEl.textContent = props.active_sites ? `${props.active_sites} Plants` : '0 Plants';
      card.classList.remove('hidden');
    }

    showToast(props.name, `Selected country in ${props.region} Africa.`, 'info');
  }

  window.closeCountryCard = function () {
    const card = document.getElementById('country-quick-card');
    if (card) card.classList.add('hidden');
    state.selectedCountry = null;
    state.geoJsonLayer.setStyle(getCountryStyle);
  };

  window.filterToSelectedCountry = function () {
    if (!state.selectedCountry) return;
    const countryObj = window.AFRICA_GEOJSON.features.find(
      f => f.properties['ISO3166-1-Alpha-3'] === state.selectedCountry
    );
    if (countryObj && countryObj.properties.region) {
      filterByRegion(countryObj.properties.region);
      closeCountryCard();
    }
  };

  // ==========================================================================
  // TRANSMISSION CORRIDORS (WAPP, SAPP, EAPP)
  // ==========================================================================
  function renderCorridorsLayer() {
    if (!state.map) return;

    if (state.corridorsLayerGroup) {
      state.map.removeLayer(state.corridorsLayerGroup);
    }

    state.corridorsLayerGroup = L.layerGroup();

    window.SOLARIS_DATA.corridors.forEach(c => {
      // Main interconnector backbone
      const polylineClass = c.id === 'WAPP' 
        ? 'corridor-flow-wapp' 
        : c.id === 'SAPP' 
          ? 'corridor-flow-sapp' 
          : 'corridor-flow-eapp';

      const line = L.polyline(c.coordinates, {
        color: c.color,
        weight: 4,
        opacity: 0.9,
        className: polylineClass
      });

      // Corridor popup
      const popupHtml = `
        <div class="p-3 font-sans min-w-[240px]">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2 mb-2">
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style="background-color: ${c.color}25; color: ${c.color}">
                ${c.id} CORRIDOR
              </span>
              <h4 class="font-bold text-slate-900 dark:text-white text-xs mt-1">${c.name}</h4>
            </div>
            <span class="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded">
              ${c.status}
            </span>
          </div>

          <div class="space-y-1 text-xs text-slate-600 dark:text-slate-300">
            <div class="flex justify-between">
              <span>Voltage:</span>
              <strong class="font-mono text-slate-800 dark:text-slate-100">${c.voltage}</strong>
            </div>
            <div class="flex justify-between">
              <span>Current Flow:</span>
              <strong class="font-mono text-slate-800 dark:text-slate-100">${c.current_mw} / ${c.capacity_mw} MW</strong>
            </div>
            <div class="flex justify-between">
              <span>Grid Frequency:</span>
              <strong class="font-mono text-emerald-600 dark:text-emerald-400">${c.frequency_hz} Hz</strong>
            </div>
          </div>

          <div class="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-500 dark:text-slate-400">
            <strong>Substation Nodes:</strong> ${c.substations.slice(0, 5).join(' → ')}...
          </div>
        </div>
      `;
      line.bindPopup(popupHtml);
      state.corridorsLayerGroup.addLayer(line);

      // Render secondary branches if present
      if (c.branches) {
        c.branches.forEach(branchCoords => {
          const branchLine = L.polyline(branchCoords, {
            color: c.color,
            weight: 3,
            opacity: 0.75,
            dashArray: '4, 8'
          });
          branchLine.bindPopup(popupHtml);
          state.corridorsLayerGroup.addLayer(branchLine);
        });
      }
    });

    if (state.corridorsVisible) {
      state.corridorsLayerGroup.addTo(state.map);
    }
  }

  window.toggleCorridorsLayer = function () {
    state.corridorsVisible = !state.corridorsVisible;
    const btnLabel = document.getElementById('corridors-btn-label');

    if (state.corridorsVisible) {
      if (state.map && state.corridorsLayerGroup) {
        state.map.addLayer(state.corridorsLayerGroup);
      }
      if (btnLabel) btnLabel.textContent = 'Corridors: ON';
      showToast('Corridors Enabled', 'Pan-African transmission lines visible.', 'info');
    } else {
      if (state.map && state.corridorsLayerGroup) {
        state.map.removeLayer(state.corridorsLayerGroup);
      }
      if (btnLabel) btnLabel.textContent = 'Corridors: OFF';
      showToast('Corridors Hidden', 'Corridor overlay toggled off.', 'info');
    }
  };

  // ==========================================================================
  // SOLAR PLANT SUBSTATION MARKERS
  // ==========================================================================
  function renderPlantMarkers() {
    if (!state.map) return;

    if (state.plantsLayerGroup) {
      state.map.removeLayer(state.plantsLayerGroup);
    }

    state.plantsLayerGroup = L.layerGroup();

    state.plants.forEach(p => {
      // Filter by region if set
      if (state.selectedRegion !== 'All' && p.region !== state.selectedRegion) {
        return;
      }

      // Custom HTML Marker with pulsing ring based on health status
      const ringClass = p.health === 'optimal' 
        ? 'marker-ring-optimal' 
        : p.health === 'warning' 
          ? 'marker-ring-warning' 
          : 'marker-ring-critical';

      const dotClass = p.health === 'optimal' 
        ? 'marker-dot-optimal' 
        : p.health === 'warning' 
          ? 'marker-dot-warning' 
          : 'marker-dot-critical';

      const iconHtml = `
        <div class="plant-marker-icon" title="${p.name} (${p.current_mw} MW)">
          <div class="${ringClass}"></div>
          <div class="${dotClass}"></div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-substation-pin',
        html: iconHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
      });

      const marker = L.marker([p.lat, p.lng], { icon: customIcon });

      // Interactive popup
      const statusBadge = p.health === 'optimal' 
        ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Optimal</span>'
        : p.health === 'warning'
          ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">Curtailed / Warning</span>'
          : '<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 animate-pulse">Critical Trip</span>';

      const popupContent = `
        <div class="p-3.5 font-sans min-w-[260px]">
          <div class="flex items-start justify-between border-b border-slate-200 dark:border-slate-700 pb-2 mb-2.5">
            <div>
              <div class="flex items-center space-x-1.5 mb-1">
                ${statusBadge}
                <span class="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">${p.region} Africa</span>
              </div>
              <h4 class="font-extrabold text-slate-900 dark:text-white text-xs">${p.name}</h4>
              <p class="text-[10px] text-slate-500 dark:text-slate-400">${p.country} • ${p.operator}</p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs mb-3">
            <div class="p-2 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60">
              <span class="text-slate-400 text-[10px] block">Current Output</span>
              <strong class="font-mono text-slate-900 dark:text-white text-xs">${p.current_mw} MW</strong>
              <span class="text-[9px] text-slate-400 block">/ ${p.capacity_mw} MW Peak</span>
            </div>
            <div class="p-2 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60">
              <span class="text-slate-400 text-[10px] block">Solar Irradiance</span>
              <strong class="font-mono text-amber-500 text-xs">${p.irradiance} W/m²</strong>
              <span class="text-[9px] text-slate-400 block">${p.temp_c}°C Cell Temp</span>
            </div>
          </div>

          <div class="flex items-center justify-between text-[11px] mb-3 text-slate-600 dark:text-slate-300">
            <span>Perf Ratio: <strong class="font-mono text-emerald-600 dark:text-emerald-400">${p.pr}%</strong></span>
            <span>Busbar: <strong class="font-mono">${p.voltage_kv} kV</strong></span>
          </div>

          <button onclick="openPlantDrawer('${p.id}')" class="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs text-center transition-colors flex items-center justify-center space-x-1.5 shadow-sm">
            <span>Open Substation SCADA</span>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
          </button>
        </div>
      `;

      marker.bindPopup(popupContent);
      state.plantsLayerGroup.addLayer(marker);
    });

    state.plantsLayerGroup.addTo(state.map);
  }

  window.resetMapView = function () {
    if (!state.map) return;
    if (window.AFRICA_GEOJSON) {
      try {
        const bounds = L.geoJSON(window.AFRICA_GEOJSON).getBounds();
        state.map.fitBounds(bounds, { padding: [15, 15] });
      } catch (e) {
        state.map.setView([3.5, 20.0], 3.2);
      }
    } else {
      state.map.setView([3.5, 20.0], 3.2);
    }
    closeCountryCard();
    showToast('Map Reset', 'Reset view to entire African continent.', 'info');
  };

  function updateMapTheme() {
    if (state.geoJsonLayer) {
      state.geoJsonLayer.setStyle(getCountryStyle);
    }
  }

  // ==========================================================================
  // FAST DRILL-DOWN FUNCTIONALITY (<30s Operator SLA Target)
  // ==========================================================================
  window.drillDownToPlant = function (plantId) {
    const plant = state.plants.find(p => p.id === plantId);
    if (!plant) return;

    // Fly map directly to plant
    if (state.map) {
      state.map.flyTo([plant.lat, plant.lng], 6, {
        animate: true,
        duration: 1.2
      });
    }

    // Open Drawer immediately
    setTimeout(() => {
      openPlantDrawer(plantId);
    }, 400);

    // Highlight alert in table
    highlightAlertInTable(plantId);

    showToast('Operator Drill-Down', `Navigated to ${plant.name}. SCADA Diagnostic opened.`, 'warning');
  };

  function highlightAlertInTable(plantId) {
    const alertRow = document.querySelector(`tr[data-plant-id="${plantId}"]`);
    if (alertRow) {
      alertRow.classList.add('bg-amber-100', 'dark:bg-amber-950/60');
      alertRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        alertRow.classList.remove('bg-amber-100', 'dark:bg-amber-950/60');
      }, 4000);
    }
  }

  // ==========================================================================
  // REGIONAL COMPARISON BARS
  // ==========================================================================
  function renderRegionalBars() {
    const container = document.getElementById('regional-bars-container');
    if (!container) return;

    const regions = window.SOLARIS_DATA.regions;
    let html = '';

    Object.keys(regions).forEach(key => {
      const reg = regions[key];
      const isSelected = state.selectedRegion === key;
      const pct = reg.capacity_factor;
      
      const statusPill = reg.status === 'optimal'
        ? '<span class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Optimal</span>'
        : reg.status === 'warning'
          ? '<span class="text-[10px] font-bold text-amber-500">Warning</span>'
          : '<span class="text-[10px] font-bold text-red-600 dark:text-red-400 animate-pulse">Critical Trip</span>';

      html += `
        <div 
          onclick="filterByRegion('${key}')"
          class="p-3 rounded-xl border transition-all cursor-pointer ${
            isSelected 
              ? 'bg-amber-50/90 dark:bg-amber-950/30 border-amber-400 shadow-sm' 
              : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200/70 dark:border-slate-700/60 hover:bg-slate-100/80 dark:hover:bg-slate-800'
          }"
        >
          <div class="flex items-center justify-between mb-1.5">
            <div class="flex items-center space-x-2">
              <span class="w-3 h-3 rounded-full" style="background-color: ${reg.color}"></span>
              <span class="font-bold text-xs text-slate-900 dark:text-white">${reg.name}</span>
            </div>
            <div class="flex items-center space-x-2">
              ${statusPill}
              <span class="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">${reg.current_mw.toFixed(1)} MW</span>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
            <div class="h-2 rounded-full transition-all duration-500" style="width: ${pct}%; background-color: ${reg.color}"></div>
          </div>

          <!-- Subtext -->
          <div class="flex justify-between items-center text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            <span>Cap Factor: <strong class="text-slate-800 dark:text-slate-200 font-mono">${pct}%</strong> of ${reg.installed_mw} MW</span>
            <span>PR: <strong class="text-emerald-600 dark:text-emerald-400 font-mono">${reg.pr}%</strong> • ${reg.active_sites} Sites</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    const clearBtn = document.getElementById('clear-region-filter-btn');
    if (clearBtn) {
      if (state.selectedRegion !== 'All') clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');
    }
  }

  window.filterByRegion = function (regionKey) {
    state.selectedRegion = regionKey;

    // Update select in header
    const selectEl = document.getElementById('header-region-select');
    if (selectEl) selectEl.value = regionKey;

    // Update Map selection breadcrumb
    const breadcrumb = document.getElementById('map-selection-breadcrumb');
    if (breadcrumb) {
      if (regionKey === 'All') {
        breadcrumb.textContent = 'Showing all 5 African regions • 22 Solar Substations • WAPP, SAPP, EAPP Corridors';
      } else {
        const regObj = window.SOLARIS_DATA.regions[regionKey];
        breadcrumb.textContent = `Filtered to ${regObj.name} • ${regObj.sites_count} Substations • Cap: ${regObj.installed_mw} MW`;
      }
    }

    // Re-render components
    renderRegionalBars();
    renderPlantMarkers();
    renderAlertsTable();
    updateMapTheme();
    updateCharts();
    updateKpis();

    showToast('Region Filter', regionKey === 'All' ? 'Showing All African Regions' : `Filtered to ${regionKey} Africa`, 'info');
  };

  // ==========================================================================
  // PAN-AFRICAN CORRIDORS STATUS CARD
  // ==========================================================================
  function renderCorridorsList() {
    const container = document.getElementById('corridors-list-container');
    if (!container) return;

    let html = '';
    window.SOLARIS_DATA.corridors.forEach(c => {
      html += `
        <div class="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
          <div class="flex items-center justify-between mb-1">
            <div class="flex items-center space-x-2">
              <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${c.color}"></span>
              <span class="font-bold text-xs text-slate-900 dark:text-white">${c.id} Interconnector</span>
            </div>
            <span class="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
              ${c.frequency_hz} Hz
            </span>
          </div>

          <div class="text-[11px] text-slate-500 dark:text-slate-400 flex justify-between my-1">
            <span>Load: <strong class="font-mono text-slate-800 dark:text-slate-200">${c.current_mw} MW</strong> / ${c.capacity_mw} MW</span>
            <span class="font-bold text-slate-700 dark:text-slate-300 font-mono">${c.load_pct}%</span>
          </div>

          <div class="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
            <div class="h-1.5 rounded-full" style="width: ${c.load_pct}%; background-color: ${c.color}"></div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  // ==========================================================================
  // CHARTS (24h Diurnal Curve vs Clear-Sky & 7-Day Forecast)
  // ==========================================================================
  function initCharts() {
    const canvas = document.getElementById('generationChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const isDark = state.theme === 'dark';

    if (state.chartTab === 'diurnal') {
      renderDiurnalChart(ctx, isDark);
    } else {
      renderForecastChart(ctx, isDark);
    }
  }

  function renderDiurnalChart(ctx, isDark) {
    const diurnal = window.SOLARIS_DATA.diurnal;

    // Gradient fill for actual solar generation
    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, 'rgba(249, 214, 72, 0.45)');
    gradient.addColorStop(1, 'rgba(249, 214, 72, 0.0)');

    const gridColor = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    state.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: diurnal.hours,
        datasets: [
          {
            label: 'Actual Generation (MW)',
            data: diurnal.actual_mw,
            borderColor: '#F9D648',
            backgroundColor: gradient,
            borderWidth: 2.5,
            fill: true,
            tension: 0.38,
            pointRadius: 2,
            pointHoverRadius: 6,
            yAxisID: 'y'
          },
          {
            label: 'Clear-Sky Baseline (MW)',
            data: diurnal.clear_sky_mw,
            borderColor: '#38BDF8',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            tension: 0.38,
            pointRadius: 0,
            pointHoverRadius: 5,
            yAxisID: 'y'
          },
          {
            label: 'Solar Irradiance (GHI W/m²)',
            data: diurnal.irradiance_ghi,
            borderColor: '#F59E0B',
            borderWidth: 1.5,
            borderDash: [2, 3],
            fill: false,
            tension: 0.38,
            pointRadius: 0,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              boxWidth: 12,
              font: { family: 'Inter', size: 11, weight: '600' },
              color: textColor
            }
          },
          tooltip: {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark ? '#f8fafc' : '#0f172a',
            bodyColor: isDark ? '#e2e8f0' : '#334155',
            borderColor: isDark ? '#334155' : '#e2e8f0',
            borderWidth: 1,
            padding: 10,
            boxPadding: 4,
            callbacks: {
              label: function (context) {
                const label = context.dataset.label || '';
                const val = context.parsed.y;
                if (label.includes('Irradiance')) {
                  return `${label}: ${val} W/m²`;
                }
                return `${label}: ${val.toLocaleString()} MW`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Inter', size: 10 } }
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Power Output (MW)',
              color: textColor,
              font: { size: 10, weight: 'bold' }
            },
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Inter', size: 10 } }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Irradiance (W/m²)',
              color: textColor,
              font: { size: 10, weight: 'bold' }
            },
            grid: { drawOnChartArea: false },
            ticks: { color: textColor, font: { family: 'Inter', size: 10 } }
          }
        }
      }
    });
  }

  function renderForecastChart(ctx, isDark) {
    const forecast = window.SOLARIS_DATA.forecast;
    const gridColor = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    state.chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: forecast.days,
        datasets: [
          {
            type: 'line',
            label: 'Forecast Peak (MW)',
            data: forecast.peak_mw,
            borderColor: '#F9D648',
            backgroundColor: '#F9D648',
            borderWidth: 2.5,
            tension: 0.3,
            yAxisID: 'y',
            pointRadius: 4
          },
          {
            type: 'bar',
            label: 'Daily Generation (GWh)',
            data: forecast.daily_gwh,
            backgroundColor: isDark ? 'rgba(56, 189, 248, 0.6)' : 'rgba(56, 189, 248, 0.8)',
            borderRadius: 6,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              boxWidth: 12,
              font: { family: 'Inter', size: 11, weight: '600' },
              color: textColor
            }
          },
          tooltip: {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark ? '#f8fafc' : '#0f172a',
            bodyColor: isDark ? '#e2e8f0' : '#334155',
            borderColor: isDark ? '#334155' : '#e2e8f0',
            borderWidth: 1,
            padding: 10
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Inter', size: 10 } }
          },
          y: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'Peak MW', color: textColor, font: { size: 10 } },
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Inter', size: 10 } }
          },
          y1: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Energy (GWh)', color: textColor, font: { size: 10 } },
            grid: { drawOnChartArea: false },
            ticks: { color: textColor, font: { family: 'Inter', size: 10 } }
          }
        }
      }
    });
  }

  window.switchChartTab = function (tab) {
    state.chartTab = tab;
    const diurnalBtn = document.getElementById('tab-diurnal-btn');
    const forecastBtn = document.getElementById('tab-forecast-btn');
    const footerNote = document.getElementById('chart-footer-note');

    if (tab === 'diurnal') {
      if (diurnalBtn) diurnalBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm transition-all';
      if (forecastBtn) forecastBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all';
      if (footerNote) footerNote.textContent = 'Telemetry frequency: 15-minute SCADA polling interval. Shaded area indicates clear-sky generation corridor.';
    } else {
      if (diurnalBtn) diurnalBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all';
      if (forecastBtn) forecastBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm transition-all';
      if (footerNote) footerNote.textContent = 'Forecast generated via ECMWF solar irradiance model + historical satellite clear-sky index.';
    }

    updateCharts();
  };

  function updateCharts() {
    if (state.chartInstance) {
      state.chartInstance.destroy();
    }
    initCharts();
  }

  function updateChartTheme() {
    updateCharts();
  }

  // ==========================================================================
  // OPERATIONAL ALERT CENTER
  // ==========================================================================
  function renderAlertsTable() {
    const tbody = document.getElementById('alerts-table-body');
    const badge = document.getElementById('active-alert-badge');
    if (!tbody) return;

    // Filter alerts
    let filtered = state.alerts.filter(a => {
      // Category filter
      if (state.alertCategory !== 'All' && a.category !== state.alertCategory) {
        return false;
      }
      // Region filter
      if (state.selectedRegion !== 'All' && a.region !== state.selectedRegion) {
        return false;
      }
      // Search term filter
      if (state.alertSearch) {
        const q = state.alertSearch.toLowerCase();
        const match = a.plant_name.toLowerCase().includes(q) ||
                      a.title.toLowerCase().includes(q) ||
                      a.description.toLowerCase().includes(q) ||
                      a.country.toLowerCase().includes(q) ||
                      a.id.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    // Update active count badge
    const activeCount = state.alerts.filter(a => a.status === 'active').length;
    if (badge) badge.textContent = `${activeCount} Active`;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-8 text-center text-slate-400">
            <i data-lucide="check-circle" class="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-60"></i>
            <div>No active operational alerts matching current filter.</div>
          </td>
        </tr>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    let html = '';
    filtered.forEach(a => {
      const isCritical = a.severity === 'Critical';
      const isResolved = a.status === 'resolved';

      const sevBadge = isResolved
        ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">Resolved</span>'
        : isCritical
          ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 animate-pulse">Critical</span>'
          : a.severity === 'High'
            ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300">High</span>'
            : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">Medium</span>';

      const rowClass = isResolved
        ? 'opacity-50 line-through-subtle'
        : isCritical
          ? 'bg-red-50/50 dark:bg-red-950/20'
          : '';

      const impactColor = a.impact_mw < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400';

      html += `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${rowClass}" data-plant-id="${a.plant_id}" data-alert-id="${a.id}">
          <!-- Severity & ID -->
          <td class="py-3 px-4">
            <div class="flex items-center space-x-2">
              ${sevBadge}
              <span class="font-mono text-[11px] text-slate-500 dark:text-slate-400">${a.id}</span>
            </div>
          </td>

          <!-- Site / Asset -->
          <td class="py-3 px-4">
            <div class="font-bold text-slate-900 dark:text-white cursor-pointer hover:underline" onclick="drillDownToPlant('${a.plant_id}')">
              ${a.plant_name}
            </div>
            <div class="text-[10px] text-slate-400">${a.country} • ${a.region} Africa</div>
          </td>

          <!-- Category -->
          <td class="py-3 px-4">
            <span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-semibold">
              ${a.category}
            </span>
          </td>

          <!-- Root Cause / Description -->
          <td class="py-3 px-4 max-w-sm">
            <div class="font-bold text-slate-800 dark:text-slate-200">${a.title}</div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">${a.description}</div>
          </td>

          <!-- Impact -->
          <td class="py-3 px-4 text-right font-mono font-bold ${impactColor}">
            ${a.impact_mw !== 0 ? a.impact_mw + ' MW' : 'Nominal'}
          </td>

          <!-- Time & SLA -->
          <td class="py-3 px-4">
            <div class="text-slate-700 dark:text-slate-300">${a.timestamp}</div>
            <div class="text-[10px] text-slate-400">
              ${a.operator_acknowledged ? '<span class="text-emerald-500 font-semibold">Acked by OP</span>' : 'Unacknowledged'}
            </div>
          </td>

          <!-- Actions -->
          <td class="py-3 px-4 text-center">
            <div class="flex items-center justify-center space-x-1.5">
              ${
                !isResolved
                  ? `
                    <button 
                      onclick="resolveAlert('${a.id}')"
                      class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[10px] transition-colors shadow-sm"
                      title="Mark as Resolved"
                    >
                      Resolve
                    </button>
                    <button 
                      onclick="drillDownToPlant('${a.plant_id}')"
                      class="p-1 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
                      title="Drill Down to Site"
                    >
                      <i data-lucide="crosshair" class="w-3.5 h-3.5"></i>
                    </button>
                  `
                  : `
                    <span class="text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">Closed</span>
                  `
              }
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  }

  window.filterAlertsCategory = function (category) {
    state.alertCategory = category;

    ['All', 'Equipment', 'Anomaly', 'Outage'].forEach(cat => {
      const btn = document.getElementById(`alert-cat-${cat}`);
      if (btn) {
        if (cat === category) {
          btn.className = 'px-2.5 py-1 rounded-lg font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm transition-all';
        } else {
          btn.className = 'px-2.5 py-1 rounded-lg font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all';
        }
      }
    });

    renderAlertsTable();
  };

  window.handleAlertSearch = function (val) {
    state.alertSearch = val;
    renderAlertsTable();
  };

  window.resolveAlert = function (alertId) {
    const alertObj = state.alerts.find(a => a.id === alertId);
    if (!alertObj) return;

    alertObj.status = 'resolved';
    alertObj.operator_acknowledged = true;

    // If critical alert was resolved, dismiss the banner
    if (alertId === 'ALT-2026-0891') {
      dismissAnomalyBanner();
    }

    renderAlertsTable();
    updateKpis();
    showToast('Alert Resolved', `Incident ${alertId} (${alertObj.plant_name}) closed successfully.`, 'success');
  };

  window.exportAlertsCSV = function () {
    let csv = 'Alert ID,Plant,Country,Region,Category,Severity,Power Delta (MW),Timestamp,Status\n';
    state.alerts.forEach(a => {
      csv += `"${a.id}","${a.plant_name}","${a.country}","${a.region}","${a.category}","${a.severity}","${a.impact_mw}","${a.timestamp}","${a.status}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Solaris_Africa_SCADA_Alerts_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    showToast('Export Complete', 'SCADA Alerts exported to CSV.', 'info');
  };

  // ==========================================================================
  // PLANT TELEMETRY SLIDE-OVER DRAWER
  // ==========================================================================
  window.openPlantDrawer = function (plantId) {
    const plant = state.plants.find(p => p.id === plantId);
    if (!plant) return;

    state.selectedPlant = plant;

    const drawer = document.getElementById('plant-telemetry-drawer');
    const contentCard = document.getElementById('drawer-content-card');

    // Populate data
    document.getElementById('drawer-plant-title').textContent = plant.name;
    document.getElementById('drawer-region-tag').textContent = `${plant.region} Africa • ${plant.country}`;
    document.getElementById('drawer-operator-name').textContent = `Operator: ${plant.operator}`;
    document.getElementById('drawer-output-mw').textContent = `${plant.current_mw} MW`;
    document.getElementById('drawer-capacity-mw').textContent = `/ ${plant.capacity_mw} MW Installed`;
    document.getElementById('drawer-irradiance').textContent = `${plant.irradiance} W/m²`;
    document.getElementById('drawer-temp').textContent = `${plant.temp_c}°C`;
    document.getElementById('drawer-pr').textContent = `${plant.pr}%`;
    document.getElementById('drawer-voltage').textContent = `${plant.voltage_kv} kV AC`;
    document.getElementById('drawer-freq').textContent = `${plant.frequency_hz} Hz`;
    document.getElementById('drawer-soiling').textContent = `${plant.soiling_loss_pct}%`;
    document.getElementById('drawer-daily-yield').textContent = `${plant.daily_mwh} MWh`;
    document.getElementById('drawer-inverters').textContent = `${plant.inverters_online} / ${plant.inverters_total} Online`;
    document.getElementById('drawer-coords').textContent = `${plant.lat.toFixed(4)}, ${plant.lng.toFixed(4)}`;
    document.getElementById('drawer-notes').textContent = plant.notes;

    // Status pill
    const statusPill = document.getElementById('drawer-status-pill');
    if (plant.health === 'optimal') {
      statusPill.textContent = 'OPTIMAL';
      statusPill.className = 'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
    } else if (plant.health === 'warning') {
      statusPill.textContent = 'THROTTLED / WARNING';
      statusPill.className = 'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
    } else {
      statusPill.textContent = 'CRITICAL INVERTER TRIP';
      statusPill.className = 'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 animate-pulse';
    }

    // Populate Inverters Matrix Grid
    renderInverterMatrix(plant);

    // Open drawer
    drawer.classList.remove('invisible', 'opacity-0');
    contentCard.classList.remove('translate-x-full');

    if (window.lucide) window.lucide.createIcons();
  };

  function renderInverterMatrix(plant) {
    const grid = document.getElementById('drawer-inverters-grid');
    if (!grid) return;

    let html = '';
    const total = plant.inverters_total || 12;
    const online = plant.inverters_online || 12;

    for (let i = 1; i <= total; i++) {
      const isFault = i > online;
      html += `
        <div class="p-2 rounded-lg border text-center transition-all ${
          isFault 
            ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-700 dark:text-red-400' 
            : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
        }">
          <div class="font-mono text-[10px] font-bold">INV-${i < 10 ? '0' + i : i}</div>
          <div class="text-[9px] font-bold mt-0.5">${isFault ? 'TRIPPED' : 'ONLINE'}</div>
        </div>
      `;
    }
    grid.innerHTML = html;
  }

  window.closePlantDrawer = function () {
    const drawer = document.getElementById('plant-telemetry-drawer');
    const contentCard = document.getElementById('drawer-content-card');
    if (!drawer || !contentCard) return;

    contentCard.classList.add('translate-x-full');
    drawer.classList.add('opacity-0');
    setTimeout(() => drawer.classList.add('invisible'), 300);
  };

  window.triggerRemoteDiagnostic = function () {
    if (!state.selectedPlant) return;
    showToast('SCADA Diagnostic Sweep', `Running remote pyranometer and inverter loopback tests on ${state.selectedPlant.name}...`, 'info');
    setTimeout(() => {
      showToast('Diagnostic Complete', 'Array telemetry verified. Inverter communications nominal.', 'success');
    }, 1800);
  };

  window.exportPlantTelemetryCSV = function () {
    if (!state.selectedPlant) return;
    const p = state.selectedPlant;
    const csv = `Site,${p.name}\nCountry,${p.country}\nRegion,${p.region}\nCapacity (MW),${p.capacity_mw}\nCurrent Output (MW),${p.current_mw}\nIrradiance (W/m2),${p.irradiance}\nTemp (C),${p.temp_c}\nPR (%),${p.pr}\nVoltage (kV),${p.voltage_kv}\nFrequency (Hz),${p.frequency_hz}\nDaily Yield (MWh),${p.daily_mwh}\n`;
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${p.id}_Telemetry_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    showToast('Export Complete', `Telemetry for ${p.id} downloaded.`, 'info');
  };

  // ==========================================================================
  // KPI CALCULATIONS & TELEMETRY UPDATES
  // ==========================================================================
  function updateKpis() {
    let totalMw = 0;
    let installedMw = 0;
    let activeSitesCount = 0;

    // Filter according to selected region
    state.plants.forEach(p => {
      if (state.selectedRegion === 'All' || p.region === state.selectedRegion) {
        totalMw += p.current_mw;
        installedMw += p.capacity_mw;
        if (p.health !== 'offline') activeSitesCount++;
      }
    });

    // Update Top KPI elements
    const totalMwEl = document.getElementById('kpi-total-mw');
    const sitesEl = document.getElementById('kpi-active-sites');
    const alertsCountEl = document.getElementById('kpi-active-alerts-count');
    const progressBar = document.getElementById('kpi-production-progress');

    if (totalMwEl) {
      totalMwEl.textContent = totalMw.toFixed(1);
      totalMwEl.classList.add('value-updated');
      setTimeout(() => totalMwEl.classList.remove('value-updated'), 1200);
    }

    if (sitesEl) {
      const totalPlants = state.selectedRegion === 'All' 
        ? state.plants.length 
        : state.plants.filter(p => p.region === state.selectedRegion).length;
      sitesEl.innerHTML = `${activeSitesCount} <span class="text-base text-slate-400 font-normal">/ ${totalPlants}</span>`;
    }

    if (alertsCountEl) {
      const activeAlerts = state.alerts.filter(a => a.status === 'active' && (state.selectedRegion === 'All' || a.region === state.selectedRegion)).length;
      alertsCountEl.textContent = activeAlerts;
    }

    if (progressBar && installedMw > 0) {
      const pct = Math.min(100, (totalMw / installedMw) * 100).toFixed(1);
      progressBar.style.width = `${pct}%`;
    }

    // Impact strip updates
    const co2El = document.getElementById('impact-co2');
    const homesEl = document.getElementById('impact-households');
    if (co2El) co2El.textContent = (totalMw * 5.34).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (homesEl) homesEl.textContent = (totalMw * 650).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // ==========================================================================
  // REAL-TIME SIMULATION ENGINE (SCADA Polling Simulation)
  // ==========================================================================
  function startSimulation() {
    state.simInterval = setInterval(() => {
      if (!state.isSimActive) return;

      // Realistic brownian fluctuations on active plants (±0.2% to 0.7%)
      state.plants.forEach(p => {
        if (p.health === 'offline') return;
        const delta = (Math.random() - 0.49) * 0.008;
        p.current_mw = Math.max(0, Math.min(p.capacity_mw, +(p.current_mw * (1 + delta)).toFixed(1)));
        p.irradiance = Math.max(200, Math.min(1100, +(p.irradiance * (1 + delta * 0.5)).toFixed(0)));
      });

      // Update Regional data
      const regions = window.SOLARIS_DATA.regions;
      Object.keys(regions).forEach(key => {
        const reg = regions[key];
        const plantsInReg = state.plants.filter(p => p.region === key);
        if (plantsInReg.length > 0) {
          reg.current_mw = plantsInReg.reduce((acc, p) => acc + p.current_mw, 0);
          reg.capacity_factor = Math.min(100, +((reg.current_mw / reg.installed_mw) * 100).toFixed(1));
        }
      });

      // Update UI
      updateKpis();
      renderRegionalBars();

      // If drawer is open, update active values
      if (state.selectedPlant) {
        const outMwEl = document.getElementById('drawer-output-mw');
        const irrEl = document.getElementById('drawer-irradiance');
        if (outMwEl) outMwEl.textContent = `${state.selectedPlant.current_mw} MW`;
        if (irrEl) irrEl.textContent = `${state.selectedPlant.irradiance} W/m²`;
      }
    }, 3200);
  }

  function toggleSimulation() {
    state.isSimActive = !state.isSimActive;
    const btnLabel = document.getElementById('sim-btn-label');
    const simBtn = document.getElementById('toggle-sim-btn');

    if (state.isSimActive) {
      if (btnLabel) btnLabel.textContent = 'Live: 3s';
      if (simBtn) simBtn.className = 'flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors';
      showToast('Live Feed Resumed', 'SCADA 3-second polling tick active.', 'info');
    } else {
      if (btnLabel) btnLabel.textContent = 'Paused';
      if (simBtn) simBtn.className = 'flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 transition-colors';
      showToast('Live Feed Paused', 'SCADA telemetry frozen for review.', 'warning');
    }
  }

  // ==========================================================================
  // EVENT LISTENERS & UI WIDGETS
  // ==========================================================================
  function initEventListeners() {
    // Header region select
    const headerRegionSelect = document.getElementById('header-region-select');
    if (headerRegionSelect) {
      headerRegionSelect.addEventListener('change', (e) => {
        filterByRegion(e.target.value);
      });
    }

    // Live Sim Button
    const toggleSimBtn = document.getElementById('toggle-sim-btn');
    if (toggleSimBtn) {
      toggleSimBtn.addEventListener('click', toggleSimulation);
    }

    // Keyboard ESC to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closePlantDrawer();
        closeCountryCard();
      }
    });
  }

  // ==========================================================================
  // FLOATING TOAST NOTIFICATIONS
  // ==========================================================================
  function showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const borderCol = type === 'success' ? 'border-emerald-500' : type === 'warning' ? 'border-amber-500' : 'border-blue-500';
    const iconName = type === 'success' ? 'check-circle' : type === 'warning' ? 'alert-triangle' : 'info';

    toast.className = `p-3.5 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl border-l-4 ${borderCol} border border-slate-200 dark:border-slate-700 max-w-sm pointer-events-auto transform translate-y-3 opacity-0 transition-all duration-300 text-xs`;
    toast.innerHTML = `
      <div class="flex items-start space-x-2.5">
        <i data-lucide="${iconName}" class="w-4 h-4 flex-shrink-0 mt-0.5 ${type === 'success' ? 'text-emerald-500' : type === 'warning' ? 'text-amber-500' : 'text-blue-500'}"></i>
        <div class="flex-1">
          <div class="font-bold text-slate-900 dark:text-white">${title}</div>
          <div class="text-slate-500 dark:text-slate-300 mt-0.5">${message}</div>
        </div>
      </div>
    `;

    container.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      toast.classList.remove('translate-y-3', 'opacity-0');
    }, 10);

    setTimeout(() => {
      toast.classList.add('translate-y-3', 'opacity-0');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

})();
