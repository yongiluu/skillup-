// mobile-prototype/app.js — SkillUp · Turnos restaurante (móvil)
// app.html?role=worker  → vista empleado (opcional &emp=RST_005)
// app.html?role=manager → vista jefe de turno
// Datos: window.SKILLUP_DATA (data.js, generado por scripts/10_build_restaurant_ui_data.py)

const DATA = window.SKILLUP_DATA;
const params = new URLSearchParams(window.location.search);
const IS_MANAGER = params.get('role') === 'manager';

const ROLE_LABELS = {
    garzon: 'Garzón', host: 'Host', cajero: 'Cajero', cocinero_linea: 'Cocinero de línea',
    ayudante_cocina: 'Ayudante de cocina', runner: 'Runner', copero: 'Copero', jefe_turno: 'Jefe de turno',
};
const CRITICAL_ROLES = ['garzon', 'cocinero_linea', 'jefe_turno'];
const PERIOD_NAMES = { '11_13': 'Apertura', '13_15': 'Almuerzo', '19_21': 'Cena', '21_23': 'Cierre' };
const ABSENCE_LABELS = { short_notice_personal: 'Personal, aviso corto', respiratorio: 'Respiratorio' };

const ICONS = {
    home: '<path d="M3 11l9-7 9 7v9H3z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>',
    heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
    chat: '<path d="M4 5h16v11H8l-4 4z"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21h4"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
};
const icon = (name, size = 22) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// ---------- helpers ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parseDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (iso, n) => { const d = parseDate(iso); d.setDate(d.getDate() + n); return toISO(d); };
const fmt = (iso, opts) => parseDate(iso).toLocaleDateString('es-CL', opts).replace(',', '').replace('.', '');
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const prob = (p) => (p == null ? '—' : p.toFixed(2).replace('.', ','));
const roleLabel = (r) => ROLE_LABELS[r] || r;
const periodLabel = (p) => (DATA.periods[p] || p).replace(/:00/g, '').replace('-', '–');
const periodStart = (p) => (DATA.periods[p] || p).split('-')[0];
const periodEnd = (p) => (DATA.periods[p] || p).split('-')[1];
const daysText = (n) => `${n} ${n === 1 ? 'día seguido' : 'días seguidos'}`;
const dayName = (iso) => (iso === DATA.demoDate ? 'Hoy' : capitalize(fmt(iso, { weekday: 'short', day: 'numeric' })));
const shortId = (id) => id.replace('RST_', '');

function level(p) {
    if (p >= DATA.thresholds.high) return 'high';
    if (p >= DATA.thresholds.alert) return 'warn';
    return 'ok';
}
const LEVEL_TEXT = { ok: 'Cubierto', warn: 'Alerta', high: 'Riesgo alto' };

function humanizeAction(action) {
    return String(action || '')
        .replace(/\b(\d{2})_(\d{2})\b/g, '$1–$2')
        .replace(/\b([a-z]+_[a-z]+|garzon|host|cajero|runner|copero)\b/g, (m) => (ROLE_LABELS[m] ? ROLE_LABELS[m].toLowerCase() : m));
}
function targetRole(action) {
    const m = /(?:reforzar|backup en|cobertura de)\s+([a-z_]+)/.exec(action || '');
    return m ? m[1] : null;
}
function dayFlags(iso) {
    const cal = DATA.calendar.find((c) => c.date === iso);
    const dow = parseDate(iso).getDay();
    const flags = [];
    if (cal?.holiday) flags.push('Feriado');
    if (cal?.payday) flags.push('Día de pago');
    if (dow === 5) flags.push('Viernes');
    if (dow === 6) flags.push('Fin de semana');
    return flags;
}
const isWorking = (e, date, period) => e.shifts.some((s) => s.date === date && s.period === period);
const absentToday = (id) => DATA.absencesToday.some((a) => a.id === id);
const employee = (id) => DATA.employees.find((e) => e.id === id);

// Quién puede cubrir `role` en ese servicio (mismo rol primero, luego polivalentes).
function coverCandidates(role, date, period, excludeId) {
    const allowed = DATA.roleBackups[role] || [];
    return DATA.employees
        .filter((e) => e.id !== excludeId)
        .filter((e) => e.role === role || (e.crossTrained && (allowed.includes(e.role) || e.backupRole === role)))
        .filter((e) => !isWorking(e, date, period) && !(date === DATA.demoDate && absentToday(e.id)))
        .sort((a, b) => (a.role === role ? 0 : 1) - (b.role === role ? 0 : 1) || a.consecutiveDays - b.consecutiveDays);
}

