// Manejo de Vistas y Roles
const urlParams = new URLSearchParams(window.location.search);
const forcedRole = urlParams.get('role');
let isManager = (forcedRole === 'manager');

function switchTab(tabName, element) {
    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    // Add active class to clicked item
    element.classList.add('active');
    
    // Ocultar todas las vistas
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
        view.style.display = 'none'; // Ensure it is hidden
    });
    
    if (tabName === 'inicio') {
        document.body.classList.remove('header-hidden');
        if (isManager) {
            const el = document.getElementById('view-inicio-manager');
            el.classList.add('active');
            el.style.display = 'flex';
        } else {
            const el = document.getElementById('view-inicio-worker');
            el.classList.add('active');
            el.style.display = 'flex';
        }
    } else {
        document.body.classList.add('header-hidden');
        const el = document.getElementById(`view-${tabName}`);
        if (el) {
            el.classList.add('active');
            el.style.display = 'flex';
        }
    }
}

function toggleRole() {
    isManager = !isManager;
    
    // Forzar ir a la pestaña inicio cuando cambian de rol
    const inicioTab = document.querySelector('.nav-item[onclick*="inicio"]');
    switchTab('inicio', inicioTab);
    
    if(isManager) {
        setTimeout(initCharts, 100);
        fetchDataFromAPI();
    }
}

async function fetchDataFromAPI() {
    if(!isManager) return;
    
    try {
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
            const kpiValues = document.querySelectorAll('.manager-content .kpi-value');
            if(kpiValues.length >= 2) {
                kpiValues[0].innerText = avgRisk + '%';
                kpiValues[1].innerText = criticalUnits.size;
            }
            
                // Update staff list on home screen
                const staffList = document.querySelector('.staff-list:not(#team-list)');
                if(staffList) {
                    staffList.innerHTML = '';
                    preds.slice(0, 3).forEach((p, idx) => {
                        const pct = (p.predicted_deficit_probability * 100).toFixed(1);
                        
                        const isDanger = p.predicted_deficit_probability > 0.7;
                        const isWarning = p.predicted_deficit_probability > 0.4 && p.predicted_deficit_probability <= 0.7;
                        const badgeClass = isDanger ? 'danger' : (isWarning ? 'warning' : 'success');
                        
                        let role = 'TENS';
                        if (p.predicted_role_has_deficit_medico === 1) role = 'Médico';
                        else if (p.predicted_role_has_deficit_enfermera === 1) role = 'Enfermera';
                        
                        const unit = p.clinical_unit.replace('_', ' ');
                        
                        staffList.innerHTML += `
                            <div class="staff-item">
                                <div class="staff-info"><h4>Staff ${idx+1}</h4><p style="text-transform: capitalize;">${role} • ${unit}</p></div>
                                <div class="staff-status ${badgeClass}">Riesgo: ${pct}%</div>
                            </div>
                        `;
                    });
                }
                
                // Update team list on Equipo tab
                const teamList = document.getElementById('team-list');
                if(teamList) {
                    teamList.innerHTML = '';
                    preds.slice(0, 10).forEach((p, idx) => { // Mostrar top 10 para el directorio
                        const pct = (p.predicted_deficit_probability * 100).toFixed(1);
                        
                        const isDanger = p.predicted_deficit_probability > 0.7;
                        const isWarning = p.predicted_deficit_probability > 0.4 && p.predicted_deficit_probability <= 0.7;
                        const badgeClass = isDanger ? 'danger' : (isWarning ? 'warning' : 'success');
                        
                        let role = 'TENS';
                        if (p.predicted_role_has_deficit_medico === 1) role = 'Médico';
                        else if (p.predicted_role_has_deficit_enfermera === 1) role = 'Enfermera';
                        
                        const unit = p.clinical_unit.replace('_', ' ');
                        
                        teamList.innerHTML += `
                            <div class="staff-item" style="margin-bottom: 10px;">
                                <div class="staff-info">
                                    <h4 style="display: flex; align-items: center; gap: 8px;">
                                        <img src="https://i.pravatar.cc/150?img=${idx+20}" style="width: 24px; height: 24px; border-radius: 50%;"> 
                                        Trabajador ${idx+1}
                                    </h4>
                                    <p style="text-transform: capitalize; margin-top: 5px;">${role} • ${unit}</p>
                                </div>
                                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 5px;">
                                    <div class="staff-status ${badgeClass}">Riesgo: ${pct}%</div>
                                    <button style="background: transparent; border: none; color: #1e3a8a; font-size: 18px; padding: 5px;"><i class="fa-brands fa-whatsapp"></i></button>
                                </div>
                            </div>
                        `;
                    });
                }
                
                // Initialize charts with dynamic data
                initCharts(preds);
        }
    } catch(e) {
        console.error("Error fetching API", e);
    }
}

