// desktop-prototype/app.js — SkillUp · Turnos restaurante
// Datos: window.SKILLUP_DATA (data.js, generado por scripts/10_build_restaurant_ui_data.py)

const DATA = window.SKILLUP_DATA;

const ROLE_LABELS = {
    garzon: 'Garzón',
    host: 'Host',
    cajero: 'Cajero',
    cocinero_linea: 'Cocinero de línea',
    ayudante_cocina: 'Ayudante de cocina',
    runner: 'Runner',
    copero: 'Copero',
    jefe_turno: 'Jefe de turno',
};
const CRITICAL_ROLES = ['garzon', 'cocinero_linea', 'jefe_turno'];
const PERIOD_NAMES = { '11_13': 'Apertura', '13_15': 'Almuerzo', '19_21': 'Cena', '21_23': 'Cierre' };
const ABSENCE_LABELS = { short_notice_personal: 'Personal (aviso corto)', respiratorio: 'Respiratorio' };

const state = {
    dismissed: new Set(),
    applied: new Set(),
    selectedCell: null,
    selectedEmployee: null,
};

// ---------- helpers ----------
const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parseDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const toISO = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (iso, n) => { const d = parseDate(iso); d.setDate(d.getDate() + n); return toISO(d); };
const fmt = (iso, opts) => parseDate(iso).toLocaleDateString('es-CL', opts);
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const prob = (p) => (p == null ? '—' : p.toFixed(2).replace('.', ','));
const roleLabel = (r) => ROLE_LABELS[r] || r;
const periodLabel = (p) => (DATA.periods[p] || p).replace(':00', '').replace(':00', '').replace('-', '–');

function level(p) {
    if (p >= DATA.thresholds.high) return 'high';
    if (p >= DATA.thresholds.alert) return 'warn';
    return 'ok';
}
const LEVEL_TEXT = { ok: 'Cubierto', warn: 'Alerta', high: 'Riesgo alto' };
const LOAD_TEXT = { ok: 'Normal', warn: 'Atención', high: 'Sobrecarga' };

function dayFlags(iso) {
    const cal = DATA.calendar.find((c) => c.date === iso);
    const dow = parseDate(iso).getDay();
    const flags = [];
    if (cal?.holiday) flags.push({ text: 'Feriado', cls: 'navy' });
    if (cal?.payday) flags.push({ text: 'Día de pago', cls: 'accent' });
    if (dow === 5) flags.push({ text: 'Viernes', cls: 'outline' });
    if (dow === 6) flags.push({ text: 'Sábado', cls: 'outline' });
    return flags;
}

// "reforzar jefe_turno para la franja 11_13" -> "reforzar jefe de turno para la franja 11–13"
function humanizeAction(action) {
    return String(action || '')
        .replace(/\b(\d{2})_(\d{2})\b/g, '$1–$2')
        .replace(/\b([a-z]+_[a-z]+|garzon|host|cajero|runner|copero)\b/g, (m) => (ROLE_LABELS[m] ? ROLE_LABELS[m].toLowerCase() : m));
}
const daysText = (n) => `${n} ${n === 1 ? 'día seguido' : 'días seguidos'}`;
const longDate = (iso) => capitalize(fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', ''));

function targetRole(action) {
    const m = /(?:reforzar|backup en|cobertura de)\s+([a-z_]+)/.exec(action || '');
    return m ? m[1] : null;
}

function initials(id) { return id.replace('RST_', ''); }

function isWorking(emp, date, period) {
    return emp.shifts.some((s) => s.date === date && s.period === period);
}

function absentToday(id) { return DATA.absencesToday.some((a) => a.id === id); }

// Polivalentes que pueden cubrir `role` y están libres en ese servicio.
function backupCandidates(role, date, period) {
    const allowed = DATA.roleBackups[role] || [];
    return DATA.employees
        .filter((e) => e.crossTrained && (allowed.includes(e.role) || e.backupRole === role) && e.role !== role)
        .filter((e) => !isWorking(e, date, period) && !(date === DATA.demoDate && absentToday(e.id)))
        .sort((a, b) => a.consecutiveDays - b.consecutiveDays || a.overtimeWeek - b.overtimeWeek);
}

function legendHTML() {
    const t = DATA.thresholds;
    return `<span><i class="sw" style="background:var(--ok-bg)"></i>Bajo &lt; ${prob(t.alert)}</span>
        <span><i class="sw" style="background:var(--warn)"></i>Alerta ${prob(t.alert)}–${prob(t.high)}</span>
        <span><i class="sw" style="background:var(--high)"></i>Alto ≥ ${prob(t.high)}</span>`;
}

// ---------- navegación ----------
function showView(name) {
    document.querySelectorAll('.nav-link').forEach((l) => {
        const on = l.dataset.view === name;
        l.classList.toggle('active', on);
        if (on) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current');
    });
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
    window.scrollTo({ top: 0 });
}

function initNavigation() {
    document.querySelectorAll('.nav-link').forEach((l) => l.addEventListener('click', () => showView(l.dataset.view)));
    document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.goto)));
}

