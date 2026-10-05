/* Finance for Life — connects the Stitch UI to the FastAPI backend.
 * Served same-origin from /ui/, so the API base is just "". */
(function () {
  const BASE = '';
  // Generic currency formatting (no region-specific/Swiss formatting).
  const CURRENCY = '$';
  const fmtNum = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function req(path, opts = {}) {
    const r = await fetch(BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (!r.ok) {
      let detail = r.statusText;
      try { detail = (await r.json()).detail || detail; } catch (_) {}
      throw new Error(detail);
    }
    return r.status === 204 ? null : r.json();
  }

  const api = {
    createParent: (email, password) => req('/parents', { method: 'POST', body: JSON.stringify({ email, password }) }),
    login: (email, password) => req('/parents/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    consent: (pid) => req(`/parents/${pid}/consent`, { method: 'POST' }),
    createChild: (pid, name) => req(`/parents/${pid}/children`, { method: 'POST', body: JSON.stringify({ display_name: name }) }),
    getSettings: (cid) => req(`/children/${cid}/settings`),
    updateSettings: (cid, settings) => req(`/children/${cid}/settings`, { method: 'PUT', body: JSON.stringify(settings) }),
    getStats: (cid) => req(`/children/${cid}/stats`),
    registerActivity: (cid) => req(`/children/${cid}/activity`, { method: 'POST' }),
    getWallet: (cid) => req(`/children/${cid}/wallet`),
    grant: (cid, amount) => req(`/demo/grant?child_id=${cid}&amount=${amount}`, { method: 'POST' }),
    listLessons: () => req('/lessons'),
    getLesson: (id) => req(`/lessons/${id}`),
    completeLesson: (id, cid) => req(`/lessons/${id}/complete?child_id=${cid}`, { method: 'POST' }),
    listProgress: (cid) => req(`/children/${cid}/progress`),
    submitSlideQuiz: (slideId, cid, answers) => req(`/slides/${slideId}/quiz`, { method: 'POST', body: JSON.stringify({ child_id: cid, answers }) }),
    listAssets: () => req('/market/assets'),
    tick: () => req('/market/tick', { method: 'POST' }),
    assetHistory: (aid, limit) => req(`/market/assets/${aid}/history${limit ? `?limit=${limit}` : ''}`),
    getPortfolio: (cid) => req(`/children/${cid}/portfolio`),
    buy: (cid, aid, shares) => req('/market/buy', { method: 'POST', body: JSON.stringify({ child_id: cid, asset_id: aid, shares }) }),
    sell: (cid, aid, shares) => req('/market/sell', { method: 'POST', body: JSON.stringify({ child_id: cid, asset_id: aid, shares }) }),
    listGoals: (cid) => req(`/children/${cid}/goals`),
    createGoal: (cid, name, target) => req(`/children/${cid}/goals`, { method: 'POST', body: JSON.stringify({ name, target_amount: target }) }),
    depositGoal: (gid, amount) => req(`/goals/${gid}/deposit`, { method: 'POST', body: JSON.stringify({ amount }) }),
    deleteGoal: (gid) => req(`/goals/${gid}`, { method: 'DELETE' }),
  };

  // Require a logged-in child session. If none exists, send the user to the
  // branded login page instead of silently creating an anonymous demo child.
  function currentChild() {
    try { return JSON.parse(localStorage.getItem('f4l_child') || 'null'); } catch (_) { return null; }
  }

  function ensureChild() {
    const child = currentChild();
    if (child && child.id) return child.id;
    // Legacy fallback: an older session only stored the id.
    const legacy = localStorage.getItem('f4l_child_id');
    if (legacy) return parseInt(legacy, 10);
    window.location.href = 'login.html';
    throw new Error('Not logged in — redirecting to login.');
  }

  function logout() {
    localStorage.removeItem('f4l_child');
    localStorage.removeItem('f4l_child_id');
    window.location.href = 'login.html';
  }

  // Reflect the logged-in child in the header (name + logout), and add a
  // Settings link to the top nav. Injected so we don't edit every page.
  function enhanceHeader() {
    const child = currentChild();
    const name = child && child.display_name ? child.display_name : null;
    const firstName = name ? name.split(' ')[0] : null;

    // Profile name.
    const nameEl = document.querySelector('header .flex-col > span.leading-none');
    if (nameEl && name) nameEl.textContent = name;

    // Replace hardcoded "Julian" placeholders in greetings/headings with the
    // logged-in child's name (hero banner, welcome text, etc.).
    if (firstName) {
      document.querySelectorAll('h1, h2, h3, p, span').forEach((el) => {
        if (el.children.length === 0 && /\bJulian\b/.test(el.textContent)) {
          el.textContent = el.textContent.replace(/Julian(\s+M\.?)?/g, firstName);
        }
      });
    }

    // Turn the avatar/profile chip into a logout button.
    const profile = document.querySelector('header .rounded-full.bg-surface-container-lowest');
    if (profile && !profile.dataset.f4lLogout) {
      profile.dataset.f4lLogout = '1';
      profile.style.cursor = 'pointer';
      profile.title = 'Log out';
      profile.addEventListener('click', () => { if (confirm('Log out of Finance for Life?')) logout(); });
    }

    // Add a Settings link to the desktop nav if not already present.
    const nav = document.querySelector('header nav');
    if (nav && !nav.querySelector('[data-path="settings"]')) {
      const a = document.createElement('a');
      a.href = 'settings.html';
      a.dataset.path = 'settings';
      a.className = 'px-space-md py-space-xs rounded-full text-on-surface-variant font-label-md text-label-md transition-all hover:bg-surface-container-high hover:text-on-surface';
      a.textContent = 'Settings';
      nav.appendChild(a);
    }
  }

  // Update the wallet pill in the header on every page.
  function setWalletPill(coins) {
    document.querySelectorAll('header .material-symbols-outlined').forEach((icon) => {
      if (icon.textContent.trim() === 'account_balance_wallet') {
        const span = icon.nextElementSibling;
        if (span) span.textContent = `🪙 ${coins}`;
      }
    });
  }

  function money(n) { return CURRENCY + ' ' + Number(n).toFixed(2); }
  function riskOf(a) { return a.volatility < 0.02 ? 'Low' : a.volatility < 0.05 ? 'Moderate' : 'High'; }

  // Update the header streak + level/XP pills (and the streak booster card)
  // with real per-child stats. Robust to the various hardcoded placeholders.
  function updateStatsPills(stats) {
    const setSiblingText = (iconName, text) => {
      document.querySelectorAll('header .material-symbols-outlined').forEach((icon) => {
        if (icon.textContent.trim() === iconName) {
          const span = icon.nextElementSibling;
          if (span) span.textContent = text;
        }
      });
    };
    setSiblingText('local_fire_department', `${stats.streak} Day Streak`);
    setSiblingText('bolt', `Lvl ${stats.level} • ${stats.xp.toLocaleString('en-US')} XP`);

    // Streak booster card on the Learning Quests page ("12-Day On Fire!").
    document.querySelectorAll('h3, div').forEach((el) => {
      if (el.children.length === 0 && /On Fire!/.test(el.textContent)) {
        el.textContent = stats.streak > 0 ? `${stats.streak}-Day On Fire!` : 'Start your streak today!';
      }
    });
  }

  // -------------------------------------------------------------------------
  // Page: Interactive Sims (market sandbox)
  // -------------------------------------------------------------------------
  async function initSims(childId) {
    let assets = await api.listAssets();
    assets.forEach((a) => { a._delta = 0; });
    let current = assets[0];
    let currentTf = 'ALL';
    let mode = 'BUY';

    const grid = document.querySelector('.asset-card')?.parentElement;

    function deltaChip(d) {
      const up = d >= 0;
      const cls = up ? 'text-emerald-600' : 'text-error';
      return `<div class="text-xs font-bold ${cls}">${up ? '+' : ''}${d.toFixed(2)}%</div>`;
    }

    function cardHtml(a) {
      const active = a.id === current.id;
      return `<div class="asset-card p-4 rounded-DEFAULT bg-surface-container-lowest hover:bg-surface-container-high transition-all cursor-pointer shadow-sm border-2 ${active ? 'border-primary' : 'border-transparent'}" data-aid="${a.id}">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-primary-fixed text-primary flex items-center justify-center font-bold">${a.symbol.slice(0, 2)}</div>
            <div><div class="font-label-lg text-label-lg text-on-surface font-bold">${a.name}</div><div class="font-body-sm text-body-sm text-outline">${a.symbol} • ${riskOf(a)} risk</div></div>
          </div>
          <div class="text-right"><div class="font-label-md text-label-md text-on-surface">${money(a.current_price)}</div>${deltaChip(a._delta)}</div>
        </div></div>`;
    }

    function renderCards() {
      if (!grid) return;
      grid.innerHTML = assets.map(cardHtml).join('');
      grid.querySelectorAll('.asset-card').forEach((el) => {
        el.addEventListener('click', () => selectById(parseInt(el.dataset.aid, 10)));
      });
    }

    function updateHeader() {
      const t = document.getElementById('active-asset-title'); if (t) t.textContent = current.name;
      const p = document.getElementById('chart-asset-price'); if (p) p.textContent = money(current.current_price);
      const tn = document.getElementById('trade-target-name'); if (tn) tn.textContent = current.name;
      const tp = document.getElementById('trade-target-price'); if (tp) tp.textContent = money(current.current_price);
      const d = document.getElementById('chart-asset-delta');
      if (d) {
        const up = current._delta >= 0;
        d.className = `text-xs font-bold ${up ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'} px-2 py-0.5 rounded-full flex items-center`;
        d.innerHTML = `<span class="material-symbols-outlined text-[14px]">${up ? 'north_east' : 'south_east'}</span> ${up ? '+' : ''}${current._delta.toFixed(2)}% today`;
      }
    }

    function selectById(id) {
      current = assets.find((a) => a.id === id) || current;
      renderCards();
      updateHeader();
      window.calculateTrade();
      drawChart();
    }

    // Plot the real simulated price history into the SVG chart.
    async function drawChart() {
      const line = document.getElementById('chart-line');
      const area = document.getElementById('chart-area');
      const dot = document.getElementById('chart-dot');
      const tag = document.getElementById('chart-illustrative-tag');
      if (!line || !area) return;
      const limitByTf = { '1D': 2, '1W': 7, '1M': 30, '1Y': 365, 'ALL': 365 };
      const limit = limitByTf[currentTf] || 365;
      let prices = [];
      try { prices = (await api.assetHistory(current.id, limit)).prices || []; } catch (_) {}
      if (prices.length < 2) prices = [current.current_price, current.current_price];
      const W = 500, H = 200, pad = 10;
      const min = Math.min(...prices), max = Math.max(...prices);
      const span = (max - min) || 1;
      const stepX = W / (prices.length - 1);
      const pts = prices.map((p, i) => {
        const x = i * stepX;
        const y = pad + (H - 2 * pad) * (1 - (p - min) / span);
        return [x, y];
      });
      const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
      line.setAttribute('d', d);
      area.setAttribute('d', `${d} L ${W},${H} L 0,${H} Z`);
      const [lx, ly] = pts[pts.length - 1];
      if (dot) { dot.setAttribute('cx', lx); dot.setAttribute('cy', ly); }
      if (tag) tag.textContent = `High ${money(max)} • Low ${money(min)}`;
    }

    async function refreshPortfolio() {
      const [pf, wallet] = await Promise.all([api.getPortfolio(childId), api.getWallet(childId)]);
      setWalletPill(wallet.coins);
      const tot = document.getElementById('hud-total-val'); if (tot) tot.textContent = money(pf.total_value);
      const cash = document.getElementById('hud-cash-val'); if (cash) cash.textContent = money(pf.cash);
      const tbody = document.getElementById('holdings-tbody');
      if (tbody) {
        if (!pf.holdings.length) {
          tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-outline font-body-sm">No holdings yet — buy an asset to start your sandbox portfolio.</td></tr>`;
        } else {
          tbody.innerHTML = pf.holdings.map((h) => {
            const a = assets.find((x) => x.id === h.asset_id) || { name: '?', current_price: 0, symbol: '?' };
            const pl = (a.current_price - h.avg_cost) * h.shares;
            const pct = h.avg_cost ? (pl / (h.avg_cost * h.shares)) * 100 : 0;
            const up = pl >= 0;
            return `<tr class="hover:bg-surface-container-low/50 transition-colors">
              <td class="py-4 px-4 font-bold text-on-surface flex items-center gap-2.5"><span class="w-8 h-8 rounded-lg bg-primary-fixed text-primary flex items-center justify-center font-bold text-xs">${a.symbol.slice(0, 2)}</span><div><div class="font-label-md text-label-md">${a.name}</div><div class="text-[11px] text-outline font-normal">${a.symbol}</div></div></td>
              <td class="py-4 px-3 font-label-md text-on-surface">${h.shares.toFixed(2)} units</td>
              <td class="py-4 px-3 font-body-sm text-outline">${money(h.avg_cost)}</td>
              <td class="py-4 px-3 font-label-md text-on-surface">${money(a.current_price)}</td>
              <td class="py-4 px-3"><span class="inline-flex items-center px-2 py-0.5 rounded-full ${up ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'} font-label-sm text-xs font-bold">${up ? '+' : ''}${money(pl)} (${up ? '+' : ''}${pct.toFixed(1)}%)</span></td>
              <td class="py-4 px-4 text-right"><button class="text-xs font-label-sm text-primary hover:underline flex items-center justify-end gap-1 ml-auto" onclick="showExplainer('Live sandbox', 'This profit/loss is computed from the backend pretend-market after each simulated day. No real money involved!')"><span class="material-symbols-outlined text-[15px]">psychology</span> Why did this move?</button></td></tr>`;
          }).join('');
        }
      }
    }

    // Override the globals that the Stitch inline handlers call.
    window.calculateTrade = function () {
      const amt = parseFloat(document.getElementById('trade-amount-input').value) || 0;
      const shares = amt > 0 ? (amt / current.current_price).toFixed(3) : '0.000';
      const q = document.getElementById('est-shares-qty'); if (q) q.textContent = `${shares} units`;
      const dv = document.getElementById('est-dividends'); if (dv) dv.textContent = `~ ${CURRENCY} ${(amt * 0.02).toFixed(2)} / yr`;
      const rp = document.getElementById('est-risk-pill');
      if (rp) {
        const risk = riskOf(current);
        rp.textContent = `${risk} Risk`;
        rp.className = `px-2 py-0.5 rounded-full font-label-sm text-[10px] ${risk === 'Low' ? 'bg-emerald-100 text-emerald-800' : risk === 'Moderate' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`;
      }
    };
    window.setInvestAmount = function (amt) { document.getElementById('trade-amount-input').value = amt; window.calculateTrade(); };
    window.setTimeframe = function (tf, el) {
      currentTf = tf;
      document.querySelectorAll('.tf-btn').forEach((b) => { b.className = 'tf-btn px-3 py-1 rounded-full text-on-surface-variant hover:text-on-surface transition-all'; });
      if (el) el.className = 'tf-btn px-3 py-1 rounded-full bg-primary text-on-primary shadow-sm transition-all';
      drawChart();
    };
    window.setTradeMode = function (m) {
      mode = m;
      const buy = document.getElementById('trade-tab-buy'); const sell = document.getElementById('trade-tab-sell'); const act = document.getElementById('execute-trade-btn');
      if (m === 'BUY') {
        buy.className = 'py-2 rounded-full font-label-md text-label-md bg-primary text-on-primary shadow-sm transition-all';
        sell.className = 'py-2 rounded-full font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-all';
        act.innerHTML = '<span class="material-symbols-outlined text-[20px]">rocket_launch</span> EXECUTE VIRTUAL BUY';
      } else {
        sell.className = 'py-2 rounded-full font-label-md text-label-md bg-inverse-surface text-inverse-on-surface shadow-sm transition-all';
        buy.className = 'py-2 rounded-full font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-all';
        act.innerHTML = '<span class="material-symbols-outlined text-[20px]">savings</span> EXECUTE VIRTUAL SALE';
      }
    };
    window.executeVirtualTrade = async function () {
      const amt = parseFloat(document.getElementById('trade-amount-input').value) || 0;
      if (amt <= 0) return;
      const shares = amt / current.current_price;
      const btn = document.getElementById('execute-trade-btn');
      try {
        if (mode === 'BUY') await api.buy(childId, current.id, shares);
        else await api.sell(childId, current.id, shares);
        const orig = btn.innerHTML;
        btn.innerHTML = '<span class="material-symbols-outlined text-[20px]">check_circle</span> ORDER FILLED!';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
        await refreshPortfolio();
      } catch (e) {
        window.showExplainer('Order rejected', e.message);
      }
    };
    async function advance(times) {
      for (let i = 0; i < times; i++) await api.tick();
      const fresh = await api.listAssets();
      fresh.forEach((na) => {
        const old = assets.find((a) => a.id === na.id);
        na._delta = old && old.current_price ? ((na.current_price - old.current_price) / old.current_price) * 100 : 0;
      });
      assets = fresh;
      current = assets.find((a) => a.id === current.id) || assets[0];
      renderCards(); updateHeader(); await refreshPortfolio(); await drawChart();
    }
    window.adjustSimSpeed = async function (speed, el) {
      document.querySelectorAll('.sim-spd-btn').forEach((b) => { b.className = 'sim-spd-btn px-3 py-1 rounded-full text-xs font-label-md bg-surface-container-lowest text-on-surface'; });
      el.className = 'sim-spd-btn px-3 py-1 rounded-full text-xs font-label-md bg-primary text-on-primary shadow-[0_2px_0_0_#00458f]';
      await advance(speed === '100x' ? 5 : speed === '10x' ? 2 : 1);
    };
    window.triggerMarketDip = async function () {
      await advance(6);
      window.showExplainer('Simulated days advanced ⏩', 'The backend pretend-market moved forward several days. Notice how a diversified portfolio rides out the bumps — top investors never panic-sell!');
    };
    const reset = document.getElementById('quick-reset-btn');
    if (reset) reset.addEventListener('click', refreshPortfolio);

    renderCards();
    updateHeader();
    window.calculateTrade();
    await refreshPortfolio();
    await drawChart();
  }

  // -------------------------------------------------------------------------
  // Slide viewer (modal) — renders a lesson's imported slides
  // -------------------------------------------------------------------------
  function ensureSlideModal() {
    let modal = document.getElementById('f4l-slide-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'f4l-slide-modal';
    modal.className = 'hidden fixed inset-0 z-[100] flex items-center justify-center p-4 bg-inverse-surface/50 backdrop-blur-sm';
    modal.innerHTML = `
      <div class="bg-surface-container-lowest w-full max-w-3xl rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div class="flex items-center justify-between gap-space-sm p-space-md border-b border-surface-container-high">
          <div class="min-w-0">
            <div class="font-label-sm text-label-sm text-primary uppercase tracking-wider" id="f4l-slide-lesson">Lesson</div>
            <div class="font-label-sm text-[11px] text-outline" id="f4l-slide-counter">Slide 1</div>
          </div>
          <button id="f4l-slide-close" class="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-outline hover:text-on-surface shrink-0"><span class="material-symbols-outlined text-[20px]">close</span></button>
        </div>
        <div class="p-space-lg overflow-y-auto" id="f4l-slide-body">
          <h3 class="font-headline-md text-headline-md text-on-surface mb-space-sm" id="f4l-slide-title"></h3>
          <img id="f4l-slide-image" class="hidden w-full max-h-[74vh] object-contain rounded-DEFAULT bg-surface-container-low mb-space-md" alt="slide image"/>
          <p class="font-body-md text-body-md text-on-surface-variant whitespace-pre-line" id="f4l-slide-text"></p>
          <div id="f4l-slide-notes-wrap" class="hidden mt-space-md p-space-sm rounded-DEFAULT bg-surface-container-low">
            <div class="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-space-2xs">Speaker notes</div>
            <p class="font-body-sm text-body-sm text-on-surface-variant whitespace-pre-line" id="f4l-slide-notes"></p>
          </div>
        </div>
        <div class="flex items-center justify-between gap-space-sm p-space-md border-t border-surface-container-high">
          <button id="f4l-slide-prev" class="flex items-center gap-space-2xs px-space-md py-space-xs rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md transition-all"><span class="material-symbols-outlined text-[18px]">arrow_back</span> Previous</button>
          <div class="flex-1 h-2 bg-surface-container rounded-full overflow-hidden mx-space-sm"><div id="f4l-slide-progress" class="h-full bg-primary rounded-full transition-all" style="width:0%"></div></div>
          <button id="f4l-slide-quiz" class="hidden items-center gap-space-2xs px-space-md py-space-xs rounded-full bg-primary text-on-primary font-label-md text-label-md shadow-[0_3px_0_0_#00458f] active:translate-y-0.5 active:shadow-none transition-all mr-space-xs"><span class="material-symbols-outlined text-[18px]">quiz</span> Take a quiz</button>
          <button id="f4l-slide-next" class="flex items-center gap-space-2xs px-space-md py-space-xs rounded-full bg-secondary-container text-on-secondary-container font-label-md text-label-md shadow-[0_3px_0_0_#e5c519] active:translate-y-0.5 active:shadow-none transition-all">Next <span class="material-symbols-outlined text-[18px]">arrow_forward</span></button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
    modal.querySelector('#f4l-slide-close').addEventListener('click', () => modal.classList.add('hidden'));
    return modal;
  }

  async function openLesson(lessonId, childId, onChange) {
    const modal = ensureSlideModal();
    let lesson;
    try { lesson = await api.getLesson(lessonId); } catch (e) { console.warn(e); return; }
    const slides = (lesson.slides || []).slice().sort((a, b) => a.order_index - b.order_index);
    if (!slides.length) { window.showExplainer ? window.showExplainer(lesson.title, 'This lesson has no slides yet.') : alert('No slides.'); return; }
    let idx = 0;
    const passedSlides = new Set();

    const elLesson = modal.querySelector('#f4l-slide-lesson');
    const elCounter = modal.querySelector('#f4l-slide-counter');
    const elTitle = modal.querySelector('#f4l-slide-title');
    const elText = modal.querySelector('#f4l-slide-text');
    const elImg = modal.querySelector('#f4l-slide-image');
    const elNotesWrap = modal.querySelector('#f4l-slide-notes-wrap');
    const elNotes = modal.querySelector('#f4l-slide-notes');
    const elProgress = modal.querySelector('#f4l-slide-progress');
    const elPrev = modal.querySelector('#f4l-slide-prev');
    const elNext = modal.querySelector('#f4l-slide-next');
    const elQuiz = modal.querySelector('#f4l-slide-quiz');

    function render() {
      const s = slides[idx];
      elLesson.textContent = lesson.title;
      elCounter.textContent = `Slide ${idx + 1} of ${slides.length}`;
      elTitle.textContent = s.title || '';
      elTitle.classList.toggle('hidden', !s.title);
      elText.textContent = s.body || '';
      elText.classList.toggle('hidden', !s.body);
      if (s.image_path) { elImg.src = '/' + s.image_path.replace(/^\/+/, ''); elImg.classList.remove('hidden'); }
      else { elImg.classList.add('hidden'); elImg.removeAttribute('src'); }
      if (s.notes) { elNotes.textContent = s.notes; elNotesWrap.classList.remove('hidden'); }
      else { elNotesWrap.classList.add('hidden'); }
      elProgress.style.width = `${Math.round(((idx + 1) / slides.length) * 100)}%`;
      elPrev.disabled = idx === 0;
      elPrev.classList.toggle('opacity-40', idx === 0);
      const last = idx === slides.length - 1;
      elNext.innerHTML = last
        ? 'Close <span class="material-symbols-outlined text-[18px]">check_circle</span>'
        : 'Next <span class="material-symbols-outlined text-[18px]">arrow_forward</span>';
      const hasQuiz = (s.quiz || []).length > 0;
      elQuiz.classList.toggle('hidden', !hasQuiz);
      elQuiz.classList.toggle('flex', hasQuiz);
      if (hasQuiz && passedSlides.has(s.id)) {
        elQuiz.innerHTML = '<span class="material-symbols-outlined text-[18px]">task_alt</span> Quiz passed';
        elQuiz.classList.remove('bg-primary', 'text-on-primary');
        elQuiz.classList.add('bg-secondary-container', 'text-on-secondary-container');
      } else if (hasQuiz) {
        elQuiz.innerHTML = '<span class="material-symbols-outlined text-[18px]">quiz</span> Take a quiz';
        elQuiz.classList.add('bg-primary', 'text-on-primary');
        elQuiz.classList.remove('bg-secondary-container', 'text-on-secondary-container');
      }
      modal.querySelector('#f4l-slide-body').scrollTop = 0;
    }

    elQuiz.onclick = async () => {
      const s = slides[idx];
      if (!(s.quiz || []).length) return;
      const passed = await openSlideQuiz(s, childId);
      if (passed) { passedSlides.add(s.id); render(); if (typeof onChange === 'function') await onChange(); }
    };
    elPrev.onclick = () => { if (idx > 0) { idx--; render(); } };
    elNext.onclick = async () => {
      if (idx < slides.length - 1) { idx++; render(); return; }
      modal.classList.add('hidden');
      if (typeof onChange === 'function') await onChange();
    };

    render();
    modal.classList.remove('hidden');
  }

  // -------------------------------------------------------------------------
  // Slide quiz (modal) — "Take a quiz" per slide; passing drives progress
  // -------------------------------------------------------------------------
  function ensureQuizModal() {
    let modal = document.getElementById('f4l-quiz-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'f4l-quiz-modal';
    modal.className = 'hidden fixed inset-0 z-[110] flex items-center justify-center p-4 bg-inverse-surface/50 backdrop-blur-sm';
    modal.innerHTML = `
      <div class="bg-surface-container-lowest w-full max-w-lg rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div class="flex items-center justify-between gap-space-sm p-space-md border-b border-surface-container-high">
          <div class="min-w-0">
            <div class="font-label-sm text-label-sm text-primary uppercase tracking-wider">Slide Quiz</div>
            <div class="font-label-sm text-[11px] text-outline" id="f4l-quiz-progress">Question 1</div>
          </div>
          <button id="f4l-quiz-close" class="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-outline hover:text-on-surface shrink-0"><span class="material-symbols-outlined text-[20px]">close</span></button>
        </div>
        <div class="p-space-lg overflow-y-auto" id="f4l-quiz-body"></div>
        <div class="p-space-md border-t border-surface-container-high flex items-center justify-between gap-space-sm">
          <div id="f4l-quiz-feedback" class="font-body-sm text-body-sm text-on-surface-variant"></div>
          <button id="f4l-quiz-action" class="px-space-lg py-space-xs rounded-full bg-primary text-on-primary font-label-md text-label-md shadow-[0_3px_0_0_#00458f] active:translate-y-0.5 active:shadow-none transition-all">Submit</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
    modal.querySelector('#f4l-quiz-close').addEventListener('click', () => modal.classList.add('hidden'));
    return modal;
  }

  // Returns a Promise<boolean> resolving true if the slide quiz was passed.
  function openSlideQuiz(slide, childId) {
    return new Promise((resolve) => {
      const modal = ensureQuizModal();
      const body = modal.querySelector('#f4l-quiz-body');
      const action = modal.querySelector('#f4l-quiz-action');
      const feedback = modal.querySelector('#f4l-quiz-feedback');
      const progress = modal.querySelector('#f4l-quiz-progress');
      const questions = slide.quiz || [];
      const selected = {}; // question_id -> selected index
      let graded = false;

      progress.textContent = `${questions.length} question${questions.length > 1 ? 's' : ''}`;
      feedback.textContent = '';

      function render() {
        body.innerHTML = questions.map((q, qi) => `
          <div class="mb-space-lg" data-qid="${q.id}">
            <div class="font-headline-sm text-headline-sm text-on-surface mb-space-sm">${qi + 1}. ${q.prompt}</div>
            <div class="flex flex-col gap-space-xs">
              ${q.options.map((opt, oi) => `
                <button class="f4l-opt text-left w-full p-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container-high transition-all font-body-md text-body-md text-on-surface flex items-center justify-between" data-qid="${q.id}" data-oi="${oi}">
                  <span>${opt}</span>
                  <span class="f4l-opt-icon material-symbols-outlined text-[18px] opacity-0">check</span>
                </button>`).join('')}
            </div>
          </div>`).join('');
        body.querySelectorAll('.f4l-opt').forEach((btn) => {
          btn.addEventListener('click', () => {
            if (graded) return;
            const qid = parseInt(btn.dataset.qid, 10);
            const oi = parseInt(btn.dataset.oi, 10);
            selected[qid] = oi;
            body.querySelectorAll(`.f4l-opt[data-qid="${qid}"]`).forEach((b) => {
              const on = b === btn;
              b.classList.toggle('bg-primary', on);
              b.classList.toggle('text-on-primary', on);
              b.classList.toggle('bg-surface-container-low', !on);
              b.querySelector('.f4l-opt-icon').classList.toggle('opacity-0', !on);
            });
          });
        });
      }

      async function grade() {
        const answers = questions.map((q) => ({ question_id: q.id, selected_index: selected[q.id] ?? -1 }));
        let res;
        try { res = await api.submitSlideQuiz(slide.id, childId, answers); }
        catch (e) { feedback.textContent = e.message; return; }
        graded = true;
        // Mark each option correct/incorrect.
        const byQid = {};
        res.results.forEach((r) => { byQid[r.question_id] = r; });
        body.querySelectorAll('.f4l-opt').forEach((b) => {
          const qid = parseInt(b.dataset.qid, 10);
          const oi = parseInt(b.dataset.oi, 10);
          const r = byQid[qid];
          if (!r) return;
          if (oi === r.correct_index) { b.classList.add('bg-primary', 'text-on-primary'); b.querySelector('.f4l-opt-icon').textContent = 'check_circle'; b.querySelector('.f4l-opt-icon').classList.remove('opacity-0'); }
          else if (selected[qid] === oi) { b.classList.add('bg-error-container', 'text-on-error-container'); b.querySelector('.f4l-opt-icon').textContent = 'cancel'; b.querySelector('.f4l-opt-icon').classList.remove('opacity-0'); }
          b.disabled = true;
        });
        if (res.passed) {
          feedback.innerHTML = `<span class="text-primary font-bold">Passed!</span> ${res.coins_awarded > 0 ? '+' + res.coins_awarded + ' coins' : ''}`;
          if (typeof res.coins === 'number') setWalletPill(res.coins);
          action.textContent = 'Done';
          action.onclick = () => { modal.classList.add('hidden'); resolve(true); };
        } else {
          feedback.innerHTML = `<span class="text-error font-bold">${res.correct}/${res.total} correct.</span> Review the slide and try again.`;
          action.textContent = 'Try again';
          action.onclick = () => { graded = false; Object.keys(selected).forEach((k) => delete selected[k]); feedback.textContent = ''; action.textContent = 'Submit'; action.onclick = submit; render(); };
        }
      }

      function submit() {
        if (Object.keys(selected).length < questions.length) { feedback.textContent = 'Answer every question first.'; return; }
        grade();
      }

      action.textContent = 'Submit';
      action.onclick = submit;
      modal.querySelector('#f4l-quiz-close').onclick = () => { modal.classList.add('hidden'); resolve(false); };
      render();
      modal.classList.remove('hidden');
    });
  }

  // -------------------------------------------------------------------------
  // Page: Learning Quests
  // -------------------------------------------------------------------------
  async function initDeckCard(lessonMeta, childId, onQuizPass) {
    const card = document.getElementById('f4l-deck-card');
    if (!card) return;
    let lesson;
    try { lesson = await api.getLesson(lessonMeta.id); } catch (e) { console.warn(e); return; }
    const slides = (lesson.slides || []).slice().sort((a, b) => a.order_index - b.order_index);
    if (!slides.length) return;

    card.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-space-sm pb-space-xs">
        <div class="flex items-center gap-space-xs min-w-0">
          <span id="f4l-deck-counter" class="px-space-sm py-space-2xs rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm shrink-0">Slide 1 of ${slides.length}</span>
          <span class="font-label-md text-label-md text-on-surface-variant hidden sm:inline">•</span>
          <span class="font-label-md text-label-md text-on-surface-variant truncate">${lesson.title}</span>
        </div>
      </div>
      <div class="relative bg-surface-container-low rounded-lg p-space-sm sm:p-space-md overflow-hidden flex items-center justify-center min-h-[320px]">
        <img id="f4l-deck-image" class="hidden w-full max-h-[70vh] object-contain rounded-DEFAULT" alt="slide"/>
        <div id="f4l-deck-textwrap" class="hidden w-full">
          <h3 id="f4l-deck-title" class="font-headline-md text-headline-md text-on-surface mb-space-sm"></h3>
          <p id="f4l-deck-text" class="font-body-md text-body-md text-on-surface-variant whitespace-pre-line"></p>
        </div>
      </div>
      <div class="w-full h-2 bg-surface-container rounded-full overflow-hidden">
        <div id="f4l-deck-progress" class="h-full bg-primary rounded-full transition-all" style="width:0%"></div>
      </div>
      <div class="flex items-center justify-between gap-space-md pt-space-xs">
        <button id="f4l-deck-prev" class="flex items-center justify-center gap-space-2xs px-space-md py-space-xs rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md transition-all"><span class="material-symbols-outlined text-[18px]">arrow_back</span> Previous Slide</button>
        <div class="flex items-center gap-space-xs">
          <button id="f4l-deck-quiz" class="hidden items-center justify-center gap-space-2xs px-space-md py-space-xs rounded-full bg-primary text-on-primary font-label-md text-label-md shadow-[0_3px_0_0_#00458f] active:translate-y-0.5 active:shadow-none transition-all"><span class="material-symbols-outlined text-[18px]">quiz</span> Take a quiz</button>
          <button id="f4l-deck-next" class="flex items-center justify-center gap-space-2xs px-space-lg py-space-xs rounded-full bg-secondary-container text-on-secondary-container font-label-lg text-label-lg shadow-[0_4px_0_0_#e5c519] active:translate-y-1 active:shadow-none transition-transform">Next Slide <span class="material-symbols-outlined text-[20px]">arrow_forward</span></button>
        </div>
      </div>`;

    const elCounter = card.querySelector('#f4l-deck-counter');
    const elImg = card.querySelector('#f4l-deck-image');
    const elTextWrap = card.querySelector('#f4l-deck-textwrap');
    const elTitle = card.querySelector('#f4l-deck-title');
    const elText = card.querySelector('#f4l-deck-text');
    const elProgress = card.querySelector('#f4l-deck-progress');
    const elPrev = card.querySelector('#f4l-deck-prev');
    const elNext = card.querySelector('#f4l-deck-next');
    const elQuiz = card.querySelector('#f4l-deck-quiz');
    const passedSlides = new Set();
    let idx = 0;

    function render() {
      const s = slides[idx];
      elCounter.textContent = `Slide ${idx + 1} of ${slides.length}`;
      if (s.image_path) {
        elImg.src = '/' + s.image_path.replace(/^\/+/, '');
        elImg.classList.remove('hidden');
        elTextWrap.classList.add('hidden');
      } else {
        elImg.classList.add('hidden'); elImg.removeAttribute('src');
        elTitle.textContent = s.title || lesson.title;
        elText.textContent = s.body || '';
        elTextWrap.classList.remove('hidden');
      }
      elProgress.style.width = `${Math.round(((idx + 1) / slides.length) * 100)}%`;
      elPrev.disabled = idx === 0;
      elPrev.classList.toggle('opacity-40', idx === 0);
      const last = idx === slides.length - 1;
      elNext.innerHTML = last
        ? 'Finish <span class="material-symbols-outlined text-[20px]">check_circle</span>'
        : 'Next Slide <span class="material-symbols-outlined text-[20px]">arrow_forward</span>';
      // Show the quiz button only when this slide has a quiz.
      const hasQuiz = (s.quiz || []).length > 0;
      elQuiz.classList.toggle('hidden', !hasQuiz);
      elQuiz.classList.toggle('flex', hasQuiz);
      if (hasQuiz && passedSlides.has(s.id)) {
        elQuiz.innerHTML = '<span class="material-symbols-outlined text-[18px]">task_alt</span> Quiz passed';
        elQuiz.classList.remove('bg-primary', 'text-on-primary');
        elQuiz.classList.add('bg-secondary-container', 'text-on-secondary-container');
      } else if (hasQuiz) {
        elQuiz.innerHTML = '<span class="material-symbols-outlined text-[18px]">quiz</span> Take a quiz';
        elQuiz.classList.add('bg-primary', 'text-on-primary');
        elQuiz.classList.remove('bg-secondary-container', 'text-on-secondary-container');
      }
    }

    elQuiz.onclick = async () => {
      const s = slides[idx];
      if (!(s.quiz || []).length) return;
      const passed = await openSlideQuiz(s, childId);
      if (passed) { passedSlides.add(s.id); render(); if (typeof onQuizPass === 'function') await onQuizPass(); }
    };

    elPrev.onclick = () => { if (idx > 0) { idx--; render(); } };
    elNext.onclick = async () => {
      if (idx < slides.length - 1) { idx++; render(); return; }
      // Reaching the end just closes the loop; progress is driven by quizzes.
      idx = 0; render();
    };

    render();
  }

  async function initQuest(childId) {
    const wallet = await api.getWallet(childId);
    setWalletPill(wallet.coins);

    let lessons = [];
    try { lessons = await api.listLessons(); } catch (_) {}

    // Replace the static "Simulation Sandbox" infographic card with a live
    // inline viewer of the first imported lesson's real slides.
    if (lessons.length) await initDeckCard(lessons[0], childId);

    // Wire the big "Take Micro-Quiz (+50 XP)" button to open the first lesson.
    const quizBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent.includes('Take Micro-Quiz')
    );
    if (quizBtn && lessons.length) {
      quizBtn.addEventListener('click', () => openLesson(lessons[0].id, childId, refreshProgress));
    }

    // Locate the quest-path list once.
    let list = null;
    const heading = Array.from(document.querySelectorAll('h2')).find(
      (h) => h.textContent.trim() === 'Your Learning Quest Path'
    );
    if (heading) {
      const card = heading.closest('.bg-surface-container-lowest') || heading.parentElement;
      list = card ? card.querySelector('.flex.flex-col.gap-space-sm') : null;
    }
    if (!list) list = document.querySelector('section .flex.flex-col.gap-space-sm');

    // Render (and re-render) the module list from live quiz-based progress.
    async function refreshProgress() {
      if (!lessons.length || !list) return;
      let progressMap = {};
      try {
        const prog = await api.listProgress(childId);
        prog.forEach((p) => { progressMap[p.lesson_id] = p; });
      } catch (_) {}
      const currentIdx = lessons.findIndex((l) => !(progressMap[l.id] && progressMap[l.id].completed));

      list.innerHTML = lessons.map((l, i) => {
        const p = progressMap[l.id] || { completed: false, percent: 0, slides_total: 0, slides_passed: 0 };
        const done = !!p.completed;
        const isCurrent = !done && i === currentIdx;
        const pct = done ? 100 : (p.percent || (isCurrent ? 5 : 0));
        const quizInfo = p.slides_total ? `${p.slides_passed}/${p.slides_total} quizzes passed` : 'tap to view slides';
        const statusLabel = done ? 'Completed' : isCurrent ? 'In progress' : 'Not started';
        const statusPill = done
          ? '<span class="px-space-xs py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-[10px] font-bold">100% • Mastered</span>'
          : (p.percent > 0)
            ? `<span class="px-space-xs py-0.5 rounded-full bg-primary text-on-primary font-label-sm text-[10px] font-bold">${p.percent}%</span>`
            : '<span class="px-space-xs py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-[10px]">Not started</span>';
        const icon = done ? 'verified' : isCurrent ? 'hourglass_top' : 'menu_book';
        const iconWrap = done
          ? 'bg-secondary-container text-on-secondary-container shadow-[0_3px_0_0_#e5c519]'
          : isCurrent
            ? 'bg-primary text-on-primary shadow-[0_3px_0_0_#00458f]'
            : 'bg-primary-fixed text-on-primary-fixed shadow-[0_3px_0_0_#abc7ff]';
        const barColor = done ? 'bg-secondary' : 'bg-primary';
        const ctaLabel = done ? 'Review' : (p.percent > 0) ? 'Continue' : 'Start';
        return `
        <div class="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-space-sm hover:bg-surface-container transition-colors cursor-pointer" data-open="${l.id}">
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md">
            <div class="flex items-center gap-space-md">
              <div class="w-12 h-12 rounded-full ${iconWrap} flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[26px]">${icon}</span></div>
              <div>
                <div class="flex items-center gap-space-xs"><span class="font-label-sm text-label-sm text-primary font-bold">MODULE ${String(i + 1).padStart(2, '0')}</span>${statusPill}</div>
                <h4 class="font-headline-sm text-headline-sm text-on-surface">${l.title}</h4>
                <p class="font-body-sm text-body-sm text-on-surface-variant">${statusLabel} • ${quizInfo}</p>
              </div>
            </div>
            <button class="shrink-0 px-space-md py-space-xs rounded-full bg-secondary-container text-on-secondary-container font-label-md text-label-md shadow-[0_3px_0_0_#e5c519] active:translate-y-1 active:shadow-none transition-transform flex items-center gap-space-2xs" data-lid="${l.id}"><span>${ctaLabel}</span><span class="material-symbols-outlined text-[16px]">slideshow</span></button>
          </div>
          <div class="w-full h-2 bg-surface-container rounded-full overflow-hidden"><div class="h-full ${barColor} rounded-full transition-all duration-500" style="width:${pct}%"></div></div>
        </div>`;
      }).join('');

      const open = (id) => openLesson(id, childId, refreshProgress);
      list.querySelectorAll('[data-open]').forEach((row) => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('button[data-lid]')) return; // handled below
          open(parseInt(row.dataset.open, 10));
        });
      });
      list.querySelectorAll('button[data-lid]').forEach((b) => {
        b.addEventListener('click', (e) => { e.stopPropagation(); open(parseInt(b.dataset.lid, 10)); });
      });
    }

    // Live inline viewer of the first lesson; refresh bars when a quiz passes.
    if (lessons.length) await initDeckCard(lessons[0], childId, refreshProgress);
    await refreshProgress();

    // Replace the static hero "Daily Quest" banner with real lesson progress.
    async function updateHero() {
      if (!lessons.length) return;
      let prog = [];
      try { prog = await api.listProgress(childId); } catch (_) {}
      const byId = {};
      prog.forEach((p) => { byId[p.lesson_id] = p; });
      const total = lessons.length;
      const completed = lessons.filter((l) => byId[l.id] && byId[l.id].completed).length;
      let currentIdx = lessons.findIndex((l) => !(byId[l.id] && byId[l.id].completed));
      if (currentIdx < 0) currentIdx = total - 1;
      const current = lessons[currentIdx];
      const pct = total ? Math.round((completed / total) * 100) : 0;

      document.querySelectorAll('span, p').forEach((el) => {
        if (el.children.length === 0 && /Daily Quest\s*#?\d+/.test(el.textContent)) {
          el.textContent = `Daily Quest #${String(completed + 1).padStart(2, '0')}`;
        }
        if (el.children.length === 0 && /Step\s+\d+\s+of\s+\d+/.test(el.textContent)) {
          el.textContent = `Step ${Math.min(completed + 1, total)} of ${total}`;
        }
      });
      // Mission line: "Today's mission: Master <span>Lesson</span> ..."
      document.querySelectorAll('p').forEach((p) => {
        if (/Today's mission/i.test(p.textContent)) {
          const span = p.querySelector('span');
          if (span && current) span.textContent = current.title;
        }
      });
      // Hero quest-progress track (the yellow bar, starts at w-1/2).
      document.querySelectorAll('.bg-secondary-fixed.rounded-full').forEach((bar) => {
        if (bar.parentElement && /overflow-hidden/.test(bar.parentElement.className)) {
          bar.classList.remove('w-1/2');
          bar.style.width = pct + '%';
        }
      });
    }

    // Replace the static "Speed Riddle" with a real quiz question from a lesson.
    async function wireSpeedRiddle() {
      const optionsEl = document.getElementById('quiz-options');
      const feedbackEl = document.getElementById('quiz-feedback');
      if (!optionsEl) return;
      let question = null, slideId = null;
      for (const lm of lessons) {
        let lesson;
        try { lesson = await api.getLesson(lm.id); } catch (_) { continue; }
        for (const s of (lesson.slides || [])) {
          if ((s.quiz || []).length) { question = s.quiz[0]; slideId = s.id; break; }
        }
        if (question) break;
      }
      if (!question) return;

      const card = optionsEl.closest('.space-y-space-sm') || optionsEl.parentElement;
      const h3 = card ? card.querySelector('h3') : null;
      if (h3) h3.textContent = question.prompt;

      optionsEl.innerHTML = question.options.map((opt, i) => `
        <button class="quiz-option text-left w-full p-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container-high transition-all font-body-sm text-body-sm text-on-surface flex items-center justify-between" data-oi="${i}">
          <span>${opt}</span>
          <span class="status-icon material-symbols-outlined text-[18px] opacity-0">check</span>
        </button>`).join('');
      if (feedbackEl) { feedbackEl.classList.add('hidden'); feedbackEl.textContent = ''; }

      optionsEl.querySelectorAll('.quiz-option').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const oi = parseInt(btn.dataset.oi, 10);
          optionsEl.querySelectorAll('.quiz-option').forEach((b) => { b.disabled = true; });
          let res;
          try { res = await api.submitSlideQuiz(slideId, childId, [{ question_id: question.id, selected_index: oi }]); }
          catch (e) { if (feedbackEl) { feedbackEl.textContent = e.message; feedbackEl.classList.remove('hidden'); } return; }
          const r = res.results[0];
          const icon = btn.querySelector('.status-icon');
          if (r.correct) {
            btn.classList.add('bg-primary', 'text-on-primary'); btn.classList.remove('bg-surface-container-low');
            icon.textContent = 'check_circle';
          } else {
            btn.classList.add('bg-error-container', 'text-on-error-container'); btn.classList.remove('bg-surface-container-low');
            icon.textContent = 'cancel';
            const correctBtn = optionsEl.querySelector(`.quiz-option[data-oi="${r.correct_index}"]`);
            if (correctBtn) { correctBtn.classList.add('bg-primary-fixed', 'text-on-primary-fixed'); correctBtn.classList.remove('bg-surface-container-low'); }
          }
          icon.classList.remove('opacity-0');
          if (feedbackEl) {
            feedbackEl.innerHTML = r.correct
              ? `<span class="font-bold text-primary">Correct!</span> ${r.explanation || ''}`
              : `<span class="font-bold text-error">Not quite.</span> ${r.explanation || ''}`;
            feedbackEl.classList.remove('hidden');
          }
          if (typeof res.coins === 'number') setWalletPill(res.coins);
          try { updateStatsPills(await api.getStats(childId)); } catch (_) {}
        });
      });
    }

    await updateHero();
    await wireSpeedRiddle();
  }

  // -------------------------------------------------------------------------
  // Page: Savings Vault (savings goals)
  // -------------------------------------------------------------------------
  // A friendly modal for creating a savings goal (replaces browser prompts).
  function ensureGoalModal() {
    let modal = document.getElementById('f4l-goal-modal');
    if (modal) return modal;
    const ICONS = ['🎯', '🎧', '🚲', '🎮', '📱', '💻', '👟', '🎸', '🏕️', '🎟️', '📷', '🛹'];
    modal = document.createElement('div');
    modal.id = 'f4l-goal-modal';
    modal.className = 'hidden fixed inset-0 z-[120] flex items-center justify-center p-4 bg-inverse-surface/50 backdrop-blur-sm';
    modal.innerHTML = `
      <div class="bg-surface-container-lowest w-full max-w-md rounded-lg shadow-2xl flex flex-col">
        <div class="flex items-center justify-between gap-space-sm p-space-lg border-b border-surface-container-high">
          <div class="flex items-center gap-space-xs">
            <div class="w-10 h-10 rounded-full bg-primary-fixed text-primary flex items-center justify-center"><span class="material-symbols-outlined text-[22px]">savings</span></div>
            <div>
              <div class="font-headline-sm text-headline-sm text-on-surface">New savings goal</div>
              <div class="font-body-sm text-[12px] text-outline">Pick something you want to save up for.</div>
            </div>
          </div>
          <button id="f4l-goal-close" class="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-outline hover:text-on-surface shrink-0"><span class="material-symbols-outlined text-[20px]">close</span></button>
        </div>
        <div class="p-space-lg space-y-space-md">
          <div>
            <label class="font-label-sm text-label-sm text-on-surface-variant">Choose an icon</label>
            <div class="flex flex-wrap gap-space-2xs mt-space-2xs" id="f4l-goal-icons">
              ${ICONS.map((ic, i) => `<button type="button" class="f4l-goal-icon w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${i === 0 ? 'bg-primary-fixed ring-2 ring-primary' : 'bg-surface-container-low hover:bg-surface-container-high'}" data-icon="${ic}">${ic}</button>`).join('')}
            </div>
          </div>
          <div>
            <label class="font-label-sm text-label-sm text-on-surface-variant" for="f4l-goal-name">What are you saving for?</label>
            <input id="f4l-goal-name" type="text" maxlength="40" placeholder="e.g. New headphones" class="mt-space-2xs w-full h-12 px-space-sm rounded-DEFAULT bg-surface-container-lowest border-2 border-surface-container-highest focus:border-primary focus:outline-none text-on-surface font-medium" />
          </div>
          <div>
            <label class="font-label-sm text-label-sm text-on-surface-variant">Target amount (coins)</label>
            <div class="flex items-center gap-space-xs mt-space-2xs">
              ${[100, 200, 500, 1000].map((v) => `<button type="button" class="f4l-goal-preset flex-1 py-2 rounded-full bg-surface-container-low hover:bg-surface-container-high text-on-surface font-label-sm transition-all" data-val="${v}">${v}</button>`).join('')}
            </div>
            <input id="f4l-goal-target" type="number" min="10" step="10" value="200" class="mt-space-xs w-full h-12 px-space-sm rounded-DEFAULT bg-surface-container-lowest border-2 border-surface-container-highest focus:border-primary focus:outline-none text-on-surface font-bold text-lg" />
          </div>
          <p id="f4l-goal-error" class="hidden font-body-sm text-[12px] text-error"></p>
        </div>
        <div class="p-space-lg border-t border-surface-container-high flex items-center justify-end gap-space-xs">
          <button id="f4l-goal-cancel" class="px-space-md py-space-xs rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md">Cancel</button>
          <button id="f4l-goal-create" class="px-space-lg py-space-xs rounded-full bg-primary text-on-primary font-label-md text-label-md shadow-[0_3px_0_0_#00458f] active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-space-2xs"><span class="material-symbols-outlined text-[18px]">add_circle</span> Create goal</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
    modal.querySelector('#f4l-goal-close').addEventListener('click', () => modal.classList.add('hidden'));
    modal.querySelector('#f4l-goal-cancel').addEventListener('click', () => modal.classList.add('hidden'));
    // Icon picker selection.
    modal.querySelectorAll('.f4l-goal-icon').forEach((b) => {
      b.addEventListener('click', () => {
        modal.querySelectorAll('.f4l-goal-icon').forEach((x) => { x.classList.remove('bg-primary-fixed', 'ring-2', 'ring-primary'); x.classList.add('bg-surface-container-low'); });
        b.classList.add('bg-primary-fixed', 'ring-2', 'ring-primary'); b.classList.remove('bg-surface-container-low');
        modal.dataset.icon = b.dataset.icon;
      });
    });
    modal.querySelectorAll('.f4l-goal-preset').forEach((b) => {
      b.addEventListener('click', () => { modal.querySelector('#f4l-goal-target').value = b.dataset.val; });
    });
    modal.dataset.icon = ICONS[0];
    return modal;
  }

  function openGoalModal(childId, onCreated) {
    const modal = ensureGoalModal();
    const nameEl = modal.querySelector('#f4l-goal-name');
    const targetEl = modal.querySelector('#f4l-goal-target');
    const errEl = modal.querySelector('#f4l-goal-error');
    const createBtn = modal.querySelector('#f4l-goal-create');
    nameEl.value = '';
    targetEl.value = '200';
    errEl.classList.add('hidden');

    createBtn.onclick = async () => {
      const name = nameEl.value.trim();
      const target = parseInt(targetEl.value, 10);
      if (!name) { errEl.textContent = 'Please name your goal.'; errEl.classList.remove('hidden'); nameEl.focus(); return; }
      if (!target || target <= 0) { errEl.textContent = 'Enter a target amount greater than zero.'; errEl.classList.remove('hidden'); targetEl.focus(); return; }
      createBtn.disabled = true;
      try {
        const icon = modal.dataset.icon || '🎯';
        await api.createGoal(childId, `${icon} ${name}`, target);
        modal.classList.add('hidden');
        if (typeof onCreated === 'function') await onCreated();
      } catch (e) {
        errEl.textContent = e.message || 'Could not create goal.'; errEl.classList.remove('hidden');
      } finally {
        createBtn.disabled = false;
      }
    };
    modal.classList.remove('hidden');
    setTimeout(() => nameEl.focus(), 50);
  }

  async function initVault(childId) {
    const wallet = await api.getWallet(childId);
    setWalletPill(wallet.coins);

    const grid = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-4');
    const ctaCard = grid ? grid.lastElementChild : null; // keep the "New Quest" CTA

    async function render() {
      const goals = await api.listGoals(childId);
      const total = goals.reduce((s, g) => s + g.saved_amount, 0);
      const hdr = document.getElementById('headerTotalSaved');
      if (hdr) hdr.textContent = `${total.toLocaleString('en-US')} coins`;
      if (grid && ctaCard) {
        // Remove previously rendered goal cards (everything except the CTA).
        Array.from(grid.children).forEach((c) => { if (c !== ctaCard) c.remove(); });
        goals.forEach((g) => {
          const pct = Math.min(100, Math.round((g.saved_amount / g.target_amount) * 100));
          const done = g.achieved || g.saved_amount >= g.target_amount;
          const card = document.createElement('div');
          card.className = 'group relative flex flex-col justify-between rounded-lg bg-surface-container-lowest p-space-lg shadow-sm hover:shadow-md transition-all';
          card.innerHTML = `
            <div class="space-y-space-md">
              <div class="flex items-center justify-between">
                <div class="w-12 h-12 rounded-full bg-primary-fixed flex items-center justify-center text-primary text-2xl shadow-inner">${done ? '🏆' : '🎯'}</div>
                <span class="px-space-xs py-space-2xs rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm">${pct}% Reached</span>
              </div>
              <div><h3 class="font-headline-sm text-headline-sm text-on-surface mt-0.5">${g.name}</h3><p class="font-body-sm text-body-sm text-on-surface-variant mt-1">Deposit coins you earn to reach this goal.</p></div>
              <div class="space-y-space-2xs">
                <div class="flex justify-between items-baseline"><span class="font-headline-sm text-headline-sm text-on-surface font-bold">${g.saved_amount} coins</span><span class="font-body-sm text-body-sm text-on-surface-variant font-medium">Goal: ${g.target_amount}</span></div>
                <div class="w-full h-3 bg-surface-container rounded-full overflow-hidden"><div class="h-full ${done ? 'bg-secondary' : 'bg-primary'} rounded-full transition-all duration-500" style="width: ${pct}%;"></div></div>
              </div>
            </div>
            <div class="mt-space-lg pt-space-sm flex items-center justify-between gap-space-xs bg-surface-container-low p-space-xs rounded">
              ${done
                ? '<span class="flex items-center gap-1.5 text-secondary font-label-sm text-[11px] font-bold"><span class="material-symbols-outlined text-[16px]">verified</span> Goal reached!</span>'
                : `<button class="goal-deposit flex items-center gap-1 px-space-sm py-space-2xs rounded-full bg-primary text-on-primary font-label-sm text-[11px] font-bold shadow-[0_2px_0_0_#00458f] active:translate-y-0.5 active:shadow-none transition-all" data-gid="${g.id}"><span class="material-symbols-outlined text-[14px]">add_circle</span> Deposit 20</button>`}
              <button class="goal-delete text-outline hover:text-error transition-colors" data-del="${g.id}" title="Delete goal"><span class="material-symbols-outlined text-[18px]">delete</span></button>
            </div>`;
          grid.insertBefore(card, ctaCard);
        });

        // Wire each goal's Deposit button (grant demo coins, then save into the goal).
        grid.querySelectorAll('.goal-deposit').forEach((b) => {
          b.addEventListener('click', async () => {
            const gid = parseInt(b.dataset.gid, 10);
            b.disabled = true;
            try {
              await api.grant(childId, 20);
              await api.depositGoal(gid, 20);
              const w = await api.getWallet(childId); setWalletPill(w.coins);
              await render();
            } catch (e) { console.warn(e); b.disabled = false; }
          });
        });
        grid.querySelectorAll('.goal-delete').forEach((b) => {
          b.addEventListener('click', async () => {
            const gid = parseInt(b.dataset.del, 10);
            try { await api.deleteGoal(gid); await render(); } catch (e) { console.warn(e); }
          });
        });
      }
    }

    // Wire the "Set New Target" CTA to create a new goal.
    if (ctaCard) {
      const ctaBtn = ctaCard.querySelector('button');
      if (ctaBtn) {
        ctaBtn.addEventListener('click', () => openGoalModal(childId, render));
      }
      // Make the whole CTA card clickable too.
      ctaCard.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        openGoalModal(childId, render);
      });
    }

    // Wire "Micro Deposit" to grant coins then deposit into a goal.
    const depositBtn = document.getElementById('quickDepositBtn');
    if (depositBtn) {
      const fresh = depositBtn.cloneNode(true); // drop the original demo-only listener
      depositBtn.parentNode.replaceChild(fresh, depositBtn);
      fresh.addEventListener('click', async () => {
        try {
          let goals = await api.listGoals(childId);
          if (!goals.length) goals = [await api.createGoal(childId, 'My First Goal', 200)];
          await api.grant(childId, 20); // demo: ensure coins exist
          await api.depositGoal(goals[0].id, 20);
          const w = await api.getWallet(childId); setWalletPill(w.coins);
          fresh.classList.add('bg-secondary-container', 'text-on-secondary-container');
          fresh.innerHTML = '<span class="material-symbols-outlined text-[18px]">check</span><span>+20 saved!</span>';
          setTimeout(() => { fresh.classList.remove('bg-secondary-container', 'text-on-secondary-container'); fresh.innerHTML = `<span class="material-symbols-outlined text-[18px]">add_circle</span><span>Micro Deposit (+${CURRENCY} 20)</span>`; }, 1500);
          await render();
        } catch (e) { console.warn(e); }
      });
    }

    await render();
  }

  // -------------------------------------------------------------------------
  // Boot: detect the page and wire it up.
  // -------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', async () => {
    // Pages that manage their own lifecycle (no child session required yet).
    if (document.getElementById('f4l-login-form') || document.getElementById('f4l-settings-form')) return;
    try {
      const childId = ensureChild();
      enhanceHeader();
      // Record today's visit (updates streak) and reflect real stats in the header.
      try { updateStatsPills(await api.registerActivity(childId)); } catch (_) {}
      if (document.getElementById('live-chart-svg')) await initSims(childId);
      else if (document.getElementById('quiz-options')) await initQuest(childId);
      else if (document.getElementById('headerTotalSaved')) await initVault(childId);
      else {
        const w = await api.getWallet(childId);
        setWalletPill(w.coins);
      }
    } catch (e) {
      console.warn('[Finance for Life] Backend not reachable — showing demo content.', e);
    }
  });

  window.F4L = { api, ensureChild, currentChild, logout, enhanceHeader };
})();