function employeeLevel(e) {
    const flags = (e.consecutiveDays >= 6 ? 1 : 0) + (e.absences90 >= 4 ? 1 : 0) + (e.bio && e.bio.fatigue >= 60 ? 1 : 0);
    return flags >= 2 ? 'high' : flags === 1 ? 'warn' : 'ok';
}

// ---------- estado ----------
const state = {
    tab: IS_MANAGER ? 'hoy' : 'turnos',
    covered: {},          // jefe: servicio → id asignado
    pickedDay: DATA.demoDate,
    changeReason: 'Estudios / exámenes',
    changeSentTo: null,
    offerAnswer: null,
};

const WORKER = (() => {
    const fromUrl = params.get('emp') && employee(params.get('emp'));
    if (fromUrl) return fromUrl;
    return DATA.employees.find((e) => e.role === 'garzon' && e.shifts.some((s) => s.date === DATA.demoDate) && e.shifts.some((s) => s.date > DATA.demoDate))
        || DATA.employees[0];
})();

// ---------- render raíz ----------
function render() {
    const screen = document.getElementById('screen');
    const views = IS_MANAGER
        ? { hoy: managerToday, semana: managerWeek, equipo: managerTeam }
        : { turnos: workerShifts, cambio: workerChange, bienestar: workerWellbeing, avisos: workerNotices };
    screen.innerHTML = views[state.tab]();
    screen.scrollTop = 0;
    renderTabbar();
    bind(screen);
}

function renderTabbar() {
    const tabs = IS_MANAGER
        ? [['hoy', 'Hoy', 'home'], ['semana', 'Semana', 'calendar'], ['equipo', 'Equipo', 'team']]
        : [['turnos', 'Turnos', 'calendar'], ['bienestar', 'Bienestar', 'heart'], ['avisos', 'Avisos', 'chat']];
    const current = state.tab === 'cambio' ? 'turnos' : state.tab;
    document.getElementById('tabbar').innerHTML = tabs.map(([key, label, ic]) =>
        `<button class="tab ${current === key ? 'active' : ''}" data-tab="${key}" ${current === key ? 'aria-current="page"' : ''}>${icon(ic)}${label}</button>`).join('');
    document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; render(); }));
}

function bind(root) {
    root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.go; render(); }));
    root.querySelectorAll('[data-cover]').forEach((b) => b.addEventListener('click', () => {
        state.covered[b.dataset.cover] = b.dataset.who; render();
    }));
    root.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { state.pickedDay = b.dataset.day; render(); }));
    root.querySelectorAll('[data-offer]').forEach((b) => b.addEventListener('click', () => { state.offerAnswer = b.dataset.offer; render(); }));
    root.querySelectorAll('input[name=motivo]').forEach((r) => r.addEventListener('change', () => { state.changeReason = r.value; }));
    root.querySelectorAll('[data-send]').forEach((b) => b.addEventListener('click', () => { state.changeSentTo = b.dataset.send; render(); }));
}

