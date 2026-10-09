(() => {
  'use strict';

  const STORAGE_KEY = 'comprovantes_organizer_v2';
  const STORAGE_KEY_V1 = 'comprovantes_organizer_v1';

  const TRANSFER_TYPES = ['PIX', 'TED', 'DOC', 'BOLETO', 'TEF', 'OUTRO'];
  const ALTO_VALOR_LIMITE = 5000;

  let state = {
    banks: [],
    persons: [],
    folders: [],
    receipts: [],
    filters: { bank: '', person: '', folder: '', date: '', search: '', transferType: '', agencia: '' }
  };

  const defaultColors = ['#4f46e5', '#16a34a', '#d97706', '#2563eb', '#dc2626', '#0d9488', '#9333ea', '#ca8a04'];
  let charts = {};

  // ---------- DOM refs ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ---------- Persistence ----------
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const notSaved = checkStorageNotAvailable();
      $('#storageText').textContent = notSaved ? 'Aviso: dados não salvos' : 'Dados salvos localmente';
      $('#storageText').style.color = notSaved ? '#fbbf24' : '';
    } catch (e) {
      $('#storageText').textContent = 'LocalStorage cheio';
      $('#storageText').style.color = '#f87171';
    }
  }

  function checkStorageNotAvailable() {
    const keys = Object.keys(localStorage);
    let total = 0;
    for (const k of keys) total += (localStorage.getItem(k) || '').length;
    let test;
    try {
      test = localStorage.getItem('__test__');
      localStorage.setItem('__test__', 'x');
      localStorage.removeItem('__test__');
    } catch (e) {
      return true;
    }
    return total > 4.5e6;
  }

  function load() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY_V1);
      if (raw) {
        const parsed = JSON.parse(raw);
        const veioDaV1 = !!localStorage.getItem(STORAGE_KEY_V1) && !localStorage.getItem(STORAGE_KEY);
        if (veioDaV1) {
          console.warn('Migrando dados da versão 1 para a versão 2');
        }
        state = { ...state, ...parsed };
        if (!Array.isArray(state.banks)) state.banks = [];
        if (!Array.isArray(state.persons)) state.persons = [];
        if (!Array.isArray(state.folders)) state.folders = [];
        if (!Array.isArray(state.receipts)) state.receipts = [];
        state.filters = { ...{ bank: '', person: '', folder: '', date: '', search: '', transferType: '', agencia: '' }, ...(state.filters || {}) };

        // Backfill novos campos de transferência
        state.receipts.forEach(r => {
          if (!r.transferType) r.transferType = deduzirTipo(r);
          if (!r.agencia) r.agencia = '';
          if (!r.agenciaDest) r.agenciaDest = '';
          if (r.watch === undefined) r.watch = false;
          if (r.watchNote === undefined) r.watchNote = '';
        });
        if (veioDaV1) {
          try { localStorage.removeItem(STORAGE_KEY_V1); } catch (e) {}
          save();
        }
      }
    } catch (e) { console.error('Falha ao carregar dados', e); }

    if (state.banks.length === 0) seedDefaults();
  }

  function deduzirTipo(r) {
    const texto = ((r.desc || '') + ' ' + (r.counterBank || '')).toLowerCase();
    if (texto.includes('pix')) return 'PIX';
    if (texto.includes('ted')) return 'TED';
    if (texto.includes('doc')) return 'DOC';
    if (texto.includes('boleto')) return 'BOLETO';
    if (texto.includes('tef')) return 'TEF';
    return 'OUTRO';
  }

  function seedDefaults() {
    state.banks = [
      { id: uid(), name: 'Nubank', color: '#820ad1' },
      { id: uid(), name: 'Itaú', color: '#ec7000' },
      { id: uid(), name: 'Bradesco', color: '#cc092f' },
      { id: uid(), name: 'Caixa', color: '#005aa5' },
      { id: uid(), name: 'Banco do Brasil', color: '#f8b500' },
      { id: uid(), name: 'Santander', color: '#ec0000' },
      { id: uid(), name: 'C6 Bank', color: '#111111' },
      { id: uid(), name: 'Inter', color: '#ff5f00' }
    ];
    state.persons = [
      { id: uid(), name: 'João', color: '#4f46e5' },
      { id: uid(), name: 'Maria', color: '#16a34a' }
    ];
    state.folders = [];
    save();
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- Helpers ----------
  function money(n) {
    return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatDate(iso) {
    if (!iso) return '-';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function getBank(id) { return state.banks.find(b => b.id === id); }
  function getPerson(id) { return state.persons.find(p => p.id === id); }
  function getFolder(id) { return state.folders.find(f => f.id === id); }

  function formatDateLong(iso) {
    if (!iso) return '-';
    const [y, m, d] = iso.split('-').map(Number);
    const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    return `${d} ${months[m-1]} ${y}`;
  }

  function transferTypeBadge(t) {
    const tipo = (t || 'OUTRO').toLowerCase();
    return `<span class="badge-transfer ${tipo}">${t || 'OUTRO'}</span>`;
  }

  function agenciaBadge(ag) {
    if (!ag) return '';
    return `<span class="badge badge-agencia">🏦 Ag ${ag}</span>`;
  }

  function isAltoValor(r) {
    return (Number(r.amount) || 0) >= ALTO_VALOR_LIMITE;
  }

  // ---------- Navigation ----------
  function setupNav() {
    $$('.nav-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    $('#mobileMenu').addEventListener('click', () => {
      $('#sidebar').classList.toggle('open');
    });
    $$('.nav-item').forEach(b => b.addEventListener('click', () => $('#sidebar').classList.remove('open')));
  }

  function switchView(view) {
    $$('.nav-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $$('.view').forEach(v => v.classList.remove('active'));
    $('#view-' + view).classList.add('active');
    const titles = {
      dashboard: 'Dashboard', comprovantes: 'Comprovantes',
      bancos: 'Bancos', pessoas: 'Pessoas', pastas: 'Pastas', monitor: 'Monitor de Transferências'
    };
    $('#viewTitle').textContent = titles[view] || 'Dashboard';
    renderByView(view);
    $('#mainContent')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }

  function renderByView(view) {
    if (view === 'dashboard') renderDashboard();
    if (view === 'comprovantes') renderComprovantes();
    if (view === 'bancos') renderBancos();
    if (view === 'pessoas') renderPessoas();
    if (view === 'pastas') renderPastas();
    if (view === 'monitor') renderMonitor();
    if (view === 'pastas' || view === 'monitor') renderOrganizeSub();
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const rec = state.receipts;
    const totalEnviado = sum(rec, 'enviado');
    const totalRecebido = sum(rec, 'recebido');
    const saldo = totalRecebido - totalEnviado;
    const count = rec.length;

    $('#dashboardStats').innerHTML = `
      <div class="stat-card green">
        <div class="stat-label">Recebido (Entrada)</div>
        <div class="stat-value">${money(totalRecebido)}</div>
        <div class="stat-sub">${rec.filter(r => r.type === 'recebido').length} comprovantes</div>
      </div>
      <div class="stat-card red">
        <div class="stat-label">Enviado (Saída)</div>
        <div class="stat-value">${money(totalEnviado)}</div>
        <div class="stat-sub">${rec.filter(r => r.type === 'enviado').length} comprovantes</div>
      </div>
      <div class="stat-card primary">
        <div class="stat-label">Saldo</div>
        <div class="stat-value">${money(saldo)}</div>
        <div class="stat-sub">${saldo >= 0 ? 'Positivo' : 'Negativo'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total de Comprovantes</div>
        <div class="stat-value">${count}</div>
        <div class="stat-sub">${state.banks.length} bancos · ${state.persons.length} pessoas</div>
      </div>
    `;

    renderYearSelect();
    renderFlowChart();
    renderDonutChart();
    renderBankSummary();
    renderPersonSummary();
    renderFolderSummary();
    renderRecent();
  }

  function sum(recs, type) {
    return recs.filter(r => r.type === type).reduce((a, r) => a + (Number(r.amount) || 0), 0);
  }

  function renderYearSelect() {
    const years = new Set(state.receipts.map(r => r.date ? Number(r.date.split('-')[0]) : null).filter(Boolean));
    const current = new Date().getFullYear();
    years.add(current);
    const sorted = [...years].sort((a, b) => b - a);
    const sel = $('#yearSelect');
    const activeYear = sel.dataset.active || current;
    sel.innerHTML = sorted.map(y => `<option value="${y}" ${y == activeYear ? 'selected' : ''}>${y}</option>`).join('');
    if (!sorted.includes(Number(sel.value))) sel.value = current > 0 ? current : sorted[0];
  }

  function getYear() {
    return Number($('#yearSelect').value || new Date().getFullYear());
  }

  function renderFlowChart() {
    const year = getYear();
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const enviado = Array(12).fill(0);
    const recebido = Array(12).fill(0);

    state.receipts.forEach(r => {
      if (!r.date) return;
      const [y, m] = r.date.split('-').map(Number);
      if (y === year) {
        if (r.type === 'enviado') enviado[m - 1] += Number(r.amount) || 0;
        else recebido[m - 1] += Number(r.amount) || 0;
      }
    });

    destroyChart('flowChart');
    const ctx = $('#flowChart');
    if (!ctx) return;
    charts.flowChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: 'Recebido', data: recebido, backgroundColor: '#16a34a', borderRadius: 4 },
          { label: 'Enviado', data: enviado, backgroundColor: '#dc2626', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top', labels: { usePointStyle: true } } },
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: '#f1f5f9' },
            ticks: { callback: (v) => 'R$' + v.toLocaleString('pt-BR', { notation: 'compact' }) }
          }
        }
      }
    });
  }

  function renderDonutChart() {
    destroyChart('donutChart');
    const ctx = $('#donutChart');
    if (!ctx) return;
    const data = state.banks.map(b => {
      const val = sum(state.receipts.filter(r => r.bankId === b.id), 'recebido')
                - sum(state.receipts.filter(r => r.bankId === b.id), 'enviado');
      return { label: b.name, value: Math.abs(val), color: b.color, dir: val >= 0 ? 'recebido' : 'enviado', val };
    }).filter(d => d.value > 0);

    if (data.length === 0) {
      ctx.width = 0; ctx.height = 0;
      $('#donutChart').parentElement.insertAdjacentHTML('beforeend', `<div class="empty-state"><div class="empty-icon">🏦</div>Sem movimentações para exibir</div>`);
      return;
    }

    charts.donutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.label),
        datasets: [{ data: data.map(d => d.value), backgroundColor: data.map(d => d.color) }]
      },
      options: {
        responsive: true,
        cutout: '62%',
        plugins: {
          legend: { position: 'right', labels: { usePointStyle: true } },
          tooltip: {
            callbacks: {
              label: (c) => `${c.label}: ${money(c.raw)}`
            }
          }
        }
      }
    });
  }

  function renderBankSummary() {
    const container = $('#bankSummary');
    const max = Math.max(...state.banks.map(b => Math.abs(
      sum(state.receipts.filter(r => r.bankId === b.id), 'recebido') -
      sum(state.receipts.filter(r => r.bankId === b.id), 'enviado')
    )), 1);
    container.innerHTML = state.banks.map(b => {
      const recebido = sum(state.receipts.filter(r => r.bankId === b.id), 'recebido');
      const enviado = sum(state.receipts.filter(r => r.bankId === b.id), 'enviado');
      const net = recebido - enviado;
      const pct = Math.round((Math.abs(net) / max) * 100);
      const color = net >= 0 ? '#16a34a' : '#dc2626';
      return `
        <div class="summary-row">
          <div class="summary-color" style="background:${b.color}"></div>
          <div class="summary-info">
            <div class="summary-name">${b.name}</div>
            <div class="summary-bar"><span style="width:${pct}%;background:${color}"></span></div>
          </div>
          <div class="summary-value" style="color:${color}">${net >= 0 ? '+' : ''}${money(net)}</div>
        </div>
      `;
    }).join('');
  }

  function renderPersonSummary() {
    const container = $('#personSummary');
    const all = state.persons.map(p => {
      const recebido = sum(state.receipts.filter(r => r.personId === p.id), 'recebido');
      const enviado = sum(state.receipts.filter(r => r.personId === p.id), 'enviado');
      const net = recebido - enviado;
      return { p, recebido, enviado, net };
    }).sort((a, b) => b.recebido + b.enviado - (a.recebido + a.enviado));

    if (all.filter(x => x.recebido + x.enviado > 0).length === 0) {
      container.innerHTML = `<div class="empty-state">Nenhum comprovante com pessoa</div>`;
      return;
    }
    const max = Math.max(...all.map(x => x.recebido + x.enviado), 1);
    container.innerHTML = all.map(({ p, recebido, enviado, net }) => {
      const pct = Math.round(((recebido + enviado) / max) * 100);
      return `
        <div class="summary-row">
          <div class="summary-color" style="background:${p.color}"></div>
          <div class="summary-info">
            <div class="summary-name">${p.name}</div>
            <div class="summary-bar"><span style="width:${pct}%;background:${p.color}"></span></div>
          </div>
          <div class="summary-value">${net >= 0 ? '<span style="color:#16a34a">+' : '<span style="color:#dc2626">'}${money(Math.abs(net))}</span></div>
        </div>
      `;
    }).join('');
  }

  function renderFolderSummary() {
    const container = $('#folderSummary');
    if (state.folders.length === 0) {
      container.innerHTML = `<div class="empty-state">Nenhuma pasta criada</div>`;
      return;
    }
    const max = Math.max(...state.folders.map(f =>
      sum(state.receipts.filter(r => r.folderId === f.id), 'recebido') +
      sum(state.receipts.filter(r => r.folderId === f.id), 'enviado')
    ), 1);
    container.innerHTML = state.folders.map(f => {
      const recebido = sum(state.receipts.filter(r => r.folderId === f.id), 'recebido');
      const enviado = sum(state.receipts.filter(r => r.folderId === f.id), 'enviado');
      const total = recebido + enviado;
      const pct = Math.round((total / max) * 100);
      return `
        <div class="summary-row">
          <div class="summary-color" style="background:#a78bfa"></div>
          <div class="summary-info">
            <div class="summary-name">📁 ${f.name}</div>
            <div class="summary-bar"><span style="width:${pct}%;background:#a78bfa"></span></div>
          </div>
          <div class="summary-value" style="font-size:12px;">${money(total)}</div>
        </div>
      `;
    }).join('');
  }

  function renderRecent() {
    const container = $('#recentReceipts');
    const recent = [...state.receipts].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6);
    if (recent.length === 0) {
      container.innerHTML = `<div class="empty-state">Nenhum comprovante ainda</div>`;
      return;
    }
    container.innerHTML = recent.map(r => {
      const p = getPerson(r.personId);
      const b = getBank(r.bankId);
      const typeLabel = r.type === 'enviado' ? 'Enviado' : 'Recebido';
      return `
        <div class="recent-item">
          <span class="badge ${r.type}">${r.type === 'enviado' ? '→' : '←'} ${typeLabel}</span>
          <div class="summary-info" style="flex:1;min-width:0">
            <div class="summary-name">${p ? p.name : 'Sem pessoa'}</div>
            <div style="font-size:11px;color:var(--text-muted)">${b ? b.name : ''} · ${formatDateLong(r.date)}</div>
          </div>
          <div class="receipt-amount ${r.type}" style="font-size:14px">${money(r.amount)}</div>
        </div>
      `;
    }).join('');
  }

  function destroyChart(name) {
    if (charts[name]) { try { charts[name].destroy(); } catch (e) {} charts[name] = null; }
    const el = $('#' + name);
    if (el) {
      const parent = el.parentElement;
      const empty = parent && parent.querySelector('.empty-state');
      if (empty) empty.remove();
    }
  }

  // ---------- Comprovantes ----------
  function populateRecipientSelects() {
    $('#fPerson').innerHTML = state.persons.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    $('#fBank').innerHTML = state.banks.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    $('#fFolder').innerHTML = `<option value="">(sem pasta)</option>` + state.folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
  }

  function renderComprovantes() {
    const list = filterReceipts();
    const container = $('#receiptsList');

    if (list.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📄</div>Nenhum comprovante encontrado.<br><button class="btn btn-primary" style="margin-top:12px" onclick="window.__openReceipt()">Adicionar comprovante</button></div>`;
      return;
    }

    container.innerHTML = list.map(r => receiptCardHTML(r)).join('');

    // event delegation on list
    container.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', e => openReceipt(e.currentTarget.dataset.edit)));
    container.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', e => deleteReceipt(e.currentTarget.dataset.del)));
    container.querySelectorAll('[data-view-img]').forEach(b => b.addEventListener('click', e => {
      const id = e.currentTarget.dataset.viewImg;
      const r = state.receipts.find(x => x.id === id);
      if (r && r.image) openImageModal(r.image, r);
    }));
  }

  function receiptCardHTML(r) {
    const p = getPerson(r.personId);
    const b = getBank(r.bankId);
    const f = getFolder(r.folderId);
    const hasImage = !!r.image;
    const transferType = r.transferType || 'OUTRO';
    return `
      <div class="receipt-card" data-id="${r.id}">
        <div class="receipt-thumb ${hasImage ? '' : 'no-image'}" data-view-img="${r.id}">
          ${hasImage ? `<img src="${r.image}" alt="comprovante">` : '📄'}
        </div>
        <div class="receipt-info">
          <div class="receipt-title">
            <span>${p ? p.name : 'Sem pessoa'}</span>
            ${transferTypeBadge(transferType)}
            <span class="badge ${r.type}">${r.type === 'enviado' ? '→ Enviado' : '← Recebido'}</span>
            ${r.watch ? '<span class="badge folder">👁️ ficar de olho</span>' : ''}
            ${f ? `<span class="badge folder">📁 ${f.name}</span>` : ''}
          </div>
          <div class="receipt-meta">
            <span class="bank">${b ? b.name : 'Sem banco'}</span>
            ${agenciaBadge(r.agencia)}
            ${r.agenciaDest ? agenciaBadge('→ ' + r.agenciaDest) : ''}
            ${r.counterBank ? `<span>→ ${r.counterBank}</span>` : ''}
            <span>${formatDate(r.date)}</span>
            ${r.desc ? `<span>${escapeHtml(r.desc)}</span>` : ''}
          </div>
        </div>
        <div class="receipt-amount ${r.type}">${r.type === 'enviado' ? '-' : '+'}${money(r.amount)}</div>
        <div class="receipt-actions">
          <button class="btn btn-secondary btn-sm" data-view-img="${r.id}">👁</button>
          <button class="btn btn-secondary btn-sm" data-edit="${r.id}">✏️</button>
          <button class="btn btn-ghost btn-sm danger" data-del="${r.id}">🗑</button>
        </div>
      </div>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function filterReceipts() {
    let list = [...state.receipts];
    const f = state.filters;
    if (f.bank) list = list.filter(r => r.bankId === f.bank);
    if (f.person) list = list.filter(r => r.personId === f.person);
    if (f.folder) list = list.filter(r => r.folderId === f.folder);
    if (f.transferType) list = list.filter(r => (r.transferType || 'OUTRO') === f.transferType);
    if (f.agencia) {
      const ag = String(f.agencia).toLowerCase();
      list = list.filter(r => (r.agencia || '').toLowerCase().includes(ag) || (r.agenciaDest || '').toLowerCase().includes(ag));
    }
    if (f.search) {
      const q = f.search.toLowerCase();
      list = list.filter(r => {
        const p = getPerson(r.personId);
        const b = getBank(r.bankId);
        const fld = getFolder(r.folderId);
        return (p && p.name.toLowerCase().includes(q)) ||
               (b && b.name.toLowerCase().includes(q)) ||
               (r.counterBank || '').toLowerCase().includes(q) ||
               (r.desc || '').toLowerCase().includes(q) ||
               (r.agencia || '').toLowerCase().includes(q) ||
               (r.agenciaDest || '').toLowerCase().includes(q) ||
               (r.watchNote || '').toLowerCase().includes(q);
      });
    }
    if (f.date) {
      const now = new Date();
      list = list.filter(r => {
        if (!r.date) return false;
        const d = new Date(r.date + 'T00:00:00');
        if (f.date === 'today') return sameDay(d, now);
        if (f.date === 'week') return (now - d) <= 7 * 86400000 && d <= now;
        if (f.date === 'month') return (now - d) <= 30 * 86400000 && d <= now;
        if (f.date === 'year') return (now - d) <= 365 * 86400000 && d <= now;
        return true;
      });
    }
    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function setupFilters() {
    $('#searchInput').addEventListener('input', e => {
      state.filters.search = e.target.value;
      renderComprovantes();
    });
    $('#filterBank').addEventListener('change', e => { state.filters.bank = e.target.value; renderComprovantes(); });
    $('#filterPerson').addEventListener('change', e => { state.filters.person = e.target.value; renderComprovantes(); });
    $('#filterFolder').addEventListener('change', e => { state.filters.folder = e.target.value; renderComprovantes(); });
    $('#filterTransferType').addEventListener('change', e => { state.filters.transferType = e.target.value; renderComprovantes(); });
    $('#filterAgencia').addEventListener('input', e => { state.filters.agencia = e.target.value; renderComprovantes(); });
    $('#filterDate').addEventListener('change', e => { state.filters.date = e.target.value; renderComprovantes(); });
    $('#clearFilters').addEventListener('click', () => {
      state.filters = { bank: '', person: '', folder: '', date: '', search: '', transferType: '', agencia: '' };
      $('#searchInput').value = '';
      $('#filterBank').value = '';
      $('#filterPerson').value = '';
      $('#filterFolder').value = '';
      $('#filterTransferType').value = '';
      $('#filterAgencia').value = '';
      $('#filterDate').value = '';
      renderComprovantes();
    });

    $('#filterBank').innerHTML = '<option value="">Todos os bancos</option>' +
      state.banks.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    $('#filterPerson').innerHTML = '<option value="">Todas as pessoas</option>' +
      state.persons.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    $('#filterFolder').innerHTML = '<option value="">Todas as pastas</option>' +
      state.folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    $('#filterTransferType').innerHTML = '<option value="">Tipos de transferência</option>' +
      TRANSFER_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
  }

  // ---------- Receipt Modal ----------
  function openReceipt(id) {
    populateRecipientSelects();
    $('#modalTitle').textContent = id ? 'Editar Comprovante' : 'Novo Comprovante';
    $('#receiptId').value = id || '';
    $('#quickAddPerson').style.display = 'inline';
    $('#quickAddBank').style.display = 'inline';
    $('#quickAddFolder').style.display = 'inline';

    const deleteBtn = $('#deleteReceiptBtn');
    deleteBtn.hidden = !id;

    if (id) {
      const r = state.receipts.find(x => x.id === id);
      if (!r) return;
      $('#fPerson').value = r.personId || '';
      $('#fBank').value = r.bankId || '';
      $('#fType').value = r.type || 'enviado';
      $('#fTransferType').value = r.transferType || 'PIX';
      $('#fAgencia').value = r.agencia || '';
      $('#fAgenciaDest').value = r.agenciaDest || '';
      $('#fAmount').value = r.amount ?? '';
      $('#fDate').value = r.date || new Date().toISOString().split('T')[0];
      $('#fCounterBank').value = r.counterBank || '';
      $('#fFolder').value = r.folderId || '';
      $('#fDesc').value = r.desc || '';
      $('#fWatch').checked = !!r.watch;
      $('#fWatchNote').value = r.watchNote || '';
      if (r.image) {
        $('#fImageData').value = r.image;
        $('#previewImg').src = r.image;
        $('#imagePreview').hidden = false;
      } else {
        $('#fImageData').value = '';
        $('#imagePreview').hidden = true;
      }
    } else {
      $('#receiptForm').reset();
      $('#fDate').value = new Date().toISOString().split('T')[0];
      $('#fImageData').value = '';
      $('#imagePreview').hidden = true;
      deleteBtn.hidden = true;
      const lastPerson = state.receipts[state.receipts.length - 1];
      if (lastPerson && lastPerson.personId) $('#fPerson').value = lastPerson.personId;
    }

    $('#modalBackdrop').hidden = false;
  }

  function closeModal() {
    $('#modalBackdrop').hidden = true;
  }

  function handleImageInput(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Selecione uma imagem válida');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        compressImage(e.target.result, (dataUrl) => {
          $('#fImageData').value = dataUrl;
          $('#previewImg').src = dataUrl;
          $('#imagePreview').hidden = false;
        });
      } catch (err) {
        toast('Falha ao processar imagem');
      }
    };
    reader.readAsDataURL(file);
  }

  function compressImage(dataUrl, cb) {
    const img = new Image();
    img.onload = () => {
      const maxW = 900;
      let { width, height } = img;
      if (width > maxW) {
        height = Math.round(height * maxW / width);
        width = maxW;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      cb(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => cb(dataUrl);
    img.src = dataUrl;
  }

  function submitReceipt(e) {
    e.preventDefault();
    const id = $('#receiptId').value;
    const data = {
      personId: $('#fPerson').value,
      bankId: $('#fBank').value,
      type: $('#fType').value,
      transferType: $('#fTransferType').value || 'OUTRO',
      agencia: $('#fAgencia').value.trim(),
      agenciaDest: $('#fAgenciaDest').value.trim(),
      amount: parseFloat($('#fAmount').value) || 0,
      date: $('#fDate').value,
      counterBank: $('#fCounterBank').value,
      folderId: $('#fFolder').value,
      desc: $('#fDesc').value,
      watch: $('#fWatch').checked,
      watchNote: $('#fWatchNote').value.trim(),
      image: $('#fImageData').value
    };
    if (!data.personId || !data.bankId || !data.amount || !data.date) {
      toast('Preencha nome, banco, valor e data');
      return;
    }
    let isNew = false;
    if (id) {
      const idx = state.receipts.findIndex(r => r.id === id);
      if (idx !== -1) state.receipts[idx] = { ...state.receipts[idx], ...data };
      toast('Comprovante atualizado');
    } else {
      state.receipts.push({ id: uid(), ...data, createdAt: Date.now() });
      toast('Comprovante adicionado');
      isNew = true;
    }
    save();
    closeModal();
    renderByView(currentView());
    notificarTransferencia(data, isNew);
  }

  function deleteReceipt(id) {
    if (!confirm('Excluir este comprovante?')) return;
    state.receipts = state.receipts.filter(r => r.id !== id);
    save();
    renderByView(currentView());
    toast('Comprovante excluído');
  }

  function currentView() {
    return $$('.nav-item[data-view].active')[0]?.dataset.view || 'dashboard';
  }

  // ---------- Image modal ----------
  function openImageModal(src) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.style.zIndex = '400';
    backdrop.style.backgroundColor = 'rgba(0,0,0,.85)';
    backdrop.innerHTML = `
      <div style="max-width:90vw;max-height:90vh;display:flex;flex-direction:column;align-items:flex-end;gap:10px">
        <button style="background:rgba(255,255,255,.1);border:none;color:#fff;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:14px">✕ Fechar</button>
        <img src="${src}" style="max-width:90vw;max-height:80vh;border-radius:8px;object-fit:contain">
      </div>
    `;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
    backdrop.querySelector('button').addEventListener('click', () => backdrop.remove());
    document.body.appendChild(backdrop);
  }

  // ---------- Quick add ----------
  let quickMode = '';

  function openQuickAdd(kind) {
    quickMode = kind;
    const labels = {
      person: ['Nova Pessoa', 'Nome da pessoa', 'person'],
      bank: ['Novo Banco', 'Nome do banco', 'bank'],
      folder: ['Nova Pasta', 'Nome da pasta', 'folder']
    };
    const [title, label, ] = labels[kind];
    $('#quickModalTitle').textContent = title;
    $('#quickLabel').textContent = label;
    $('#quickColorField').hidden = kind === 'folder';
    $('#quickInput').value = '';
    $('#quickColor').value = kind === 'bank' ? '#4f46e5' : defaultColors[state.persons.length % defaultColors.length];
    $('#quickModalBackdrop').hidden = false;
    setTimeout(() => $('#quickInput').focus(), 50);
  }

  function saveQuickAdd() {
    const name = $('#quickInput').value.trim();
    if (!name) { toast('Preencha o nome'); return; }
    if (quickMode === 'person') {
      if (state.persons.some(p => p.name.toLowerCase() === name.toLowerCase())) { toast('Pessoa já existe'); return; }
      state.persons.push({ id: uid(), name, color: $('#quickColor').value });
    } else if (quickMode === 'bank') {
      if (state.banks.some(b => b.name.toLowerCase() === name.toLowerCase())) { toast('Banco já existe'); return; }
      state.banks.push({ id: uid(), name, color: $('#quickColor').value });
    } else if (quickMode === 'folder') {
      if (state.folders.some(f => f.name.toLowerCase() === name.toLowerCase())) { toast('Pasta já existe'); return; }
      state.folders.push({ id: uid(), name });
    }
    save();
    $('#quickModalBackdrop').hidden = true;
    populateRecipientSelects();
    refreshFilters();
    renderByView(currentView());
    toast('Adicionado');
  }

  function refreshFilters() {
    $('#filterBank').innerHTML = '<option value="">Todos os bancos</option>' +
      state.banks.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    $('#filterPerson').innerHTML = '<option value="">Todas as pessoas</option>' +
      state.persons.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    $('#filterFolder').innerHTML = '<option value="">Todas as pastas</option>' +
      state.folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    $('#filterTransferType').innerHTML = '<option value="">Tipos de transferência</option>' +
      TRANSFER_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
    $('#yearSelect').dataset.active = $('#yearSelect').value || new Date().getFullYear();
  }

  // ---------- Bancos view ----------
  function renderBancos() {
    const container = $('#bankCards');
    container.innerHTML = state.banks.map(b => {
      const recebido = sum(state.receipts.filter(r => r.bankId === b.id), 'recebido');
      const enviado = sum(state.receipts.filter(r => r.bankId === b.id), 'enviado');
      const count = state.receipts.filter(r => r.bankId === b.id).length;
      return `
        <div class="bank-card">
          <div class="bank-head">
            <span class="bank-dot" style="background:${b.color}"></span>
            ${b.name}
          </div>
          <div class="bank-stats">
            <span>🖥 Comprovantes: ${count}</span>
            <span style="color:var(--success)">Entrada: ${money(recebido)}</span>
            <span style="color:var(--danger)">Saída: ${money(enviado)}</span>
            <span>Saldo: ${money(recebido - enviado)}</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" data-filtermap="${b.id}">Ver</button>
            <button class="btn btn-ghost btn-sm" data-editbank="${b.id}">✏️</button>
            <button class="btn btn-ghost btn-sm danger" data-delbank="${b.id}">🗑</button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-editbank]').forEach(btn => btn.addEventListener('click', e => {
      const b = state.banks.find(x => x.id === e.currentTarget.dataset.editbank);
      editBank(b);
    }));
    container.querySelectorAll('[data-delbank]').forEach(btn => btn.addEventListener('click', e => deleteBank(e.currentTarget.dataset.delbank)));
    container.querySelectorAll('[data-filtermap]').forEach(btn => btn.addEventListener('click', e => {
      state.filters.bank = e.currentTarget.dataset.filtermap;
      $('#filterBank').value = state.filters.bank;
      switchView('comprovantes');
      renderComprovantes();
    }));

    const listContainer = $('#bankReceiptsList');
    const recs = filterReceipts().filter(r => state.filters.bank === '' ? true : r.bankId === state.filters.bank);
    if (recs.length === 0) {
      listContainer.innerHTML = `<div class="empty-state">Nenhuma movimentação</div>`;
      return;
    }
    renderReceiptCards(listContainer, recs);
  }

  // ---------- Pessoas view ----------
  function renderPessoas() {
    const container = $('#personCards');
    const totalRecebido = sum(state.receipts, 'recebido');
    const totalEnviado = sum(state.receipts, 'enviado');
    container.innerHTML = state.persons.map(p => {
      const recebido = sum(state.receipts.filter(r => r.personId === p.id), 'recebido');
      const enviado = sum(state.receipts.filter(r => r.personId === p.id), 'enviado');
      const count = state.receipts.filter(r => r.personId === p.id).length;
      const pctR = totalRecebido ? Math.round((recebido / totalRecebido) * 100) : 0;
      const pctE = totalEnviado ? Math.round((enviado / totalEnviado) * 100) : 0;
      return `
        <div class="person-card">
          <div class="person-head">
            <span class="bank-dot" style="background:${p.color};border-radius:50%"></span>
            ${p.name}
          </div>
          <div class="person-stats">
            <span>Comprovantes: ${count}</span>
            <span style="color:var(--success)">Recebimento: ${money(recebido)} (${pctR}%)</span>
            <span style="color:var(--danger)">Envio: ${money(enviado)} (${pctE}%)</span>
            <span>Saldo: ${money(recebido - enviado)}</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" data-filterperson="${p.id}">Ver</button>
            <button class="btn btn-ghost btn-sm" data-editperson="${p.id}">✏️</button>
            <button class="btn btn-ghost btn-sm danger" data-delperson="${p.id}">🗑</button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-editperson]').forEach(btn => btn.addEventListener('click', e => editPerson(state.persons.find(x => x.id === e.currentTarget.dataset.editperson))));
    container.querySelectorAll('[data-delperson]').forEach(btn => btn.addEventListener('click', e => deletePerson(e.currentTarget.dataset.delperson)));
    container.querySelectorAll('[data-filterperson]').forEach(btn => btn.addEventListener('click', e => {
      state.filters.person = e.currentTarget.dataset.filterperson;
      $('#filterPerson').value = state.filters.person;
      switchView('comprovantes');
      renderComprovantes();
    }));
  }

  // ---------- Pastas view ----------
  function renderPastas() {
    const container = $('#folderManager');
    if (state.folders.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📁</div>Nenhuma pasta. Crie pastas para organizar seus comprovantes.</div>`;
      return;
    }
    container.innerHTML = state.folders.map(f => {
      const recs = state.receipts.filter(r => r.folderId === f.id);
      const recebido = sum(recs, 'recebido');
      const enviado = sum(recs, 'enviado');
      return `
        <div class="folder-item">
          <div class="folder-main">
            <div class="folder-name">📁 ${f.name}</div>
            <div class="folder-count">${recs.length} comprovantes · Entrada ${money(recebido)} · Saída ${money(enviado)}</div>
          </div>
          <div class="card-actions" style="display:flex;gap:8px">
            <button class="btn btn-secondary btn-sm" data-filterfolder="${f.id}">Ver</button>
            <button class="btn btn-ghost btn-sm" data-editfolder="${f.id}">✏️</button>
            <button class="btn btn-ghost btn-sm danger" data-delfolder="${f.id}">🗑</button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-editfolder]').forEach(btn => btn.addEventListener('click', e => editFolder(state.folders.find(x => x.id === e.currentTarget.dataset.editfolder))));
    container.querySelectorAll('[data-delfolder]').forEach(btn => btn.addEventListener('click', e => deleteFolder(e.currentTarget.dataset.delfolder)));
    container.querySelectorAll('[data-filterfolder]').forEach(btn => btn.addEventListener('click', e => {
      state.filters.folder = e.currentTarget.dataset.filterfolder;
      $('#filterFolder').value = state.filters.folder;
      switchView('comprovantes');
      renderComprovantes();
    }));
  }

  // ---------- Generic render of receipt cards ----------
  function renderReceiptCards(container, list) {
    if (list.length === 0) {
      container.innerHTML = `<div class="empty-state">Nenhum comprovante</div>`;
      return;
    }
    container.innerHTML = list.map(r => receiptCardHTML(r)).join('');

    container.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', e => openReceipt(e.currentTarget.dataset.edit)));
    container.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', e => deleteReceipt(e.currentTarget.dataset.del)));
    container.querySelectorAll('[data-view-img]').forEach(b => b.addEventListener('click', e => {
      const r = state.receipts.find(x => x.id === e.currentTarget.dataset.viewImg);
      if (r && r.image) openImageModal(r.image);
    }));
  }

  // ---------- Bank CRUD ----------
  function editBank(bank) {
    openQuickAdd('bank');
    // temporarily override for edit
    quickMode = 'editbank:' + bank.id;
    $('#quickModalTitle').textContent = 'Editar Banco';
    $('#quickInput').value = bank.name;
    $('#quickColor').value = bank.color;
  }

  function deleteBank(id) {
    const b = getBank(id);
    if (!confirm(`Excluir o banco "${b.name}"? Os comprovantes vinculados ficarão sem banco.`)) return;
    state.banks = state.banks.filter(x => x.id !== id);
    state.receipts.forEach(r => { if (r.bankId === id) r.bankId = ''; });
    save();
    refreshFilters();
    renderByView(currentView());
    toast('Banco excluído');
  }

  // ---------- Person CRUD ----------
  function editPerson(person) {
    quickMode = 'editperson:' + person.id;
    $('#quickModalTitle').textContent = 'Editar Pessoa';
    $('#quickInput').value = person.name;
    $('#quickColor').value = person.color;
    $('#quickColorField').hidden = false;
    $('#quickModalBackdrop').hidden = false;
  }

  function deletePerson(id) {
    const p = getPerson(id);
    if (!confirm(`Excluir "${p.name}"? Os comprovantes vinculados ficarão sem pessoa.`)) return;
    state.persons = state.persons.filter(x => x.id !== id);
    state.receipts.forEach(r => { if (r.personId === id) r.personId = ''; });
    save();
    refreshFilters();
    renderByView(currentView());
    toast('Pessoa excluída');
  }

  // ---------- Folder CRUD ----------
  function editFolder(folder) {
    quickMode = 'editfolder:' + folder.id;
    $('#quickModalTitle').textContent = 'Renomear Pasta';
    $('#quickInput').value = folder.name;
    $('#quickColorField').hidden = true;
    $('#quickModalBackdrop').hidden = false;
  }

  function deleteFolder(id) {
    const f = getFolder(id);
    if (!confirm(`Excluir a pasta "${f.name}"? Os comprovantes perderão a pasta.`)) return;
    state.folders = state.folders.filter(x => x.id !== id);
    state.receipts.forEach(r => { if (r.folderId === id) r.folderId = ''; });
    save();
    refreshFilters();
    renderByView(currentView());
    toast('Pasta excluída');
  }

  // ---------- Quick add save handler extended ----------
  function saveQuickAdd2() {
    const name = $('#quickInput').value.trim();
    if (!name) { toast('Preencha o nome'); return; }
    if (quickMode.startsWith('edit')) {
      const [kind, id] = quickMode.split(':');
      if (kind === 'editbank') {
        const b = state.banks.find(x => x.id === id);
        if (b) { b.name = name; b.color = $('#quickColor').value; }
      } else if (kind === 'editperson') {
        const p = state.persons.find(x => x.id === id);
        if (p) { p.name = name; p.color = $('#quickColor').value; }
      } else if (kind === 'editfolder') {
        const f = state.folders.find(x => x.id === id);
        if (f) f.name = name;
      }
      toast('Atualizado');
    } else {
      saveQuickAdd();
      return;
    }
    save();
    $('#quickModalBackdrop').hidden = true;
    populateRecipientSelects();
    refreshFilters();
    renderByView(currentView());
  }

  function handleQuickSave() {
    if (quickMode.startsWith('edit')) saveQuickAdd2();
    else saveQuickAdd();
  }

  // ---------- Export / Import ----------
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `comprovantes-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup exportado');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed.receipts)) throw new Error('Formato inválido');
        state = { ...state, ...parsed };
        state.receipts.forEach(r => {
          if (!r.transferType) r.transferType = deduzirTipo(r);
          r.agencia = r.agencia || '';
          r.agenciaDest = r.agenciaDest || '';
          r.watch = !!r.watch;
          r.watchNote = r.watchNote || '';
        });
        save();
        refreshFilters();
        renderByView(currentView());
        switchView('dashboard');
        toast('Dados importados com sucesso');
      } catch (err) {
        toast('Arquivo inválido');
      }
    };
    reader.readAsText(file);
  }

  // ---------- Organização automática ----------
  function renderOrganizeSub() {
    const sub = $('#organizeSub');
    if (!sub) return;
    const semPasta = state.receipts.filter(r => !r.folderId).length;
    sub.innerHTML = `Separe seus comprovantes em pastas por <b>Tipo de transferência</b> &raquo; <b>Pessoa</b> &raquo; <b>Agência</b>. <b style="color:var(--primary)">${semPasta} comprovante(s) ainda sem pasta.</b>`;
  }

  function sugerirNomePasta(r) {
    const p = getPerson(r.personId);
    const tipo = (r.transferType || 'OUTRO').toUpperCase();
    const pessoa = p ? p.name : 'SEM_PESSOA';
    const agencia = r.agencia ? ` · Ag ${r.agencia}` : (r.agenciaDest ? ` · Ag ${r.agenciaDest}` : '');
    const folderName = `${tipo} | ${pessoa}${agencia}`;
    return folderName;
  }

  function organizarEmPastas() {
    if (state.receipts.length === 0) {
      toast('Nenhum comprovante para organizar');
      return 0;
    }
    let criadas = 0;
    let atribuidas = 0;
    const nomeParaId = {};
    state.folders.forEach(f => nomeParaId[f.name.toLowerCase()] = f.id);

    state.receipts.forEach(r => {
      const nomeSugerido = sugerirNomePasta(r);
      const key = nomeSugerido.toLowerCase();
      let folderId = nomeParaId[key];
      if (!folderId) {
        const folder = { id: uid(), name: nomeSugerido };
        state.folders.push(folder);
        nomeParaId[key] = folder.id;
        folderId = folder.id;
        criadas++;
      }
      if (r.folderId !== folderId) {
        r.folderId = folderId;
        atribuidas++;
      }
    });

    save();
    refreshFilters();
    renderByView(currentView());
    renderOrganizeSub();
    toast(`${atribuidas} comprovante(s) organizado(s) em ${criadas} pasta(s)`);
    return atribuidas;
  }

  // ---------- Monitor de Transferências ----------
  function renderMonitor() {
    const watched = $('#monWatched').checked;
    const high = $('#monHigh').checked;
    const search = $('#monSearch').checked;
    const period = $('#monPeriod').value;

    let list = [...state.receipts].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    if (period !== 'all') {
      const now = new Date();
      list = list.filter(r => {
        if (!r.date) return false;
        const d = new Date(r.date + 'T00:00:00');
        if (r.date > now.toISOString().slice(0, 10)) return true;
        if (period === 'today') return sameDay(d, now);
        if (period === 'week') return (now - d) <= 7 * 86400000;
        if (period === 'month') return (now - d) <= 30 * 86400000;
        return true;
      });
    }

    const marcados = watched ? list.filter(r => r.watch) : [];
    const altoValor = high ? list.filter(r => isAltoValor(r)) : [];
    const buscados = search ? list.filter(r => (r.desc || '').toLowerCase().includes('confirmar') || (r.transferType || '') === 'BOLETO') : [];

    const grupos = [];
    const addGrupo = (titulo, itens, cls) => {
      const unicos = [];
      const vistos = {};
      itens.forEach(r => { if (!vistos[r.id]) { vistos[r.id] = 1; unicos.push(r); } });
      if (unicos.length) grupos.push({ titulo, cls, itens: unicos });
    };
    addGrupo('👁️ Marcadas para acompanhar', marcados, 'watch');
    addGrupo('⚡ Alto valor (R$ 5.000+)', altoValor, 'high');
    addGrupo('🔍 Buscadas / boletos em aberto', buscados, 'search');

    const fora = list.filter(r => !r.watch && !isAltoValor(r) && !(r.desc || '').toLowerCase().includes('confirmar') && (r.transferType || '') !== 'BOLETO');
    const defaultGroup = [...marcados, ...altoValor, ...buscados];
    const vistos = {};
    defaultGroup.forEach(r => vistos[r.id] = 1);
    const resto = fora.filter(r => !vistos[r.id]);
    if (!high && !search && !watched) {
      grupos.length = 0;
      addGrupo('📋 Todas as transferências', list.slice(0, 20), '');
    } else {
      addGrupo('📦 Demais transferências', resto, '');
    }

    const container = $('#monitorList');
    const alertBanner = $('#monitorAlert');

    const totalMarcados = state.receipts.filter(r => r.watch).length;
    if (totalMarcados > 0) {
      alertBanner.hidden = false;
      alertBanner.innerHTML = `🔔 Você tem <b>${totalMarcados} transferência(s)</b> marcada(s) para acompanhar. Use o botão 👁️ em cada item para desmarcar quando estiver resolvida.`;
    } else {
      alertBanner.hidden = true;
    }

    if (grupos.every(g => g.itens.length === 0)) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">👁️</div>Nada para monitorar no momento.<br><span style="font-size:13px">Adicione um comprovante e marque a opção "Ficar de olho" para acompanhar.</span></div>`;
      return;
    }

    container.innerHTML = grupos.map(g => `
      ${g.itens.length ? `<div class="monitor-group-title">${g.titulo} <span class="custom-badge">${g.itens.length}</span></div>` : ''}
      ${g.itens.map(r => {
        const p = getPerson(r.personId);
        const b = getBank(r.bankId);
        const f = getFolder(r.folderId);
        const checks = [];
        if (r.watch) checks.push('<span class="badge folder">👁️ acompanhar</span>');
        if (isAltoValor(r)) checks.push('<span class="badge-transfer boleto">⚡ alto valor</span>');
        if ((r.desc || '').toLowerCase().includes('confirmar')) checks.push('<span class="tag-reason">🔍 buscar</span>');
        if ((r.transferType || '') === 'BOLETO') checks.push('<span class="tag-reason">📄 boleto em aberto</span>');
        return `
        <div class="monitor-item ${r.watch ? 'watch' : ''} ${isAltoValor(r) && !r.watch ? 'high' : ''}">
          <div class="monitor-info">
            <div class="monitor-title">
              ${transferTypeBadge(r.transferType)}
              <span>${p ? p.name : 'Sem pessoa'}</span>
              <span class="badge ${r.type}">${r.type === 'enviado' ? '→ Enviado' : '← Recebido'}</span>
            </div>
            <div class="monitor-meta">
              <span>${b ? b.name : ''}</span>
              ${agenciaBadge(r.agencia)}
              ${r.agenciaDest ? agenciaBadge('→ ' + r.agenciaDest) : ''}
              ${r.counterBank ? `<span>→ ${r.counterBank}</span>` : ''}
              <span>${formatDate(r.date)}</span>
              ${f ? `<span>📁 ${escapeHtml(f.name)}</span>` : ''}
            </div>
            ${r.watchNote ? `<div class="monitor-note">💬 ${escapeHtml(r.watchNote)}</div>` : ''}
            ${r.desc ? `<div class="monitor-note" style="font-style:normal">${escapeHtml(r.desc)}</div>` : ''}
            <div class="monitor-tags">${checks.join('')}</div>
          </div>
          <div class="monitor-amount ${isAltoValor(r) ? 'warning' : r.type === 'enviado' ? '' : ''}">${r.type === 'enviado' ? '−' : '+'}${money(r.amount)}</div>
          <div class="monitor-actions">
            ${r.watch ? `<button class="btn btn-secondary btn-sm" data-unwatch="${r.id}" title="Marcar como resolvida">✔ OK</button>` : `<button class="btn btn-secondary btn-sm" data-watch="${r.id}" title="Ficar de olho">👁️</button>`}
            ${r.image ? `<button class="btn btn-secondary btn-sm" data-view-img="${r.id}">🖼</button>` : ''}
            <button class="btn btn-secondary btn-sm" data-edit="${r.id}">✏️</button>
          </div>
        </div>`;
      }).join('')}
    `).join('');

    container.querySelectorAll('[data-watch]').forEach(b => b.addEventListener('click', e => {
      toggleWatch(e.currentTarget.dataset.watch, true);
    }));
    container.querySelectorAll('[data-unwatch]').forEach(b => b.addEventListener('click', e => {
      toggleWatch(e.currentTarget.dataset.unwatch, false);
    }));
    container.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', e => openReceipt(e.currentTarget.dataset.edit)));
    container.querySelectorAll('[data-view-img]').forEach(b => b.addEventListener('click', e => {
      const r = state.receipts.find(x => x.id === e.currentTarget.dataset.viewImg);
      if (r && r.image) openImageModal(r.image);
    }));
  }

  function toggleWatch(id, val) {
    const r = state.receipts.find(x => x.id === id);
    if (!r) return;
    r.watch = val;
    r.watchNote = val ? (r.watchNote || '') : '';
    save();
    renderMonitor();
    toast(val ? 'Transferência marcada para acompanhar' : 'Transferência resolvida ✔');
  }

  // ---------- Notificações e Puter ----------
  let puterDisponivel = false;

  function initPuter() {
    if (typeof puter !== 'undefined' && puter && puter.ui) {
      puterDisponivel = true;
      const el = $('#storageText');
      if (el && !el.contains(document.createTextNode('Puter'))) {
        el.textContent = 'Dados locais + Puter ☁️';
      }
    }
  }

  function puterNotify(titulo, corpo) {
    try {
      if (puterDisponivel && puter.ui && puter.ui.notification) {
        puter.ui.notification(titulo, corpo);
      }
    } catch (e) { console.warn('Falha na notificação Puter', e); }
  }

  function notificarTransferencia(dados, isNew) {
    const p = state.persons.find(x => x.id === dados.personId);
    const nome = p ? p.name : 'Pessoa não identificada';
    const tipo = dados.transferType || 'OUTRO';
    const valor = money(dados.amount);
    const dir = dados.type === 'enviado' ? 'enviada' : 'recebida';

    let motivo = [];
    if (dados.watch) motivo.push('marcada para acompanhar');
    if (isAltoValor(dados)) motivo.push('alto valor');
    if ((dados.desc || '').toLowerCase().includes('confirmar')) motivo.push('requer confirmação');
    const motivoTxt = motivo.length ? ' · ' + motivo.join(' · ') : '';

    if (isNew || dados.watch) {
      puterNotify(`🧾 Transferência ${tipo} ${dir}`, `${nome} — ${valor} (${formatDate(dados.date)})${motivoTxt}`);
      showBrowserNotification(`🧾 ${tipo} ${dir} para ${nome}`, `${valor}${motivoTxt ? '\n' + motivoTxt : ''}`);
    }
  }

  function showBrowserNotification(title, body) {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '🧾' });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(p => {
          if (p === 'granted') new Notification(title, { body, icon: '🧾' });
        });
      }
    } catch (e) { /* algumas plataformas restringem */ }
  }

  function backupPuter() {
    try {
      const dados = JSON.stringify(state, null, 2);
      if (puterDisponivel) {
        puter.fs.write('comprovantes-backup.json', dados, { overwrite: true }).then(
          () => toast('Backup enviado para o Puter ☁️'),
          () => toast('Não foi possível enviar para o Puter')
        );
      } else {
        const blob = new Blob([dados], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `comprovantes-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast('Backup baixado localmente');
      }
    } catch (e) {
      toast('Falha no backup');
    }
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.hidden = true, 2600);
  }

  // ---------- Init ----------
  function init() {
    load();
    setupNav();
    setupFilters();
    setupModalEvents();
    switchView('dashboard');

    $('#yearSelect').addEventListener('change', () => {
      renderFlowChart();
    });

    // Add receipt buttons
    $$('.add-receipt-btn, #topAddReceipt').forEach(b => b.addEventListener('click', () => openReceipt()));

    // bank/person/folder quick-add buttons in modal
    $('#addBankBtn').addEventListener('click', () => openQuickAdd('bank'));
    $('#addPersonBtn').addEventListener('click', () => openQuickAdd('person'));
    $('#addFolderBtn').addEventListener('click', () => openQuickAdd('folder'));

    $('#quickAddPerson').addEventListener('click', () => openQuickAdd('person'));
    $('#quickAddBank').addEventListener('click', () => openQuickAdd('bank'));
    $('#quickAddFolder').addEventListener('click', () => openQuickAdd('folder'));

    // export/import
    $('#exportBtn').addEventListener('click', exportData);
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', (e) => {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = '';
    });

    // organização automática
    if ($('#organizeBtn')) {
      $('#organizeBtn').addEventListener('click', organizarEmPastas);
    }

    // monitor
    if ($('#monitorRefresh')) {
      $('#monitorRefresh').addEventListener('click', renderMonitor);
      ['#monWatched', '#monHigh', '#monSearch'].forEach(s => $(s)?.addEventListener('change', renderMonitor));
      $('#monPeriod')?.addEventListener('change', renderMonitor);
    }

    // backup puter
    $('#backupPuterBtn')?.addEventListener('click', backupPuter);
    initPuter();

    // atualização automática do monitor a cada 15s
    setInterval(() => {
      const v = currentView();
      if (v === 'monitor') renderMonitor();
    }, 15000);

    // beforeunload save
    window.addEventListener('beforeunload', save);
  }

  function setupModalEvents() {
    $('#modalClose').addEventListener('click', closeModal);
    $('#cancelBtn').addEventListener('click', closeModal);
    $('#modalBackdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });
    $('#receiptForm').addEventListener('submit', submitReceipt);
    $('#deleteReceiptBtn').addEventListener('click', () => {
      const id = $('#receiptId').value;
      if (id) { deleteReceipt(id); closeModal(); }
    });
    $('#fImage').addEventListener('change', (e) => handleImageInput(e.target.files[0]));
    $('#removeImage').addEventListener('click', () => {
      $('#fImageData').value = '';
      $('#imagePreview').hidden = true;
      $('#fImage').value = '';
    });

    // quick modal
    $('#quickModalClose').addEventListener('click', () => $('#quickModalBackdrop').hidden = true);
    $('#quickCancel').addEventListener('click', () => $('#quickModalBackdrop').hidden = true);
    $('#quickModalBackdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) $('#quickModalBackdrop').hidden = true; });
    $('#quickSave').addEventListener('click', handleQuickSave);
    $('#quickInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickSave(); } });
  }

  // expose for inline onclick
  window.__openReceipt = () => openReceipt();

  document.addEventListener('DOMContentLoaded', init);
})();
