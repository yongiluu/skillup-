// desktop-prototype/app.js

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initCharts();
    fetchDataFromAPI();
    initShiftCalendar();
});

async function fetchDataFromAPI() {
    try {
        const metricsRes = await fetch('http://localhost:8000/api/v1/metrics');
        const metrics = await metricsRes.json();
        
        const predsRes = await fetch('http://localhost:8000/api/v1/predictions');
        const preds = await predsRes.json();
        
        if(preds && !preds.error && preds.length > 0) {
            // Calculate risk
            let totalRisk = 0;
            let criticalUnits = new Set();
            preds.forEach(p => {
                totalRisk += p.predicted_deficit_probability;
                if(p.predicted_has_deficit === 1) {
                    criticalUnits.add(p.clinical_unit);
                }
            });
            const avgRisk = ((totalRisk / preds.length) * 100).toFixed(1);
            
            // Update KPIs
            const kpiRisk = document.querySelector('.kpi-card.danger .kpi-value');
            if(kpiRisk) kpiRisk.innerText = avgRisk + '%';
            
            const kpiUnits = document.querySelector('.kpi-card.warning .kpi-value');
            if(kpiUnits) kpiUnits.innerHTML = `${criticalUnits.size} <span class="kpi-total">/ 5</span>`;
            
            // Update table
            const tbody = document.querySelector('.data-table tbody');
            if(tbody) {
                tbody.innerHTML = '';
                preds.slice(0, 3).forEach((p, idx) => {
                    const pct = (p.predicted_deficit_probability * 100).toFixed(1);
                    const isDanger = p.predicted_deficit_probability > 0.7;
                    const isWarning = p.predicted_deficit_probability > 0.4 && p.predicted_deficit_probability <= 0.7;
                    const badgeClass = isDanger ? 'danger' : (isWarning ? 'warning' : 'success');
                    const badgeText = isDanger ? 'Fatiga Alta' : (isWarning ? 'Observación' : 'Óptimo');
                    
                    let role = 'TENS';
                    if (p.predicted_role_has_deficit_medico === 1) role = 'Médico';
                    else if (p.predicted_role_has_deficit_enfermera === 1) role = 'Enfermera';
                    
                    const unit = p.clinical_unit.replace('_', ' ');
                    
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>
                            <div class="staff-cell">
                                <div class="avatar">S${idx+1}</div>
                                <div><strong>Staff ${idx+1}</strong><br><span>Rol Prioritario</span></div>
                            </div>
                        </td>
                        <td>${role}</td>
                        <td style="text-transform: capitalize;">${unit}</td>
                        <td>
                            <div class="progress-bar-container"><div class="progress-bar ${badgeClass}" style="width: ${pct}%;"></div></div>
                            <span class="score-text">${pct}/100</span>
                        </td>
                        <td><span class="status-badge ${badgeClass}">${badgeText}</span></td>
                        <td><button class="btn-outline">Reasignar</button></td>
                    `;
                    tbody.appendChild(tr);
                });
            }
            
            // Initialize charts with dynamic data
            initCharts(preds, metrics);
        }
    } catch(e) {
        console.error("Error fetching API", e);
    }
}

function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-links a');
    const views = document.querySelectorAll('.view');
    const pageTitle = document.getElementById('page-title');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active class from all links
            navLinks.forEach(l => l.classList.remove('active'));
            
            // Add active class to clicked link
            link.classList.add('active');
            
            // Update title
            pageTitle.innerText = link.querySelector('span').innerText;
            
            // Hide all views except the target one
            views.forEach(v => {
                v.classList.remove('active');
                v.style.display = 'none';
            });
            
            // Show target view
            const targetViewId = 'view-' + link.getAttribute('data-view');
            const targetView = document.getElementById(targetViewId);
            
            if (targetView) {
                targetView.style.display = 'block';
                // Trigger reflow to restart animation
                void targetView.offsetWidth; 
                targetView.classList.add('active');
            }
        });
    });
}

function initCharts(preds = [], metrics = null) {
    // 1. Tendencia Chart (Riesgo de Déficit a lo largo del tiempo)
    const ctxTrend = document.getElementById('main-trend-chart');
    if (ctxTrend && preds.length > 0) {
        
        // Aggregate risk by date
        let dates = {};
        preds.forEach(p => {
            if (!dates[p.date]) dates[p.date] = { count: 0, total_risk: 0 };
            dates[p.date].count += 1;
            dates[p.date].total_risk += p.predicted_deficit_probability;
        });
        
        // Sort dates
        let sortedDates = Object.keys(dates).sort().slice(-7); // take last 7 days
        let labels = sortedDates.map(d => d.substring(5)); // DD-MM
        let dataRisk = sortedDates.map(d => (dates[d].total_risk / dates[d].count) * 100);

        new Chart(ctxTrend.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Riesgo de Déficit Promedio (%)',
                        data: dataRisk,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { usePointStyle: true, boxWidth: 8 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: { borderDash: [2, 4], color: '#e2e8f0' }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // 2. SHAP Chart (Impacto de Factores)
    const ctxShap = document.getElementById('shap-chart');
    if (ctxShap) {
        new Chart(ctxShap.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Ausentismo Histórico', 'Día de la Semana', 'Turno (Mañana)', 'Carga Procedimientos', 'Fatiga Acumulada'],
                datasets: [{
                    label: 'Impacto SHAP',
                    data: [0.35, 0.28, 0.22, 0.15, 0.12],
                    backgroundColor: '#1e3a8a',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { borderDash: [2, 4], color: '#e2e8f0' }
                    },
                    y: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    initLiveSimulation();
    initHeatmap(preds);
    initExtraCharts(metrics);
}

function initLiveSimulation() {
    const ctxLive = document.getElementById('live-simulation-chart');
    if (!ctxLive) return;

    // Initial data (last 20 points)
    const initialData = Array.from({length: 20}, () => Math.floor(Math.random() * 20) + 30);
    const labels = Array.from({length: 20}, (_, i) => `T-${20-i}`);

    const liveChart = new Chart(ctxLive.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Pacientes en Sala de Espera',
                data: initialData,
                borderColor: '#0ea5e9',
                backgroundColor: 'rgba(14, 165, 233, 0.2)',
                borderWidth: 2,
                pointRadius: 0,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 0 // turn off animation for instant update
            },
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 0, max: 80, grid: { color: '#e2e8f0' } },
                x: { display: false }
            }
        }
    });

    // Simulate live data every 1.5 seconds
    setInterval(() => {
        const lastVal = liveChart.data.datasets[0].data[19];
        const change = Math.floor(Math.random() * 10) - 4; // -4 to +5
        let newVal = lastVal + change;
        if (newVal < 10) newVal = 10;
        if (newVal > 70) newVal = 70;

        liveChart.data.datasets[0].data.shift();
        liveChart.data.datasets[0].data.push(newVal);
        liveChart.update();
    }, 1500);
}

function initHeatmap(preds = []) {
    const grid = document.getElementById('heatmap-grid');
    if (!grid) return;
    
    // Aggregate by unit and shift
    let unitShiftRisk = {};
    const units = ['toma_muestras', 'imagenologia', 'procedimientos', 'consulta_general', 'pabellon'];
    const times = ['morning', 'afternoon', 'evening', 'night'];
    
    if (preds.length > 0) {
        preds.forEach(p => {
            const key = p.clinical_unit + '_' + p.shift;
            if (!unitShiftRisk[key]) unitShiftRisk[key] = {risk: 0, count: 0};
            unitShiftRisk[key].risk += p.predicted_deficit_probability;
            unitShiftRisk[key].count += 1;
        });
    }
    
    // Header row
    grid.innerHTML = '<div class="heatmap-cell heatmap-header"></div>';
    times.forEach(t => {
        grid.innerHTML += `<div class="heatmap-cell heatmap-header" style="text-transform: capitalize;">${t}</div>`;
    });
    
    // Data rows
    units.forEach(unit => {
        const displayUnit = unit.replace('_', ' ');
        grid.innerHTML += `<div class="heatmap-cell heatmap-label" style="text-transform: capitalize;">${displayUnit}</div>`;
        times.forEach(t => {
            let risk = 0;
            const key = unit + '_' + t;
            if (unitShiftRisk[key] && unitShiftRisk[key].count > 0) {
                risk = Math.floor((unitShiftRisk[key].risk / unitShiftRisk[key].count) * 100);
            } else {
                risk = Math.floor(Math.random() * 100); // Fallback to random if no data
            }
            
            let bgColor = '#d1fae5'; // green
            let textColor = '#065f46';
            
            if (risk > 75) {
                bgColor = '#fee2e2'; // red
                textColor = '#991b1b';
            } else if (risk > 40) {
                bgColor = '#fef3c7'; // yellow
                textColor = '#92400e';
            }
            
            grid.innerHTML += `<div class="heatmap-cell" style="background-color: ${bgColor}; color: ${textColor}">${risk}%</div>`;
        });
    });
}

function initExtraCharts(metrics = null) {
    // Scatter Chart (Edad vs Fatiga)
    const ctxDep = document.getElementById('dependency-chart');
    if (ctxDep) {
        // Generate random scatter data
        const scatterData = Array.from({length: 40}, () => ({
            x: Math.floor(Math.random() * 40) + 22, // Age 22 to 62
            y: Math.floor(Math.random() * 100)      // Fatigue 0 to 100
        }));
        
        new Chart(ctxDep.getContext('2d'), {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Personal Clínico',
                    data: scatterData,
                    backgroundColor: '#3b82f6',
                    pointRadius: 5,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: 'Edad (Años)' } },
                    y: { title: { display: true, text: 'Riesgo de Fatiga (%)' }, min: 0, max: 100 }
                }
            }
        });
    }

    // Radar Chart (Roles Críticos)
    const ctxRoles = document.getElementById('roles-chart');
    if (ctxRoles) {
        let aucData = [0.92, 0.85, 0.88, 0.78, 0.81]; // defaults
        if (metrics && metrics.metrics && metrics.metrics.role_models) {
            aucData = [
                metrics.metrics.role_models.medico ? metrics.metrics.role_models.medico['AUC-ROC'] : 0.92,
                metrics.metrics.role_models.enfermera ? metrics.metrics.role_models.enfermera['AUC-ROC'] : 0.85,
                metrics.metrics.role_models.tens ? metrics.metrics.role_models.tens['AUC-ROC'] : 0.88,
                0.78, // technologos missing
                0.81  // auxiliares missing
            ];
        }

        new Chart(ctxRoles.getContext('2d'), {
            type: 'radar',
            data: {
                labels: ['Médicos', 'Enfermeras', 'TENS', 'Tecnólogos', 'Auxiliares'],
                datasets: [{
                    label: 'Precisión del Modelo (ROC AUC)',
                    data: aucData,
                    fill: true,
                    backgroundColor: 'rgba(37, 99, 235, 0.2)',
                    borderColor: '#2563eb',
                    pointBackgroundColor: '#2563eb',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: { min: 0.5, max: 1.0 }
                }
            }
        });
    }
}

// ====================================================
// CALENDARIO PRÁCTICO DE PROGRAMACIÓN POR ÁREA
// ====================================================

const CALENDAR_DAYS = [
    "vie, 20 feb", "sáb, 21 feb", "dom, 22 feb", "lun, 23 feb", "mar, 24 feb", 
    "mié, 25 feb", "jue, 26 feb", "vie, 27 feb", "sáb, 28 feb", "dom, 1 mar", 
    "lun, 2 mar", "mar, 3 mar", "mié, 4 mar", "jue, 5 mar"
];

const CALENDAR_DATA = {
    cracking: {
        name: "Cracking",
        shifts: [
            {
                name: "Diurno",
                target: 12,
                cells: [
                    { assigned: 7, risk: 94 }, { assigned: 6, risk: 94 }, { assigned: 14, risk: 18 },
                    { assigned: 15, risk: 8 }, { assigned: 14, risk: 7 }, { assigned: 14, risk: 8 },
                    { assigned: 13, risk: 12 }, { assigned: 12, risk: 34 }, { assigned: 10, risk: 60 },
                    { assigned: 14, risk: 24 }, { assigned: 15, risk: 51 }, { assigned: 11, risk: 68 },
                    { assigned: 13, risk: 15 }, { assigned: 12, risk: 20 }
                ]
            },
            {
                name: "Nocturno",
                target: 8,
                cells: [
                    { assigned: 13, risk: 0 }, { assigned: 14, risk: 1 }, { assigned: 15, risk: 3 },
                    { assigned: 15, risk: 4 }, { assigned: 11, risk: 1 }, { assigned: 14, risk: 1 },
                    { assigned: 12, risk: 3 }, { assigned: 13, risk: 1 }, { assigned: 12, risk: 1 },
                    { assigned: 11, risk: 3 }, { assigned: 7, risk: 16 }, { assigned: 7, risk: 25 },
                    { assigned: 9, risk: 2 }, { assigned: 8, risk: 4 }
                ]
            },
            {
                name: "Vespertino",
                target: 10,
                cells: [
                    { assigned: 14, risk: 16 }, { assigned: 15, risk: 8 }, { assigned: 8, risk: 48 },
                    { assigned: 8, risk: 67 }, { assigned: 8, risk: 91 }, { assigned: 8, risk: 37 },
                    { assigned: 9, risk: 67 }, { assigned: 8, risk: 93 }, { assigned: 8, risk: 75 },
                    { assigned: 14, risk: 27 }, { assigned: 14, risk: 1 }, { assigned: 14, risk: 3 },
                    { assigned: 12, risk: 10 }, { assigned: 11, risk: 14 }
                ]
            }
        ],
        recs: [
            {
                type: "danger",
                icon: "fa-triangle-exclamation",
                title: "Déficit Crítico en Turno Diurno (20 y 21 Feb)",
                desc: "Se proyecta una brecha de 5 a 6 operadores en Cracking. Sugerencia: Reasignar 2 operadores desde Almacenamiento y 1 de Destilación."
            },
            {
                type: "warning",
                icon: "fa-user-clock",
                title: "Alerta de Fatiga en Turno Vespertino",
                desc: "3 operadores superan el 85% de fatiga acumulada entre el 24 y 28 de Feb. Se recomienda adelantar pausas activas programadas."
            },
            {
                type: "success",
                icon: "fa-shield-halved",
                title: "Superávit en Turno Nocturno",
                desc: "Turno Nocturno con 100% de cobertura y 0-3% de riesgo promedio. Puede utilizarse como bolsa de relevo en caso de contingencia."
            }
        ]
    },
    mantenimiento: {
        name: "Mantenimiento",
        shifts: [
            {
                name: "Diurno",
                target: 8,
                cells: [
                    { assigned: 14, risk: 7 }, { assigned: 13, risk: 5 }, { assigned: 5, risk: 9 },
                    { assigned: 5, risk: 77 }, { assigned: 7, risk: 76 }, { assigned: 6, risk: 63 },
                    { assigned: 4, risk: 76 }, { assigned: 4, risk: 85 }, { assigned: 4, risk: 85 },
                    { assigned: 8, risk: 67 }, { assigned: 5, risk: 91 }, { assigned: 7, risk: 65 },
                    { assigned: 8, risk: 12 }, { assigned: 9, risk: 8 }
                ]
            },
            {
                name: "Nocturno",
                target: 3,
                cells: [
                    { assigned: 4, risk: 0 }, { assigned: 4, risk: 12 }, { assigned: 9, risk: 0 },
                    { assigned: 6, risk: 10 }, { assigned: 7, risk: 1 }, { assigned: 5, risk: 11 },
                    { assigned: 6, risk: 4 }, { assigned: 5, risk: 0 }, { assigned: 5, risk: 0 },
                    { assigned: 11, risk: 0 }, { assigned: 12, risk: 0 }, { assigned: 6, risk: 0 },
                    { assigned: 4, risk: 0 }, { assigned: 3, risk: 0 }
                ]
            },
            {
                name: "Vespertino",
                target: 6,
                cells: [
                    { assigned: 5, risk: 60 }, { assigned: 5, risk: 65 }, { assigned: 10, risk: 11 },
                    { assigned: 13, risk: 2 }, { assigned: 13, risk: 0 }, { assigned: 10, risk: 12 },
                    { assigned: 8, risk: 31 }, { assigned: 12, risk: 7 }, { assigned: 12, risk: 7 },
                    { assigned: 7, risk: 9 }, { assigned: 5, risk: 60 }, { assigned: 6, risk: 55 },
                    { assigned: 6, risk: 15 }, { assigned: 7, risk: 8 }
                ]
            }
        ],
        recs: [
            {
                type: "danger",
                icon: "fa-wrench",
                title: "Déficit Prolongado de Técnicos Mecánicos",
                desc: "Turno diurno entre el 26 de feb y 2 de mar cuenta con solo 4 de 8 técnicos necesarios. Se requiere activar cuadrilla externa."
            },
            {
                type: "warning",
                icon: "fa-bell",
                title: "Sobrecarga en Mantenimiento Preventivo",
                desc: "El riesgo de fatiga aumenta al 91% el 2 de marzo por acumulación de paradas de planta. Coordinar rotaciones previas."
            },
            {
                type: "success",
                icon: "fa-circle-check",
                title: "Nocturno Estable para Mantenimiento",
                desc: "Cobertura óptima constante con dotación superior al mínimo requerido de 3 técnicos."
            }
        ]
    },
    destilacion: {
        name: "Destilación",
        shifts: [
            {
                name: "Diurno",
                target: 10,
                cells: [
                    { assigned: 17, risk: 0 }, { assigned: 11, risk: 0 }, { assigned: 11, risk: 0 },
                    { assigned: 11, risk: 7 }, { assigned: 13, risk: 11 }, { assigned: 13, risk: 9 },
                    { assigned: 12, risk: 3 }, { assigned: 12, risk: 18 }, { assigned: 11, risk: 5 },
                    { assigned: 12, risk: 2 }, { assigned: 11, risk: 1 }, { assigned: 11, risk: 0 },
                    { assigned: 10, risk: 0 }, { assigned: 10, risk: 5 }
                ]
            },
            {
                name: "Nocturno",
                target: 6,
                cells: [
                    { assigned: 11, risk: 0 }, { assigned: 12, risk: 0 }, { assigned: 12, risk: 0 },
                    { assigned: 12, risk: 0 }, { assigned: 14, risk: 0 }, { assigned: 13, risk: 0 },
                    { assigned: 15, risk: 0 }, { assigned: 15, risk: 0 }, { assigned: 15, risk: 0 },
                    { assigned: 14, risk: 0 }, { assigned: 14, risk: 0 }, { assigned: 10, risk: 0 },
                    { assigned: 8, risk: 0 }, { assigned: 7, risk: 0 }
                ]
            },
            {
                name: "Vespertino",
                target: 8,
                cells: [
                    { assigned: 15, risk: 0 }, { assigned: 14, risk: 0 }, { assigned: 13, risk: 0 },
                    { assigned: 13, risk: 0 }, { assigned: 14, risk: 0 }, { assigned: 14, risk: 1 },
                    { assigned: 15, risk: 0 }, { assigned: 15, risk: 0 }, { assigned: 17, risk: 0 },
                    { assigned: 10, risk: 3 }, { assigned: 10, risk: 33 }, { assigned: 8, risk: 2 },
                    { assigned: 8, risk: 4 }, { assigned: 9, risk: 1 }
                ]
            }
        ],
        recs: [
            {
                type: "success",
                icon: "fa-circle-check",
                title: "Área con Cobertura Altamente Robusta",
                desc: "Destilación presenta una dotación superior a los 10/8/6 requeridos con riesgo promedio inferior al 5%."
            },
            {
                type: "warning",
                icon: "fa-shuffle",
                title: "Candidata Ideal para Reasignaciones",
                desc: "Cuenta con hasta 4 operadores excedentes en turno diurno que pueden apoyar a Cracking sin arriesgar la operación."
            }
        ]
    },
    almacenamiento: {
        name: "Almacenamiento",
        shifts: [
            {
                name: "Diurno",
                target: 6,
                cells: [
                    { assigned: 8, risk: 12 }, { assigned: 8, risk: 10 }, { assigned: 7, risk: 5 },
                    { assigned: 6, risk: 15 }, { assigned: 6, risk: 8 }, { assigned: 6, risk: 10 },
                    { assigned: 7, risk: 14 }, { assigned: 7, risk: 12 }, { assigned: 6, risk: 15 },
                    { assigned: 6, risk: 10 }, { assigned: 5, risk: 45 }, { assigned: 5, risk: 52 },
                    { assigned: 6, risk: 10 }, { assigned: 6, risk: 12 }
                ]
            },
            {
                name: "Nocturno",
                target: 2,
                cells: [
                    { assigned: 3, risk: 0 }, { assigned: 3, risk: 0 }, { assigned: 2, risk: 0 },
                    { assigned: 2, risk: 2 }, { assigned: 3, risk: 0 }, { assigned: 2, risk: 0 },
                    { assigned: 2, risk: 0 }, { assigned: 2, risk: 0 }, { assigned: 3, risk: 0 },
                    { assigned: 2, risk: 0 }, { assigned: 2, risk: 5 }, { assigned: 2, risk: 5 },
                    { assigned: 2, risk: 0 }, { assigned: 2, risk: 0 }
                ]
            },
            {
                name: "Vespertino",
                target: 4,
                cells: [
                    { assigned: 5, risk: 8 }, { assigned: 5, risk: 12 }, { assigned: 4, risk: 15 },
                    { assigned: 4, risk: 20 }, { assigned: 4, risk: 10 }, { assigned: 4, risk: 15 },
                    { assigned: 5, risk: 10 }, { assigned: 4, risk: 18 }, { assigned: 4, risk: 12 },
                    { assigned: 4, risk: 10 }, { assigned: 3, risk: 55 }, { assigned: 3, risk: 62 },
                    { assigned: 4, risk: 15 }, { assigned: 4, risk: 10 }
                ]
            }
        ],
        recs: [
            {
                type: "warning",
                icon: "fa-boxes-stacked",
                title: "Déficit Moderado el 2 y 3 de Marzo",
                desc: "El turno vespertino cae a 3 de 4 requeridos debido a descanso compensatorio programado."
            },
            {
                type: "success",
                icon: "fa-check",
                title: "Turno Nocturno en Regla",
                desc: "Cumplimiento al 100% de la dotación mínima de 2 operadores requeridos."
            }
        ]
    },
    oficinas: {
        name: "Oficinas",
        shifts: [
            {
                name: "Diurno",
                target: 5,
                cells: [
                    { assigned: 6, risk: 2 }, { assigned: 6, risk: 2 }, { assigned: 5, risk: 0 },
                    { assigned: 5, risk: 4 }, { assigned: 5, risk: 3 }, { assigned: 5, risk: 2 },
                    { assigned: 5, risk: 2 }, { assigned: 5, risk: 5 }, { assigned: 5, risk: 2 },
                    { assigned: 5, risk: 0 }, { assigned: 5, risk: 2 }, { assigned: 5, risk: 5 },
                    { assigned: 5, risk: 2 }, { assigned: 5, risk: 0 }
                ]
            },
            {
                name: "Vespertino",
                target: 1,
                cells: [
                    { assigned: 1, risk: 0 }, { assigned: 1, risk: 0 }, { assigned: 1, risk: 0 },
                    { assigned: 1, risk: 0 }, { assigned: 1, risk: 0 }, { assigned: 1, risk: 0 },
                    { assigned: 1, risk: 0 }, { assigned: 1, risk: 0 }, { assigned: 1, risk: 0 },
                    { assigned: 1, risk: 0 }, { assigned: 1, risk: 0 }, { assigned: 1, risk: 0 },
                    { assigned: 1, risk: 0 }, { assigned: 1, risk: 0 }
                ]
            }
        ],
        recs: [
            {
                type: "success",
                icon: "fa-building",
                title: "Área Administrativa Estable",
                desc: "Sin registros de fatiga ni ausentismo crítico proyectado."
            }
        ]
    },
    urgencias: {
        name: "Urgencias (Clínica)",
        shifts: [
            {
                name: "Diurno",
                target: 10,
                cells: [
                    { assigned: 8, risk: 78 }, { assigned: 7, risk: 85 }, { assigned: 11, risk: 15 },
                    { assigned: 10, risk: 20 }, { assigned: 10, risk: 10 }, { assigned: 9, risk: 45 },
                    { assigned: 10, risk: 25 }, { assigned: 8, risk: 72 }, { assigned: 7, risk: 89 },
                    { assigned: 11, risk: 12 }, { assigned: 10, risk: 18 }, { assigned: 8, risk: 75 },
                    { assigned: 10, risk: 22 }, { assigned: 10, risk: 15 }
                ]
            },
            {
                name: "Nocturno",
                target: 8,
                cells: [
                    { assigned: 8, risk: 25 }, { assigned: 8, risk: 30 }, { assigned: 9, risk: 10 },
                    { assigned: 8, risk: 15 }, { assigned: 8, risk: 20 }, { assigned: 7, risk: 65 },
                    { assigned: 8, risk: 25 }, { assigned: 8, risk: 28 }, { assigned: 7, risk: 60 },
                    { assigned: 9, risk: 12 }, { assigned: 8, risk: 15 }, { assigned: 8, risk: 32 },
                    { assigned: 8, risk: 18 }, { assigned: 8, risk: 20 }
                ]
            },
            {
                name: "Vespertino",
                target: 9,
                cells: [
                    { assigned: 9, risk: 35 }, { assigned: 8, risk: 55 }, { assigned: 9, risk: 20 },
                    { assigned: 9, risk: 15 }, { assigned: 10, risk: 12 }, { assigned: 9, risk: 25 },
                    { assigned: 9, risk: 30 }, { assigned: 8, risk: 62 }, { assigned: 8, risk: 58 },
                    { assigned: 10, risk: 10 }, { assigned: 9, risk: 20 }, { assigned: 8, risk: 55 },
                    { assigned: 9, risk: 18 }, { assigned: 9, risk: 25 }
                ]
            }
        ],
        recs: [
            {
                type: "danger",
                icon: "fa-kit-medical",
                title: "Déficit de Médicos de Urgencia en Fin de Semana",
                desc: "Dotación diurna cae a 7/10 con riesgo del 85-89%. Se sugiere activar turnos de llamada para Médicos de Urgencia."
            },
            {
                type: "warning",
                icon: "fa-user-nurse",
                title: "Fatiga Acumulada en Personal TENS",
                desc: "3 profesionales TENS registran turnos dobles. Rotar con personal de Consulta General."
            }
        ]
    },
    uci: {
        name: "UCI Adulto (Clínica)",
        shifts: [
            {
                name: "Diurno",
                target: 8,
                cells: [
                    { assigned: 8, risk: 15 }, { assigned: 8, risk: 20 }, { assigned: 8, risk: 18 },
                    { assigned: 7, risk: 68 }, { assigned: 8, risk: 22 }, { assigned: 8, risk: 15 },
                    { assigned: 8, risk: 12 }, { assigned: 7, risk: 71 }, { assigned: 8, risk: 25 },
                    { assigned: 8, risk: 18 }, { assigned: 8, risk: 15 }, { assigned: 7, risk: 65 },
                    { assigned: 8, risk: 20 }, { assigned: 8, risk: 14 }
                ]
            },
            {
                name: "Nocturno",
                target: 6,
                cells: [
                    { assigned: 6, risk: 20 }, { assigned: 6, risk: 15 }, { assigned: 6, risk: 25 },
                    { assigned: 6, risk: 18 }, { assigned: 6, risk: 20 }, { assigned: 6, risk: 30 },
                    { assigned: 6, risk: 22 }, { assigned: 6, risk: 15 }, { assigned: 6, risk: 18 },
                    { assigned: 6, risk: 20 }, { assigned: 6, risk: 15 }, { assigned: 6, risk: 25 },
                    { assigned: 6, risk: 20 }, { assigned: 6, risk: 18 }
                ]
            },
            {
                name: "Vespertino",
                target: 7,
                cells: [
                    { assigned: 7, risk: 22 }, { assigned: 7, risk: 18 }, { assigned: 7, risk: 25 },
                    { assigned: 7, risk: 20 }, { assigned: 7, risk: 15 }, { assigned: 7, risk: 28 },
                    { assigned: 7, risk: 18 }, { assigned: 6, risk: 62 }, { assigned: 7, risk: 20 },
                    { assigned: 7, risk: 15 }, { assigned: 7, risk: 18 }, { assigned: 7, risk: 22 },
                    { assigned: 7, risk: 15 }, { assigned: 7, risk: 20 }
                ]
            }
        ],
        recs: [
            {
                type: "warning",
                icon: "fa-heart-pulse",
                title: "Déficit Puntual de Enfermeras Especialistas",
                desc: "Turnos diurnos del 23 y 27 de feb requieren refuerzo de 1 enfermera especialista en paciente crítico."
            }
        ]
    }
};

function initShiftCalendar() {
    const areaSelect = document.getElementById('calendar-area-select');
    if (!areaSelect) return;

    renderCalendar(areaSelect.value);

    areaSelect.addEventListener('change', (e) => {
        renderCalendar(e.target.value);
    });
}

function renderCalendar(selectedArea) {
    const table = document.getElementById('calendar-table');
    const recsContainer = document.getElementById('ai-recs-cards');
    if (!table) return;

    // Header row
    let headerHtml = `<thead><tr><th class="col-area">Área / Turno</th>`;
    CALENDAR_DAYS.forEach(day => {
        headerHtml += `<th>${day}</th>`;
    });
    headerHtml += `</tr></thead>`;

    // Body rows
    let bodyHtml = `<tbody>`;

    if (selectedArea === 'all') {
        // Consolidated: Show Diurno row for each area
        Object.keys(CALENDAR_DATA).forEach(key => {
            const area = CALENDAR_DATA[key];
            const shift = area.shifts[0]; // Diurno
            bodyHtml += buildShiftRow(key, area.name, shift);
        });
    } else {
        const area = CALENDAR_DATA[selectedArea] || CALENDAR_DATA.cracking;
        area.shifts.forEach(shift => {
            bodyHtml += buildShiftRow(selectedArea, area.name, shift);
        });
    }

    bodyHtml += `</tbody>`;
    table.innerHTML = headerHtml + bodyHtml;

    // Render AI recommendations
    if (recsContainer) {
        const area = CALENDAR_DATA[selectedArea] || CALENDAR_DATA.cracking;
        const recs = area.recs || CALENDAR_DATA.cracking.recs;
        recsContainer.innerHTML = recs.map(r => `
            <div class="ai-rec-card ${r.type}">
                <div class="ai-rec-icon"><i class="fa-solid ${r.icon}"></i></div>
                <div class="ai-rec-body">
                    <h5>${r.title}</h5>
                    <p>${r.desc}</p>
                </div>
            </div>
        `).join('');
    }
}

function buildShiftRow(areaKey, areaName, shift) {
    let row = `<tr>`;
    row += `
        <td class="row-label">
            <span class="row-area-name">${areaName}</span>
            <span class="row-shift-name">${shift.name}</span>
        </td>
    `;

    shift.cells.forEach((cell, dayIdx) => {
        const isCritical = cell.risk >= 70 || cell.assigned < shift.target * 0.75;
        const isWarning = (cell.risk >= 40 && cell.risk < 70) || (cell.assigned < shift.target && cell.assigned >= shift.target * 0.75);
        const statusClass = isCritical ? 'danger' : (isWarning ? 'warning' : 'ok');

        row += `
            <td>
                <div class="shift-cell ${statusClass}" onclick="openShiftModal('${areaKey}', '${shift.name}', ${dayIdx}, '${CALENDAR_DAYS[dayIdx]}')">
                    <div class="shift-stat">
                        <span class="cell-dot"></span>
                        <span>${cell.assigned}/${shift.target}</span>
                    </div>
                    <span class="shift-risk">${cell.risk}% riesgo</span>
                </div>
            </td>
        `;
    });

    row += `</tr>`;
    return row;
}

// Modal Interaction
const WORKER_NAMES = [
    { name: "Juan Morales", role: "Operador de Campo", id: "1042" },
    { name: "Carlos Gómez", role: "Operador de Panel", id: "1105" },
    { name: "Esteban Valdés", role: "Técnico Mecánico", id: "1088" },
    { name: "Rodrigo Parra", role: "Supervisor de Turno", id: "1012" },
    { name: "María Pinto", role: "Operador de Campo", id: "1150" },
    { name: "Diego Muñoz", role: "Ingeniero de Procesos", id: "1025" },
    { name: "Javier Soto", role: "Operador Panelista", id: "1190" },
    { name: "Alejandro C.", role: "Técnico de Apoyo", id: "1230" },
    { name: "Patricia R.", role: "Operador Planta", id: "1114" }
];

function openShiftModal(areaKey, shiftName, dayIdx, dayLabel) {
    const area = CALENDAR_DATA[areaKey] || CALENDAR_DATA.cracking;
    const shift = area.shifts.find(s => s.name === shiftName) || area.shifts[0];
    const cell = shift.cells[dayIdx];

    const isCritical = cell.risk >= 70 || cell.assigned < shift.target * 0.75;
    const isWarning = (cell.risk >= 40 && cell.risk < 70) || (cell.assigned < shift.target && cell.assigned >= shift.target * 0.75);
    const statusClass = isCritical ? 'danger' : (isWarning ? 'warning' : 'ok');

    document.getElementById('modal-shift-title').innerText = `${area.name} - Turno ${shift.name}`;
    document.getElementById('modal-shift-subtitle').innerText = `${dayLabel} • Cobertura: ${cell.assigned}/${shift.target} trabajadores`;

    const banner = document.getElementById('modal-alert-banner');
    banner.className = `shift-alert-banner ${statusClass}`;
    
    const bannerText = document.getElementById('modal-alert-text');
    if (isCritical) {
        bannerText.innerHTML = `<strong>⚠️ Déficit Crítico (${cell.risk}% Riesgo de Fatiga):</strong> Faltan ${Math.max(1, shift.target - cell.assigned)} trabajadores para cumplir la dotación mínima de seguridad (${shift.target} requeridos).`;
    } else if (isWarning) {
        bannerText.innerHTML = `<strong>⚠️ Alerta Moderada (${cell.risk}% Riesgo):</strong> Cobertura justa (${cell.assigned}/${shift.target}). 2 trabajadores presentan signos tempranos de fatiga acumulada.`;
    } else {
        bannerText.innerHTML = `<strong>✅ Cobertura Óptima (${cell.risk}% Riesgo):</strong> La dotación asignada (${cell.assigned}/${shift.target}) cumple satisfactoriamente con la demanda operativa esperada.`;
    }

    // Workers list
    const workersContainer = document.getElementById('modal-workers-list');
    let workersHtml = '';

    const count = Math.min(cell.assigned, 5);
    for (let i = 0; i < count; i++) {
        const w = WORKER_NAMES[i % WORKER_NAMES.length];
        let wFatigue = cell.risk;
        if (i === 1) wFatigue = Math.max(10, cell.risk - 15);
        if (i > 1) wFatigue = Math.max(5, cell.risk - 30 - (i * 8));

        const wStatus = wFatigue >= 70 ? 'danger' : (wFatigue >= 40 ? 'warning' : 'success');
        const wStatusText = wFatigue >= 70 ? 'Fatiga Crítica' : (wFatigue >= 40 ? 'Alerta Media' : 'Óptimo');
        const reasonText = wFatigue >= 70 
            ? '14 hrs acumuladas en últimas 24h • Horas extra continuas' 
            : (wFatigue >= 40 ? 'Variabilidad de descanso moderada' : 'Parámetros biométricos y sueño dentro de rango');

        workersHtml += `
            <div class="modal-worker-card">
                <div class="worker-info">
                    <div class="worker-avatar ${wStatus}">${w.name.split(' ').map(n=>n[0]).join('')}</div>
                    <div>
                        <div class="worker-name">${w.name} <span style="font-size: 11px; color: #64748b; font-weight: normal;">(ID: ${w.id})</span></div>
                        <div class="worker-role">${w.role}</div>
                    </div>
                </div>
                <div class="worker-alert">
                    <span class="worker-fatigue-badge ${wStatus}">${wFatigue}% • ${wStatusText}</span>
                    <span class="worker-warning-reason">${reasonText}</span>
                </div>
            </div>
        `;
    }

    workersContainer.innerHTML = workersHtml;

    // AI recommendation text
    const aiText = document.getElementById('modal-ai-action-text');
    if (isCritical) {
        aiText.innerText = `Reasignar 2 operadores disponibles desde Almacenamiento (cobertura disponible al 100%) y activar personal de guardia para mitigar el déficit en ${area.name}.`;
    } else if (isWarning) {
        aiText.innerText = `Monitorear descanso de ${WORKER_NAMES[0].name} y programar rotación preventiva con relevo de turno.`;
    } else {
        aiText.innerText = `Mantener programación establecida. No se requieren acciones correctivas en este turno.`;
    }

    document.getElementById('shift-detail-modal').style.display = 'flex';
}

function closeShiftModal() {
    const modal = document.getElementById('shift-detail-modal');
    if (modal) modal.style.display = 'none';
}

function applyReassignment() {
    alert("✅ Reasignación ejecutada exitosamente por SkillUp AI Assistant.\nSe notificó a los supervisores de turno y se actualizó la dotación.");
    closeShiftModal();
}