// ---------- JEFE DE TURNO ----------
function managerToday() {
    const today = DATA.demoDate;
    const services = DATA.services.filter((s) => s.date === today);
    // Más crítico: mayor nivel de riesgo y, dentro del mismo nivel, más personas faltantes.
    const rank = { high: 2, warn: 1, ok: 0 };
    const focus = [...services].sort((a, b) => rank[level(b.prob)] - rank[level(a.prob)]
        || (b.required - b.actual) - (a.required - a.actual) || b.prob - a.prob)[0];
    const role = targetRole(focus.action) || 'garzon';
    const gap = Math.max(1, focus.required - focus.actual);
    const key = `${focus.date}|${focus.period}`;
    const cands = coverCandidates(role, focus.date, focus.period).slice(0, gap);
    const flags = dayFlags(today);
    const atRisk = services.filter((s) => s.prob >= DATA.thresholds.alert).length;

    const rest = services.filter((s) => s !== focus).map((s) => `
        <div class="list-row">
            <span class="when">${periodLabel(s.period)}</span>
            <span class="what">${s.actual >= s.required ? 'Completo' : `Faltan ${s.required - s.actual}`} · ${PERIOD_NAMES[s.period]}</span>
            <span class="chip ${level(s.prob)}">${prob(s.prob)}</span>
        </div>`).join('');

    const absences = DATA.absencesToday.map((a) => {
        const e = employee(a.id);
        return `<div class="person">
            <span class="avatar">${shortId(a.id)}</span>
            <div class="text"><strong>${a.id}</strong><span>${e ? roleLabel(e.role) : ''} · ${esc(ABSENCE_LABELS[a.reason] || a.reason.replace(/_/g, ' '))} · ${String(a.hours).replace('.', ',')} h</span></div>
            ${a.shortNotice ? '<span class="chip warn">Aviso corto</span>' : ''}
        </div>`;
    }).join('') || '<p class="empty">Sin ausencias.</p>';

    const coveredBy = state.covered[key];
    return `
        <header class="hero">
            <div class="hero-top">
                <span class="hello">Hola, [Jefe de turno]</span>
                <button class="icon-btn" aria-label="Notificaciones, ${DATA.absencesToday.length} nuevas">${icon('bell', 20)}<span class="badge-dot"></span></button>
            </div>
            <h1 class="hero-title">${esc(capitalize(fmt(today, { weekday: 'long', day: 'numeric', month: 'short' })))}</h1>
            <div class="chips">
                ${atRisk >= 2 ? '<span class="chip accent">Sobredemanda</span>' : ''}
                ${flags.map((f) => `<span class="chip ghost">${f}</span>`).join('')}
            </div>
        </header>
        <div class="content">
            <section class="card" aria-labelledby="focus-h">
                <div class="card-head">
                    <h2 id="focus-h" class="card-label">Servicio más crítico</h2>
                    <span class="chip ${level(focus.prob)}">${LEVEL_TEXT[level(focus.prob)]} · ${prob(focus.prob)}</span>
                </div>
                <div class="big">${periodStart(focus.period)} – ${periodEnd(focus.period)}</div>
                <div class="kv"><span>Dotación</span><strong class="${focus.actual < focus.required ? 'short' : ''}">${focus.actual} / ${focus.required}${focus.actual < focus.required ? ` · faltan ${focus.required - focus.actual}` : ''}</strong></div>
                ${CRITICAL_ROLES.map((r) => `<div class="kv"><span>${roleLabel(r)}</span><span class="chip ${level(focus.roleProb[r])}">${prob(focus.roleProb[r])}</span></div>`).join('')}
                <p class="sub" style="margin:0">${esc(humanizeAction(focus.action))}</p>
                ${coveredBy
                    ? `<span class="chip ok" style="align-self:flex-start">Avisado a ${esc(coveredBy)}</span>`
                    : cands.length
                        ? `<button class="btn primary block" data-cover="${key}" data-who="${cands.map((c) => c.id).join(', ')}">Pedir cobertura de ${roleLabel(role).toLowerCase()}</button>
                           <p class="sub" style="margin:0;text-align:center">Sugerido: ${cands.map((c) => `${c.id} (${roleLabel(c.role).toLowerCase()})`).join(', ')}</p>`
                        : '<p class="sub" style="margin:0">Nadie libre para cubrir: ofrecer turno extra.</p>'}
            </section>
            <section class="card" aria-labelledby="rest-h" style="gap:0">
                <h2 id="rest-h" class="card-label" style="margin-bottom:4px">Resto del día</h2>
                ${rest}
            </section>
            <section class="card" aria-labelledby="abs-h" style="gap:0">
                <h2 id="abs-h" class="card-label" style="margin-bottom:4px">Ausencias de hoy · ${DATA.absencesToday.length}</h2>
                ${absences}
            </section>
        </div>`;
}