// ---------- HOY ----------
function renderToday() {
    const today = DATA.demoDate;
    const services = DATA.services.filter((s) => s.date === today);

    $('#hoy-title').textContent = longDate(today);
    const flags = dayFlags(today);
    const atRisk = services.filter((s) => s.prob >= DATA.thresholds.alert);
    const chips = [];
    if (atRisk.length >= 2 || flags.length) chips.push('<span class="chip accent">Sobredemanda prevista</span>');
    flags.forEach((f) => chips.push(`<span class="chip ${f.cls === 'accent' ? 'outline' : f.cls}">${esc(f.text)}</span>`));
    $('#hoy-chips').innerHTML = chips.join('');

    const req = services.reduce((a, s) => a + s.required, 0);
    const act = services.reduce((a, s) => a + s.actual, 0);
    $('#kpi-coverage').innerHTML = `${act}<small> / ${req} personas-turno</small>`;
    $('#kpi-coverage-bar').style.width = `${Math.min(100, Math.round((act / req) * 100))}%`;
    $('#kpi-risk').innerHTML = `${atRisk.length}<small> de ${services.length}</small>`;
    $('#kpi-risk-sub').textContent = atRisk.length
        ? `${atRisk.map((s) => periodLabel(s.period)).join(', ')} sobre el umbral de alerta (${prob(DATA.thresholds.alert)})`
        : 'Todos los servicios bajo el umbral';

    const byRole = {};
    DATA.absencesToday.forEach((a) => {
        const emp = DATA.employees.find((e) => e.id === a.id);
        const r = emp ? roleLabel(emp.role) : 'Sin rol';
        byRole[r] = (byRole[r] || 0) + 1;
    });
    $('#kpi-abs').textContent = DATA.absencesToday.length;
    $('#kpi-abs-sub').textContent = Object.entries(byRole).map(([r, n]) => `${n} ${r.toLowerCase()}`).join(' · ') || 'Sin ausencias';

    $('#legend').innerHTML = legendHTML();
    const maxCovers = Math.max(...DATA.services.map((s) => s.covers));
    $('#services').innerHTML = services.map((s) => {
        const lv = level(s.prob);
        const gap = s.required - s.actual;
        const roles = CRITICAL_ROLES.map((r) => {
            const rl = level(s.roleProb[r]);
            return `<div class="row"><span>${roleLabel(r)}</span><span class="chip ${rl}">${prob(s.roleProb[r])}</span></div>`;
        }).join('');
        return `<article class="card service">
            <div class="service-top">
                <div><div class="service-time">${periodLabel(s.period)}</div><div class="service-sub">${PERIOD_NAMES[s.period]} · ${s.covers} cubiertos previstos</div></div>
                <span class="chip ${lv}">${LEVEL_TEXT[lv]} · ${prob(s.prob)}</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px">
                <div class="hint">Demanda esperada</div>
                <div class="bar navy"><span style="width:${Math.round((s.covers / maxCovers) * 100)}%"></span></div>
            </div>
            <div class="row"><span>Dotación</span><strong class="${gap > 0 ? 'short' : ''}">${s.actual} / ${s.required}${gap > 0 ? ` · faltan ${gap}` : ''}</strong></div>
            <div style="display:flex;flex-direction:column;gap:8px">
                <div class="hint">Prob. de déficit por rol crítico</div>
                ${roles}
            </div>
            <div class="service-action">${esc(humanizeAction(s.action))}</div>
        </article>`;
    }).join('');

    renderSuggestions(services);
    renderPeaks();
}

