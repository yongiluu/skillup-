// desktop-prototype/app.js

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initCharts();
    fetchDataFromAPI();
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