function managerWeek() {
    const days = Array.from({ length: 7 }, (_, i) => addDays(DATA.weekStart, i));
    const periods = Object.keys(DATA.periods);
    return `
        <header class="plain-head"><span class="hello">Semana</span><h1>${fmt(days[0], { day: 'numeric' })} al ${fmt(days[6], { day: 'numeric', month: 'long' })}</h1></header>
        <div class="content">
            <div class="chips">${periods.map((p) => `<span class="chip muted">${periodLabel(p)}</span>`).join('')}</div>
            ${days.map((d) => {
                const flags = dayFlags(d);
                return `<section class="card" aria-label="${esc(fmt(d, { weekday: 'long', day: 'numeric' }))}">
                    <div class="card-head">
                        <strong style="font-size:16px">${esc(dayName(d))}</strong>
                        <div class="chips">${flags.map((f) => `<span class="chip ${f === 'Día de pago' || f === 'Feriado' ? 'accent' : 'ok'}">${f}</span>`).join('')}</div>
                    </div>
                    <div class="pills">${periods.map((p) => {
                        const s = DATA.services.find((x) => x.date === d && x.period === p);
                        return s ? `<span class="pill ${level(s.prob)}" title="${periodLabel(p)}: ${s.actual}/${s.required}, prob. ${prob(s.prob)}">${s.actual}/${s.required}</span>` : '<span class="pill"></span>';
                    }).join('')}</div>
                </section>`;
            }).join('')}
            <p class="sub" style="margin:0">Cada bloque: dotación actual / requerida por servicio. Naranjo: alerta ≥ ${prob(DATA.thresholds.alert)} · rojo: alto ≥ ${prob(DATA.thresholds.high)}.</p>
        </div>`;
}

function managerTeam() {
    const watch = DATA.employees
        .map((e) => ({ e, lv: employeeLevel(e) }))
        .filter((x) => x.lv !== 'ok')
        .sort((a, b) => (a.lv === 'high' ? 0 : 1) - (b.lv === 'high' ? 0 : 1) || b.e.consecutiveDays - a.e.consecutiveDays)
        .slice(0, 10);
    return `
        <header class="plain-head"><span class="hello">Equipo · ${DATA.employees.length} personas</span><h1>A quién cuidar</h1></header>
        <div class="content">
            <section class="card" style="gap:0">
                ${watch.map(({ e, lv }) => {
                    const why = [e.consecutiveDays >= 6 ? daysText(e.consecutiveDays) : null, e.absences90 >= 4 ? `${e.absences90} ausencias en 90 días` : null, e.bio && e.bio.fatigue >= 60 ? 'fatiga alta' : null].filter(Boolean).join(' · ');
                    return `<div class="person">
                        <span class="avatar">${shortId(e.id)}</span>
                        <div class="text"><strong>${e.id} · ${roleLabel(e.role)}</strong><span>${why}</span></div>
                        <span class="chip ${lv}">${lv === 'high' ? 'Sobrecarga' : 'Atención'}</span>
                    </div>`;
                }).join('')}
            </section>
            <p class="sub" style="margin:0">Fatiga según datos simulados de reloj; se reemplaza con los relojes reales.</p>
        </div>`;
}