function renderSuggestions(services) {
    const used = new Set();
    const items = services
        .filter((s) => s.prob >= DATA.thresholds.alert)
        .sort((a, b) => b.prob - a.prob)
        .map((s) => {
            const role = targetRole(s.action) || CRITICAL_ROLES.reduce((a, r) => (s.roleProb[r] > s.roleProb[a] ? r : a));
            const cand = backupCandidates(role, s.date, s.period).find((c) => !used.has(c.id));
            if (cand) used.add(cand.id);
            return { key: `${s.date}-${s.period}`, s, role, cand };
        })
        .filter((x) => !state.dismissed.has(x.key))
        .slice(0, 3);

    if (!items.length) {
        $('#suggestions').innerHTML = '<p class="empty">Sin acciones pendientes.</p>';
        return;
    }
    $('#suggestions').innerHTML = items.map(({ key, s, role, cand }) => {
        const applied = state.applied.has(key);
        const text = cand
            ? `Mover a <strong>${cand.id}</strong> (${roleLabel(cand.role).toLowerCase()}, ${daysText(cand.consecutiveDays)}) a ${roleLabel(role).toLowerCase()} de ${periodLabel(s.period)}.`
            : `No hay polivalentes libres para ${roleLabel(role).toLowerCase()}: ofrecer turno extra.`;
        return `<div class="suggestion ${applied ? 'applied' : ''}">
            <div class="suggestion-tag">Cubrir ${periodLabel(s.period)} · ${roleLabel(role)}</div>
            <p>${text}</p>
            <div class="actions">
                ${applied
                    ? '<span class="chip ok">Aplicada</span>'
                    : `<button class="btn primary small" data-apply="${key}">Aplicar</button>
                       <button class="btn small" data-dismiss="${key}">Descartar</button>`}
            </div>
        </div>`;
    }).join('');

    $('#suggestions').querySelectorAll('[data-apply]').forEach((b) => b.addEventListener('click', () => {
        state.applied.add(b.dataset.apply); renderSuggestions(services);
    }));
    $('#suggestions').querySelectorAll('[data-dismiss]').forEach((b) => b.addEventListener('click', () => {
        state.dismissed.add(b.dataset.dismiss); renderSuggestions(services);
    }));
}

function renderPeaks() {
    $('#peaks').innerHTML = DATA.peaks.map((p) => {
        const strong = p.reasons.length > 1 || p.reasons.includes('Día de pago') || p.reasons.includes('Feriado');
        return `<div class="peak">
            <div class="peak-day">${esc(fmt(p.date, { weekday: 'long' }))}</div>
            <div class="peak-date">${esc(fmt(p.date, { day: 'numeric', month: 'short' }))}</div>
            <div class="chips">${p.reasons.map((r) => `<span class="chip ${strong ? 'accent' : 'ok'}">${esc(r)}</span>`).join('')}</div>
            <div class="hint">Riesgo máx. ${prob(p.maxProb)}</div>
        </div>`;
    }).join('') + `<div class="peak" style="border:2px dashed var(--line-strong)">
            <div class="peak-day">Evento</div><div class="peak-date">[Fecha]</div>
            <div class="hint">Eventos de la cervecería: pendiente reunión</div>
        </div>`;
}