// Inicializar progreso del circulo y eventos
document.addEventListener('DOMContentLoaded', () => {
    // Evento de scroll para ocultar header animado
    document.querySelectorAll('.content').forEach(content => {
        content.addEventListener('scroll', () => {
            const activeNav = document.querySelector('.nav-item.active');
            // Solo aplicamos la animacion de scroll en la vista de inicio
            if (activeNav && activeNav.getAttribute('onclick').includes('inicio')) {
                if (content.scrollTop > 40) {
                    document.body.classList.add('header-hidden');
                } else {
                    document.body.classList.remove('header-hidden');
                }
            }
        });
    });

    // Sync UI with forced role if any
    const toggleCheckbox = document.getElementById('role-toggle');
    if (toggleCheckbox) {
        toggleCheckbox.checked = isManager;
    }
    
    if (forcedRole) {
        const toggleContainer = document.getElementById('role-toggle-container');
        if (toggleContainer) {
            toggleContainer.style.display = 'none';
        }
    }

    if (isManager) {
        document.body.classList.remove('worker-mode');
        document.body.classList.add('manager-mode');
        
        const titleEl = document.getElementById('global-header-title');
        if (titleEl) titleEl.innerText = 'Dashboard Clínica';
        
        document.querySelectorAll('.nav-worker-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.nav-manager-only').forEach(el => el.style.display = 'flex');
    } else {
        document.querySelectorAll('.nav-worker-only').forEach(el => el.style.display = 'flex');
        document.querySelectorAll('.nav-manager-only').forEach(el => el.style.display = 'none');
    }

    // Forzar la vista correcta al cargar
    const inicioTab = document.querySelector('.nav-item[onclick*="inicio"]');
    if (inicioTab) {
        switchTab('inicio', inicioTab);
    }
    
    if (isManager) {
        fetchDataFromAPI();
    }
    
    try {
        const circle = document.querySelector('.progress-ring__circle');
        if(circle) {
            // Usamos 110 estatico por si el SVG falla al leer baseVal oculto
            const radius = 110; 
            const circumference = radius * 2 * Math.PI;
            circle.style.strokeDasharray = `${circumference} ${circumference}`;
            
            // 82% aptitud (100 - 82 = 18% offset)
            const offset = circumference - (82 / 100) * circumference;
            
            // Animar la barra al cargar
            setTimeout(() => {
                circle.style.strokeDashoffset = offset;
            }, 100);
        }
    } catch(e) {
        console.error("Error animando circulo:", e);
    }
    
    // Iniciar chart de salud
    const ctxHealth = document.getElementById('health-chart');
    if (ctxHealth) {
        new Chart(ctxHealth.getContext('2d'), {
            type: 'line',
            data: {
                labels: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
                datasets: [{
                    data: [5, 6, 7, 5, 8, 6, 8],
                    borderColor: '#00acc1',
                    tension: 0,
                    fill: false,
                    pointBackgroundColor: '#00acc1',
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { 
                    y: { min: 0, max: 10, ticks: { stepSize: 2 } }, 
                    x: { grid: { display: false } } 
                }
            }
        });
    }
    // Initialize Interactive Circular Slider in Worker View
    // Initialize Interactive Circular Slider in Worker View
    const progressContainer = document.getElementById('interactive-progress');
    if (progressContainer) {
        const circle = document.getElementById('progress-circle');
        const thumb = document.getElementById('progress-thumb');
        const valText = document.getElementById('progress-value');
        const labelText = document.getElementById('progress-label');
        const msg1 = document.getElementById('status-message-1');
        const msg2 = document.getElementById('status-message-2');
        
        let isDragging = false;
        const radius = 110;
        const circumference = radius * 2 * Math.PI; // ~691

        function updateProgress(value) {
            if (value > 100) value = 100;
            if (value < 0) value = 0;
            
            // Calculate angle from value (0 to 100 -> 0 to 2PI)
            const theta = (value / 100) * (2 * Math.PI);
            
            // Calculate thumb position
            const thumbX = 130 + radius * Math.sin(theta);
            const thumbY = 130 - radius * Math.cos(theta);
            
            thumb.style.left = `${thumbX - 17}px`;
            thumb.style.top = `${thumbY - 17}px`;
            
            // Update offset
            const offset = circumference - (value / 100) * circumference;
            circle.style.strokeDashoffset = offset;
            
            // Update colors and text
            valText.innerText = value;
            let color = '#10b981'; // Green
            let label = 'ÓPTIMO';
            let m1 = 'Tu riesgo predicho de fatiga es bajo.';
            let m2 = 'Estás asignado a zonas de alta demanda sin restricciones.';
            
            if (value < 30) {
                color = '#ef4444'; // Red
                label = 'FATIGA ALTA';
                m1 = 'Alerta: Nivel de fatiga crítico.';
                m2 = 'Se requiere descanso obligatorio o reasignación a tareas de bajo riesgo.';
            } else if (value < 50) {
                color = '#f59e0b'; // Orange
                label = 'OBSERVACIÓN';
                m1 = 'Precaución: Riesgo de fatiga moderado.';
                m2 = 'No estás apto para áreas críticas (Ej. UCI, Urgencias).';
            } else {
                color = '#10b981'; // Green
                label = 'ÓPTIMO';
                m1 = 'Tu riesgo predicho de fatiga es bajo.';
                m2 = 'Estás asignado a zonas de alta demanda sin restricciones.';
            }
            
            circle.style.stroke = color;
            thumb.style.borderColor = color;
            labelText.style.color = color;
            labelText.innerText = label;
            
            if (msg1) msg1.innerText = m1;
            if (msg2) msg2.innerText = m2;
        }

        function handlePointerMove(clientX, clientY) {
            const rect = progressContainer.getBoundingClientRect();
            const centerX = rect.left + 130;
            const centerY = rect.top + 130;
            
            const dx = clientX - centerX;
            const dy = clientY - centerY;
            const angle = Math.atan2(dy, dx); // from -PI to PI
            
            // Normalize so 0 is at top (12 o'clock) and goes clockwise
            let theta = angle + Math.PI / 2;
            if (theta < 0) theta += 2 * Math.PI;
            
            let value = Math.round((theta / (2 * Math.PI)) * 100);
            updateProgress(value);
        }

        progressContainer.addEventListener('pointerdown', (e) => {
            isDragging = true;
            progressContainer.style.cursor = 'grabbing';
            handlePointerMove(e.clientX, e.clientY);
            thumb.style.transform = 'scale(1.2)';
        });

        window.addEventListener('pointermove', (e) => {
            if (isDragging) {
                handlePointerMove(e.clientX, e.clientY);
            }
        });

        window.addEventListener('pointerup', () => {
            isDragging = false;
            if(progressContainer) progressContainer.style.cursor = 'grab';
            thumb.style.transform = 'scale(1)';
        });
        
        // Initialize at 82%
        setTimeout(() => updateProgress(82), 50);
    }
});

let chartsInitialized = false;
let globalCharts = {};

function initCharts(preds = []) {
    if (chartsInitialized && !preds.length) return;
    
    // Gráfico 1: Impacto de Factores (Simulando SHAP)
    const ctxFactors = document.getElementById('chart-factors').getContext('2d');
    if(globalCharts['factors']) globalCharts['factors'].destroy();
    globalCharts['factors'] = new Chart(ctxFactors, {
        type: 'bar',
        data: {
            labels: ['Personal Flotante', 'Déficit Previo', 'Carga Asistencial', 'Eficiencia Sueño'],
            datasets: [{
                data: [0.8, 0.65, 0.45, -0.3],
                backgroundColor: ['#1e3a8a', '#3b82f6', '#93c5fd', '#ef4444'],
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { display: false, max: 1 }, y: { grid: { display: false } } }
        }
    });

    // Gráfico 2: Riesgo por Unidad (Heatmap simulado con Bar)
    let unitLabels = ['Ambulatoria', 'Toma Muestras', 'Imagenología', 'Consulta Gen.'];
    let unitData = [98, 75, 45, 12];
    
    if (preds.length > 0) {
        let unitRisk = {};
        preds.forEach(p => {
            if (!unitRisk[p.clinical_unit]) unitRisk[p.clinical_unit] = { risk: 0, count: 0 };
            unitRisk[p.clinical_unit].risk += p.predicted_deficit_probability;
            unitRisk[p.clinical_unit].count += 1;
        });
        
        // Sort units by risk descending, take top 4
        let sortedUnits = Object.keys(unitRisk)
            .map(u => ({ unit: u, avg: (unitRisk[u].risk / unitRisk[u].count) * 100 }))
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 4);
            
        unitLabels = sortedUnits.map(u => u.unit.replace('_', ' '));
        unitData = sortedUnits.map(u => u.avg);
    }
    
    const ctxUnits = document.getElementById('chart-units').getContext('2d');
    if(globalCharts['units']) globalCharts['units'].destroy();
    globalCharts['units'] = new Chart(ctxUnits, {
        type: 'bar',
        data: {
            labels: unitLabels,
            datasets: [{
                data: unitData,
                backgroundColor: ['#7f1d1d', '#b91c1c', '#f87171', '#fef08a'],
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { display: false, max: 100 }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } }
        }
    });

    // Gráfico 3: Tendencia
    let trendLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    let trendData = [2, 1, 4, 10, 15, 8, 3];
    
    if (preds.length > 0) {
        let dateRisk = {};
        preds.forEach(p => {
            if (!dateRisk[p.date]) dateRisk[p.date] = { risk: 0, count: 0 };
            dateRisk[p.date].risk += p.predicted_deficit_probability;
            dateRisk[p.date].count += 1;
        });
        
        let sortedDates = Object.keys(dateRisk).sort().slice(-7);
        trendLabels = sortedDates.map(d => d.substring(5)); // MM-DD
        trendData = sortedDates.map(d => (dateRisk[d].risk / dateRisk[d].count) * 100);
    }

    const ctxTrend = document.getElementById('chart-trend').getContext('2d');
    if(globalCharts['trend']) globalCharts['trend'].destroy();
    globalCharts['trend'] = new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: trendLabels,
            datasets: [{
                data: trendData,
                borderColor: '#ef4444',
                tension: 0.4,
                fill: true,
                backgroundColor: 'rgba(239, 68, 68, 0.2)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { display: false, max: 100 }, x: { grid: { display: false } } }
        }
    });

    chartsInitialized = true;
}