// ---------- EMPLEADO ----------
function workerShifts() {
    const e = WORKER;
    const upcoming = e.shifts.filter((s) => s.date >= DATA.demoDate);
    const next = upcoming[0];
    const sameDay = next ? upcoming.filter((s) => s.date === next.date) : [];
    const days = Array.from({ length: 7 }, (_, i) => addDays(DATA.weekStart, i));
    // Agrupa por servicio: el dataset puede asignar dos roles a la misma persona en un servicio.
    const picked = Object.values(e.shifts.filter((s) => s.date === state.pickedDay).reduce((acc, s) => {
        acc[s.period] = acc[s.period] ? { ...acc[s.period], role: `${acc[s.period].role} / ${s.role}` } : { ...s };
        return acc;
    }, {}));

    const offerSvc = DATA.services
        .filter((s) => s.date > DATA.demoDate && s.prob >= DATA.thresholds.alert && targetRole(s.action) === e.role && !isWorking(e, s.date, s.period))
        .sort((a, b) => b.prob - a.prob)[0];

    return `
        <header class="plain-head"><span class="hello">Hola, ${e.id} · ${roleLabel(e.role)}</span><h1>Mis turnos</h1></header>
        <div class="content">
            ${next ? `<section class="card dark" aria-labelledby="next-h">
                <h2 id="next-h" class="card-label">Tu próximo turno</h2>
                <div class="big">${esc(dayName(next.date))} · ${periodStart(next.period)}</div>
                <div class="sub">${roleLabel(next.role)} · ${[...new Set(sameDay.map((s) => periodLabel(s.period)))].join(', ')}</div>
                <div class="btn-row" style="margin-top:4px">
                    <button class="btn accent">Marcar llegada</button>
                    <button class="btn ghost" data-go="cambio">Pedir cambio</button>
                </div>
            </section>` : '<section class="card"><p class="empty">No tienes turnos esta semana.</p></section>'}

            <section class="week" aria-label="Semana">
                ${days.map((d) => {
                    const cls = [e.shifts.some((s) => s.date === d) ? 'works' : '', d === DATA.demoDate ? 'today' : '', d === state.pickedDay ? 'picked' : ''].join(' ');
                    return `<button class="${cls}" data-day="${d}" aria-pressed="${d === state.pickedDay}" aria-label="${esc(fmt(d, { weekday: 'long', day: 'numeric' }))}">
                        <span class="dow">${fmt(d, { weekday: 'narrow' })}</span><span class="n">${parseDate(d).getDate()}</span><span class="wdot"></span></button>`;
                }).join('')}
            </section>

            <section class="card" style="gap:0" aria-labelledby="day-h">
                <h2 id="day-h" class="card-label" style="margin:4px 0">${esc(capitalize(fmt(state.pickedDay, { weekday: 'long', day: 'numeric', month: 'short' })))}</h2>
                ${picked.length ? picked.map((s) => `<div class="list-row"><span class="when">${periodLabel(s.period)}</span><span class="what">${PERIOD_NAMES[s.period]}</span><span class="where">${s.role.split(' / ').map(roleLabel).join(' / ')}</span></div>`).join('') : '<div class="list-row"><span class="what">Descanso</span></div>'}
            </section>

            ${offerSvc ? `<section class="card offer" aria-labelledby="offer-h">
                <h2 id="offer-h" style="font-size:16px">Turno extra disponible</h2>
                <div class="sub" style="color:#3A4049">${esc(capitalize(fmt(offerSvc.date, { weekday: 'long', day: 'numeric', month: 'short' })))} · ${periodLabel(offerSvc.period)} · ${roleLabel(e.role)}. ${dayFlags(offerSvc.date).length ? `${dayFlags(offerSvc.date).join(', ')}: ` : ''}se espera alta demanda.</div>
                ${state.offerAnswer
                    ? `<span class="chip ${state.offerAnswer === 'si' ? 'ok' : 'muted'}" style="align-self:flex-start">${state.offerAnswer === 'si' ? 'Enviado a tu jefe de turno' : 'Rechazado'}</span>`
                    : `<div class="btn-row"><button class="btn primary" data-offer="si">Lo tomo</button><button class="btn" data-offer="no">No puedo</button></div>`}
            </section>` : ''}
        </div>`;
}

function changeTarget() {
    const upcoming = WORKER.shifts.filter((s) => s.date > DATA.demoDate);
    return upcoming[0] || WORKER.shifts.filter((s) => s.date === DATA.demoDate)[0];
}

function workerChange() {
    const shift = changeTarget();
    const back = `<header class="back-head"><button class="icon-btn" data-go="turnos" aria-label="Volver a Mis turnos">${icon('back', 20)}</button><h1>Pedir cambio</h1></header>`;
    if (!shift) return `${back}<div class="content"><p class="empty">No tienes turnos para cambiar.</p></div>`;
    const svc = DATA.services.find((s) => s.date === shift.date && s.period === shift.period);
    const cands = coverCandidates(shift.role, shift.date, shift.period, WORKER.id).slice(0, 3);
    const reasons = ['Estudios / exámenes', 'Salud', 'Personal'];

    if (state.changeSentTo) {
        return `${back}<div class="content">
            <section class="card"><span class="chip ok" style="align-self:flex-start">Solicitud enviada</span>
                <div class="big" style="font-size:24px">${esc(state.changeSentTo)} recibió tu pedido</div>
                <p class="sub" style="margin:0">Motivo: ${esc(state.changeReason)}. Tu jefe de turno debe aprobar el cambio; te avisaremos en Avisos.</p>
                <button class="btn primary block" data-go="turnos">Volver a mis turnos</button>
            </section></div>`;
    }
    return `${back}
        <div class="content">
            <section class="card" style="gap:4px">
                <span class="card-label">Turno a cambiar</span>
                <div class="big" style="font-size:22px">${esc(capitalize(fmt(shift.date, { weekday: 'short', day: 'numeric', month: 'short' })))} · ${periodStart(shift.period)} – ${periodEnd(shift.period)}</div>
                <span class="sub">${roleLabel(shift.role)} · ${PERIOD_NAMES[shift.period]}</span>
            </section>
            <fieldset class="card" style="gap:0">
                <legend class="card-label" style="float:left;width:100%">Motivo</legend>
                ${reasons.map((r) => `<label class="radio"><input type="radio" name="motivo" value="${r}" ${state.changeReason === r ? 'checked' : ''}>${r}</label>`).join('')}
            </fieldset>
            <section class="card" style="gap:0" aria-labelledby="who-h">
                <h2 id="who-h" class="card-label" style="margin-bottom:4px">Quién puede cubrirte</h2>
                ${cands.length ? cands.map((c, i) => `<div class="person">
                    <span class="avatar">${shortId(c.id)}</span>
                    <div class="text"><strong>${c.id}</strong><span>Libre ese servicio · ${c.role === shift.role ? 'mismo rol' : `${roleLabel(c.role).toLowerCase()} polivalente`} · ${daysText(c.consecutiveDays)}</span></div>
                    ${i === 0 ? '<span class="chip ok">Mejor opción</span>' : ''}
                </div>`).join('') : '<p class="empty">Nadie libre en ese servicio.</p>'}
            </section>
            ${svc && svc.prob >= DATA.thresholds.alert ? `<div class="notice">Ese servicio ya está en ${level(svc.prob) === 'high' ? 'riesgo alto' : 'alerta'} (${prob(svc.prob)}). Tu jefe de turno debe aprobar el cambio.</div>` : ''}
        </div>
        ${cands.length ? `<div class="sticky-bottom"><button class="btn primary block" data-send="${cands[0].id}">Enviar a ${cands[0].id}</button></div>` : ''}`;
}