// ---------- PLANIFICADOR ----------
function renderPlanner() {
    const days = Array.from({ length: 7 }, (_, i) => addDays(DATA.weekStart, i));
    $('#plan-title').textContent = `Semana del ${fmt(days[0], { day: 'numeric' })} al ${fmt(days[6], { day: 'numeric', month: 'long' })}`;
    $('#legend-2').innerHTML = legendHTML();

    let html = '<div></div>';
    days.forEach((d) => {
        const flags = dayFlags(d);
        html += `<div class="day-head ${d === DATA.demoDate ? 'today' : ''}">
            <span class="dow">${esc(capitalize(fmt(d, { weekday: 'short' }).replace('.', '')))}</span>
            <span class="num">${fmt(d, { day: 'numeric' })}</span>
            <span class="chips" style="margin:0;gap:4px">${flags.map((f) => `<span class="chip ${f.cls}">${esc(f.text)}</span>`).join('')}</span>
        </div>`;
    });
    Object.keys(DATA.periods).forEach((p) => {
        html += `<div class="period-label">${periodLabel(p)}<span>${PERIOD_NAMES[p]}</span></div>`;
        days.forEach((d) => {
            const s = DATA.services.find((x) => x.date === d && x.period === p);
            if (!s) { html += '<div></div>'; return; }
            const key = `${d}|${p}`;
            html += `<button class="cell ${level(s.prob)} ${state.selectedCell === key ? 'selected' : ''}" data-cell="${key}"
                aria-label="${esc(fmt(d, { weekday: 'long', day: 'numeric' }))}, ${periodLabel(p)}: ${s.actual} de ${s.required}, probabilidad ${prob(s.prob)}">
                ${s.actual}/${s.required}<small>${prob(s.prob)}</small></button>`;
        });
    });
    $('#week-grid').innerHTML = html;
    $('#week-grid').querySelectorAll('[data-cell]').forEach((b) => b.addEventListener('click', () => {
        state.selectedCell = b.dataset.cell; renderPlanner();
    }));

    renderCellDetail();
    renderMonth();
}

function renderCellDetail() {
    const box = $('#cell-detail');
    if (!state.selectedCell) {
        box.innerHTML = '<h2 style="font-size:20px">Detalle del servicio</h2><p class="hint" style="margin:0">Selecciona una celda para ver roles, demanda y quién puede cubrir.</p>';
        return;
    }
    const [d, p] = state.selectedCell.split('|');
    const s = DATA.services.find((x) => x.date === d && x.period === p);
    const role = targetRole(s.action);
    const cands = role ? backupCandidates(role, d, p).slice(0, 4) : [];
    box.innerHTML = `
        <div class="section-head">
            <h2 style="font-size:20px">${esc(longDate(d))} · ${periodLabel(p)}</h2>
            <span class="chip ${level(s.prob)}">${LEVEL_TEXT[level(s.prob)]} · ${prob(s.prob)}</span>
        </div>
        <div class="detail-grid">
            <div class="stat"><span class="stat-label">Dotación</span><span class="stat-value">${s.actual} / ${s.required}</span></div>
            <div class="stat"><span class="stat-label">Predicción modelo</span><span class="stat-value">${String(s.predicted).replace('.', ',')}</span></div>
            <div class="stat"><span class="stat-label">Cubiertos previstos</span><span class="stat-value">${s.covers}</span></div>
            <div class="stat"><span class="stat-label">Reservas</span><span class="stat-value">${s.reservations}</span></div>
        </div>
        <div class="chips" style="margin:0">${CRITICAL_ROLES.map((r) => `<span class="chip ${level(s.roleProb[r])}">${roleLabel(r)} ${prob(s.roleProb[r])}</span>`).join('')}</div>
        <p style="margin:0"><strong>Recomendación:</strong> ${esc(humanizeAction(s.action))}</p>
        ${role ? `<div><div class="hint" style="margin-bottom:6px">Pueden cubrir ${roleLabel(role).toLowerCase()}</div>
            <div class="chips" style="margin:0">${cands.length ? cands.map((c) => `<span class="chip outline">${c.id} · ${roleLabel(c.role)} · ${daysText(c.consecutiveDays)}</span>`).join('') : '<span class="hint">Nadie libre: ofrecer turno extra.</span>'}</div></div>` : ''}`;
}

function renderMonth() {
    const first = DATA.calendar[0].date;
    const offset = (parseDate(first).getDay() + 6) % 7;
    let html = '<div class="mday blank"></div>'.repeat(offset);
    DATA.calendar.forEach((c) => {
        const dow = parseDate(c.date).getDay();
        const cls = ['mday'];
        if (dow === 5 || dow === 6) cls.push('weekend');
        if (c.payday) cls.push('payday');
        if (c.holiday) cls.push('holiday');
        if (c.date === DATA.demoDate) cls.push('today');
        const title = [c.holiday, c.payday ? 'Día de pago' : null].filter(Boolean).join(' · ');
        html += `<div class="${cls.join(' ')}" ${title ? `title="${esc(title)}"` : ''}>${parseDate(c.date).getDate()}</div>`;
    });
    $('#month').innerHTML = html;
    $('#cal-h').textContent = `Calendario de demanda · ${fmt(first, { month: 'long', year: 'numeric' })}`;
}

function initBreweryForm() {
    const form = $('#brewery-form');
    try {
        const saved = JSON.parse(localStorage.getItem('skillup-brewery') || '{}');
        Object.entries(saved).forEach(([k, v]) => { if (form.elements[k]) form.elements[k].value = v; });
    } catch (e) { /* almacenamiento no disponible */ }
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const values = Object.fromEntries(new FormData(form).entries());
        try {
            localStorage.setItem('skillup-brewery', JSON.stringify(values));
            $('#brewery-saved').textContent = 'Guardado';
        } catch (err) {
            $('#brewery-saved').textContent = 'No se pudo guardar en este navegador';
        }
    });
}

// ---------- EQUIPO ----------
function employeeLevel(e) {
    const flags = (e.consecutiveDays >= 6 ? 1 : 0) + (e.absences90 >= 4 ? 1 : 0) + (e.bio && e.bio.fatigue >= 60 ? 1 : 0);
    return flags >= 2 ? 'high' : flags === 1 ? 'warn' : 'ok';
}

function renderTeam() {
    const select = $('#team-role');
    if (!select.options.length) {
        select.innerHTML = '<option value="">Todos los roles</option>' +
            Object.keys(ROLE_LABELS).map((r) => `<option value="${r}">${ROLE_LABELS[r]}</option>`).join('');
        select.addEventListener('change', renderTeam);
        $('#team-search').addEventListener('input', renderTeam);
    }
    const q = $('#team-search').value.trim().toUpperCase();
    const role = select.value;
    const list = DATA.employees.filter((e) => (!role || e.role === role) && (!q || e.id.includes(q)));
    $('#team-count').textContent = list.length;
    if (!state.selectedEmployee) state.selectedEmployee = DATA.employees[0].id;

    $('#team-items').innerHTML = list.map((e) => `
        <button class="person ${e.id === state.selectedEmployee ? 'active' : ''}" data-emp="${e.id}">
            <span class="avatar">${initials(e.id)}</span>
            <span class="person-text"><strong>${e.id}</strong><span>${roleLabel(e.role)}</span></span>
            <span class="dot ${employeeLevel(e)}" aria-label="Carga ${LOAD_TEXT[employeeLevel(e)].toLowerCase()}"></span>
        </button>`).join('') || '<p class="empty">Sin resultados.</p>';
    $('#team-items').querySelectorAll('[data-emp]').forEach((b) => b.addEventListener('click', () => {
        state.selectedEmployee = b.dataset.emp; renderTeam();
    }));
    renderProfile();
}