function workerWellbeing() {
    const b = WORKER.bio;
    return `
        <header class="plain-head"><span class="hello">${WORKER.id}</span><h1>Bienestar</h1></header>
        <div class="content">
            <section class="card pending">
                <div class="card-head"><h2 style="font-size:16px">Reloj inteligente</h2><span class="chip muted">Datos simulados</span></div>
                ${b ? `<div class="bio">
                    <div class="stat">Sueño<strong>${String(b.sleep).replace('.', ',')} h</strong></div>
                    <div class="stat">Pasos<strong>${b.steps.toLocaleString('es-CL')}</strong></div>
                    <div class="stat">FC media<strong>${b.hr}</strong></div>
                </div>` : '<p class="empty">Sin datos.</p>'}
                <p class="sub" style="margin:0">Cuando lleguen los relojes verás tus datos reales. Solo tú y el equipo de bienestar los ven en detalle.</p>
            </section>
            <section class="card pending">
                <div class="card-head"><h2 style="font-size:16px">Test psicológico</h2><span class="chip muted">Pendiente</span></div>
                <p class="sub" style="margin:0">Un cuestionario corto sobre estrés y carga percibida. Tu jefe de turno solo ve un nivel agregado, nunca tus respuestas.</p>
                <button class="btn block" disabled>Disponible pronto</button>
            </section>
            <section class="card">
                <div class="kv"><span>Días seguidos trabajados</span><strong>${WORKER.consecutiveDays}</strong></div>
                <div class="kv"><span>Horas extra (7 días)</span><strong>${String(WORKER.overtimeWeek).replace('.', ',')} h</strong></div>
            </section>
        </div>`;
}

function workerNotices() {
    const items = [];
    if (state.changeSentTo) items.push(['Cambio de turno', `Pedido enviado a ${state.changeSentTo}. Esperando aprobación.`]);
    if (state.offerAnswer === 'si') items.push(['Turno extra', 'Tu jefe de turno revisará tu solicitud.']);
    DATA.peaks.slice(0, 3).forEach((p) => items.push([capitalize(fmt(p.date, { weekday: 'long', day: 'numeric', month: 'short' })), `Alta demanda prevista: ${p.reasons.join(', ').toLowerCase()}.`]));
    return `
        <header class="plain-head"><span class="hello">${WORKER.id}</span><h1>Avisos</h1></header>
        <div class="content">
            <section class="card" style="gap:0">
                ${items.map(([t, d]) => `<div class="person"><div class="text"><strong>${esc(t)}</strong><span>${esc(d)}</span></div></div>`).join('')}
            </section>
        </div>`;
}

// ---------- init ----------
document.addEventListener('DOMContentLoaded', () => {
    if (!DATA) {
        document.getElementById('screen').innerHTML = '<p class="empty" style="padding:20px">Falta data.js. Ejecuta: python scripts/10_build_restaurant_ui_data.py</p>';
        return;
    }
    render();
});