function renderProfile() {
    const e = DATA.employees.find((x) => x.id === state.selectedEmployee);
    const covers = Object.entries(DATA.roleBackups).filter(([, backups]) => backups.includes(e.role)).map(([r]) => r);
    const upcoming = e.shifts.filter((s) => s.date >= DATA.demoDate);
    let group = 'A';
    try { group = localStorage.getItem(`skillup-group-${e.id}`) || 'A'; } catch (err) { /* sin almacenamiento */ }

    $('#profile').innerHTML = `
        <header class="card profile-head">
            <div class="profile-id">
                <div class="avatar lg">${initials(e.id)}</div>
                <div style="display:flex;flex-direction:column;gap:6px">
                    <h1>${e.id}</h1>
                    <div class="hint" style="font-size:15px">${roleLabel(e.role)} · ${e.contract === 'full_time' ? 'jornada completa' : 'part time'} · prefiere turno ${({ morning: 'mañana', evening: 'tarde/noche', mixed: 'mixto' })[e.preference] || e.preference} · ${e.seniority} años en el local</div>
                    <div class="chips" style="margin:0">
                        ${e.crossTrained ? covers.map((r) => `<span class="chip ok">Puede cubrir: ${roleLabel(r).toLowerCase()}</span>`).join('') : '<span class="chip muted">No polivalente</span>'}
                    </div>
                </div>
            </div>
            <div class="actions">
                <button class="btn">Editar ficha</button>
                <button class="btn primary">Asignar turno</button>
            </div>
        </header>

        <div class="stats4">
            <div class="card kpi ${e.consecutiveDays >= 6 ? 'flag' : ''}"><span class="kpi-label">Días seguidos trabajados</span><span class="kpi-value">${e.consecutiveDays}</span></div>
            <div class="card kpi"><span class="kpi-label">Horas extra (7 días)</span><span class="kpi-value">${String(e.overtimeWeek).replace('.', ',')} h</span></div>
            <div class="card kpi ${e.absences90 >= 4 ? 'flag' : ''}"><span class="kpi-label">Ausencias (90 días)</span><span class="kpi-value">${e.absences90}</span></div>
            <div class="card kpi"><span class="kpi-label">Estado de carga</span><span class="kpi-value" style="font-size:26px">${LOAD_TEXT[employeeLevel(e)]}</span></div>
        </div>

        <section class="card" aria-labelledby="shifts-h" style="display:flex;flex-direction:column;gap:10px">
            <h2 id="shifts-h" style="font-size:20px">Turnos de la semana desde hoy</h2>
            <div class="table-rows">
                ${upcoming.length ? upcoming.map((s) => `<div><strong>${esc(capitalize(fmt(s.date, { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')))}</strong><span>${periodLabel(s.period)}</span><span class="muted">${roleLabel(s.role)}</span></div>`).join('') : '<p class="empty">Sin turnos asignados.</p>'}
            </div>
        </section>

        <div class="two-col">
            <section class="card pending" aria-labelledby="watch-h" style="display:flex;flex-direction:column;gap:12px">
                <div class="section-head"><h2 id="watch-h" style="font-size:20px">Reloj inteligente</h2><span class="chip muted">Datos simulados</span></div>
                <p class="hint" style="margin:0;line-height:1.45">Últimos valores del dataset sintético. Se reemplazan por los relojes reales cuando lleguen; solo con consentimiento firmado.</p>
                ${e.bio ? `<div class="bio">
                    <div class="stat"><span class="stat-label">Sueño</span><span class="stat-value">${String(e.bio.sleep).replace('.', ',')} h</span></div>
                    <div class="stat"><span class="stat-label">Pasos</span><span class="stat-value">${e.bio.steps.toLocaleString('es-CL')}</span></div>
                    <div class="stat"><span class="stat-label">FC media</span><span class="stat-value">${e.bio.hr} lpm</span></div>
                    <div class="stat"><span class="stat-label">Estrés</span><span class="stat-value">${e.bio.stress}</span></div>
                    <div class="stat"><span class="stat-label">Fatiga</span><span class="stat-value">${e.bio.fatigue}</span></div>
                </div>` : '<p class="empty">Sin datos.</p>'}
            </section>
            <section class="card pending" aria-labelledby="psy-h" style="display:flex;flex-direction:column;gap:12px">
                <div class="section-head"><h2 id="psy-h" style="font-size:20px">Test psicológico</h2><span class="chip muted">Pendiente</span></div>
                <p class="hint" style="margin:0;line-height:1.45">Resultado agregado (estrés / carga percibida). El jefe de turno ve solo el nivel, nunca las respuestas.</p>
                <div style="display:flex;flex-direction:column;gap:6px">
                    <span style="font-size:14px;font-weight:600" id="group-label">Grupo de medición</span>
                    <div class="segmented" role="group" aria-labelledby="group-label">
                        <button data-group="A" aria-pressed="${group === 'A'}">Grupo A · con reloj</button>
                        <button data-group="B" aria-pressed="${group === 'B'}">Grupo B · control</button>
                    </div>
                </div>
            </section>
        </div>`;

    $('#profile').querySelectorAll('[data-group]').forEach((b) => b.addEventListener('click', () => {
        try { localStorage.setItem(`skillup-group-${e.id}`, b.dataset.group); } catch (err) { /* sin almacenamiento */ }
        renderProfile();
    }));
}

// ---------- init ----------
document.addEventListener('DOMContentLoaded', () => {
    if (!DATA) {
        document.querySelector('main').innerHTML = '<p class="empty">Falta data.js. Ejecuta: python scripts/10_build_restaurant_ui_data.py</p>';
        return;
    }
    initNavigation();
    renderToday();
    renderPlanner();
    initBreweryForm();
    renderTeam();
    $('#confirm-day').addEventListener('click', (ev) => { ev.target.textContent = 'Dotación confirmada'; ev.target.disabled = true; });
    $('#publish-week').addEventListener('click', (ev) => { ev.target.textContent = 'Turnos publicados'; ev.target.disabled = true; });
});
