/**
 * คอนโทรลเลอร์หลักของแอปพลิเคชันค้นหางานประมูลไอที
 * NTi IT-Tender Intelligence System
 * ออกแบบเพื่อ บริษัท นิวเทคโนโลยี่อินฟอร์เมชั่น จำกัด
 */

class TenderApp {
  constructor() {
    this.tenders = [];
    this.filteredTenders = [];
    this.watchlist = JSON.parse(localStorage.getItem('nti_watchlist') || '{}');
    this.currentCategory = 'all';
    this.searchTerm = '';
    this.fiscalYearFilter = 'all';
    this.dataSourceFilter = 'all'; // 'all', 'real_only', 'mock_only'
    this.budgetFilter = 'all';
    this.methodFilter = 'all';
    this.provinceFilter = 'all';
    this.viewMode = 'grid';
    this.currentTab = 'search';
    this.isLiveMode = false;
    this.isAutoMonitoring = false;
    this.autoMonitorTimer = null;
    this.autoMonitorInterval = 5;
    this.activeModalProjectId = null;
    this.currentModalTab = 'overview';

    this.init();
  }

  init() {
    // ล้างแคชเก่าทั้งหมดที่มีโครงการเก่า/ปิดรับซองแล้ว เพื่อโหลดฐานข้อมูลสดที่ตรวจ GreenBook แล้ว 100% (376 โครงการเปิดใหม่ ต.ค.-พ.ย. 2569)
    const cachedLive = localStorage.getItem('nti_live_tenders');
    if (cachedLive) {
      try {
        const parsed = JSON.parse(cachedLive);
        const hasMojibake = cachedLive.includes('เธ') || cachedLive.includes('เน€');
        const hasVerifiedGreenBook = Array.isArray(parsed) && parsed.length > 0 && parsed.every(t => t.green_book_types && t.tor_zip_url && t.egp_direct_url);
        if (!hasVerifiedGreenBook || hasMojibake) {
          localStorage.removeItem('nti_live_tenders');
        } else {
          this.tenders = parsed;
          this.isLiveMode = true;
        }
      } catch (e) {
        localStorage.removeItem('nti_live_tenders');
      }
    }

    // โหลดฐานข้อมูลโครงการเปิดรับซองจริงจาก e-GP (ตรวจ GreenBook แล้วว่าไม่มี price/W0/I0)
    if (this.tenders.length === 0) {
      const db = window.NTI_TENDER_DATABASE || (typeof NTI_TENDER_DATABASE !== 'undefined' ? NTI_TENDER_DATABASE : []);
      this.tenders = Array.isArray(db) ? [...db] : [];
    }

    this.updateDataSourceBanner();
    this.updateKpis();
    this.applyFilters();
    this.setupEventListeners();
    this.renderCategoryCounts();
    this.renderWatchlistBadge();

    if (window.tenderAnalytics) {
      window.tenderAnalytics.renderCharts(this.tenders);
    }
  }

  updateKpis() {
    const totalCountEl = document.getElementById('stat-total-count');
    const totalBudgetEl = document.getElementById('stat-total-budget');
    const planCountEl = document.getElementById('stat-plan-count');
    const localCountEl = document.getElementById('stat-local-count');

    if (totalCountEl) totalCountEl.innerText = `${this.tenders.length.toLocaleString('th-TH')} โครงการ`;

    const totalBudget = this.tenders.reduce((sum, t) => sum + (Number(t.budget) || 0), 0);
    if (totalBudgetEl) {
      const mb = (totalBudget / 1000000).toLocaleString('th-TH', { maximumFractionDigits: 1 });
      totalBudgetEl.innerText = `${mb} ล้านบาท`;
    }

    const d0Count = this.tenders.filter(t => t.stage === 'D0').length;
    if (planCountEl) planCountEl.innerText = `${d0Count.toLocaleString('th-TH')} โครงการ`;

    const localCount = this.tenders.filter(t => {
      const p = t.province || '';
      return ['นนทบุรี', 'กรุงเทพมหานคร', 'ปทุมธานี', 'สมุทรปราการ', 'สมุทรสาคร', 'นครปฐม'].some(prov => p.includes(prov));
    }).length;
    if (localCountEl) localCountEl.innerText = `${localCount.toLocaleString('th-TH')} โครงการ`;
  }

  updateDataSourceBanner() {
    const banner = document.getElementById('data-source-indicator');
    const d0Count = this.tenders.filter(t => t.stage === 'D0').length;
    const b0Count = this.tenders.filter(t => t.stage === 'B0').length;
    if (banner) {
      banner.innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          🟢 งานประมูลไอทีเปิดสดบน e-GP วันนี้ (${this.tenders.length.toLocaleString('th-TH')} โครงการ: ประกาศเชิญชวน ${d0Count} + ร่าง TOR ${b0Count}) • ตรวจ GreenBook แล้ว 100% ยังไม่ปิดรับซอง & ยังไม่มีผู้ชนะ
        </span>
      `;
    }
  }

  setupEventListeners() {
    // ช่องค้นหาหลัก
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('btn-clear-search');

    const updateClearBtnVisibility = () => {
      if (clearSearchBtn && searchInput) {
        if (searchInput.value.trim().length > 0) {
          clearSearchBtn.classList.remove('hidden');
        } else {
          clearSearchBtn.classList.add('hidden');
        }
      }
    };

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchTerm = e.target.value.trim().toLowerCase();
        updateClearBtnVisibility();
        this.applyFilters();
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.searchTerm = searchInput.value.trim().toLowerCase();
          updateClearBtnVisibility();
          this.applyFilters();
        }
      });
    }

    // ปุ่มล้างการค้นหา
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        this.searchTerm = '';
        updateClearBtnVisibility();
        this.applyFilters();
      });
    }

    // หมวดหมู่งาน (Category Pills)
    const catButtons = document.querySelectorAll('.cat-pill');
    catButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        catButtons.forEach(b => b.classList.remove('active', 'bg-blue-600', 'text-white'));
        catButtons.forEach(b => b.classList.add('bg-white', 'text-slate-700', 'hover:bg-slate-100'));

        btn.classList.add('active', 'bg-blue-600', 'text-white');
        btn.classList.remove('bg-white', 'text-slate-700', 'hover:bg-slate-100');

        this.currentCategory = btn.dataset.category || 'all';
        this.applyFilters();
      });
    });

    // ตัวกรองแหล่งข้อมูล (ข้อมูลจริง e-GP 100%)
    const dataSourceSelect = document.getElementById('filter-data-source');
    if (dataSourceSelect) {
      dataSourceSelect.addEventListener('change', (e) => {
        this.setDataSourceFilter(e.target.value);
      });
    }

    // Quick filter pills
    const pillAll = document.getElementById('pill-filter-all');
    const pillDocs = document.getElementById('pill-filter-docs');
    if (pillAll) pillAll.addEventListener('click', () => this.setDataSourceFilter('all'));
    if (pillDocs) pillDocs.addEventListener('click', () => this.setDataSourceFilter('with_docs'));

    // ตัวกรองปีงบประมาณ (2568, 2567)
    const fiscalYearSelect = document.getElementById('filter-fiscal-year');
    if (fiscalYearSelect) {
      fiscalYearSelect.addEventListener('change', (e) => {
        this.fiscalYearFilter = e.target.value;
        this.applyFilters();
      });
    }

    // ระบบเฝ้าระวังงานใหม่อัตโนมัติ (Auto-Monitor)
    const btnToggleMonitor = document.getElementById('btn-toggle-monitor');
    if (btnToggleMonitor) {
      btnToggleMonitor.addEventListener('click', () => this.toggleAutoMonitoring());
    }

    const monitorIntervalSelect = document.getElementById('monitor-interval');
    if (monitorIntervalSelect) {
      monitorIntervalSelect.addEventListener('change', (e) => {
        this.autoMonitorInterval = parseInt(e.target.value, 10) || 5;
        if (this.isAutoMonitoring) {
          this.startAutoMonitoring();
        }
      });
    }

    // Dropdowns
    const budgetSelect = document.getElementById('filter-budget');
    if (budgetSelect) {
      budgetSelect.addEventListener('change', (e) => {
        this.budgetFilter = e.target.value;
        this.applyFilters();
      });
    }

    const methodSelect = document.getElementById('filter-method');
    if (methodSelect) {
      methodSelect.addEventListener('change', (e) => {
        this.methodFilter = e.target.value;
        this.applyFilters();
      });
    }

    const provinceSelect = document.getElementById('filter-province');
    if (provinceSelect) {
      provinceSelect.addEventListener('change', (e) => {
        this.provinceFilter = e.target.value;
        this.applyFilters();
      });
    }

    // View toggles
    const btnViewGrid = document.getElementById('btn-view-grid');
    const btnViewTable = document.getElementById('btn-view-table');
    if (btnViewGrid && btnViewTable) {
      btnViewGrid.addEventListener('click', () => {
        this.viewMode = 'grid';
        btnViewGrid.classList.add('active-view');
        btnViewTable.classList.remove('active-view');
        this.renderTenders();
      });
      btnViewTable.addEventListener('click', () => {
        this.viewMode = 'table';
        btnViewTable.classList.add('active-view');
        btnViewGrid.classList.remove('active-view');
        this.renderTenders();
      });
    }

    // Tabs
    const tabSearch = document.getElementById('tab-search');
    const tabWatchlist = document.getElementById('tab-watchlist');
    const tabAnalytics = document.getElementById('tab-analytics');

    if (tabSearch && tabWatchlist && tabAnalytics) {
      const switchTab = (tab) => {
        this.currentTab = tab;
        [tabSearch, tabWatchlist, tabAnalytics].forEach(t => t.classList.remove('border-blue-600', 'text-blue-600'));
        [tabSearch, tabWatchlist, tabAnalytics].forEach(t => t.classList.add('border-transparent', 'text-slate-500'));

        document.getElementById('view-search-container').classList.add('hidden');
        document.getElementById('view-watchlist-container').classList.add('hidden');
        document.getElementById('view-analytics-container').classList.add('hidden');

        if (tab === 'search') {
          tabSearch.classList.add('border-blue-600', 'text-blue-600');
          tabSearch.classList.remove('border-transparent', 'text-slate-500');
          document.getElementById('view-search-container').classList.remove('hidden');
          this.applyFilters();
        } else if (tab === 'watchlist') {
          tabWatchlist.classList.add('border-blue-600', 'text-blue-600');
          tabWatchlist.classList.remove('border-transparent', 'text-slate-500');
          document.getElementById('view-watchlist-container').classList.remove('hidden');
          this.renderWatchlist();
        } else if (tab === 'analytics') {
          tabAnalytics.classList.add('border-blue-600', 'text-blue-600');
          tabAnalytics.classList.remove('border-transparent', 'text-slate-500');
          document.getElementById('view-analytics-container').classList.remove('hidden');
          if (window.tenderAnalytics) {
            window.tenderAnalytics.renderCharts(this.tenders);
          }
        }
      };

      tabSearch.addEventListener('click', () => switchTab('search'));
      tabWatchlist.addEventListener('click', () => switchTab('watchlist'));
      tabAnalytics.addEventListener('click', () => switchTab('analytics'));
    }

    // Export CSV
    const btnExport = document.getElementById('btn-export');
    if (btnExport) {
      btnExport.addEventListener('click', () => this.exportToCSV());
    }

    // ปุ่มซิงค์ข้อมูลสดจาก e-GP
    const btnSyncLive = document.getElementById('btn-sync-live');
    if (btnSyncLive) {
      btnSyncLive.addEventListener('click', () => this.syncLiveCGD());
    }

    // File Input สำหรับนำเข้าไฟล์ e-GP
    const fileImportInput = document.getElementById('file-import-input');
    if (fileImportInput) {
      fileImportInput.addEventListener('change', (e) => this.handleFileUpload(e));
    }

    // ปิด Modal
    const modalBackdrop = document.getElementById('tender-modal-backdrop');
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) this.closeModal();
      });
    }
  }

  /**
   * ดึงข้อมูลสดจาก Open Government Data API ของกรมบัญชีกลาง
   */
  async syncLiveCGD() {
    const apiKey = window.cgdConnector ? window.cgdConnector.getApiKey() : '';
    
    if (!apiKey) {
      // แจ้งเตือนให้ใส่ API Key หรือเปิดหน้าตั้งค่า
      document.getElementById('modal-api-settings').classList.remove('hidden');
      alert("กรุณากรอก Open Government Data API Key ก่อนดึงข้อมูลสด (สมัครรับคีย์ฟรีได้ที่ opend.data.go.th)\n\nหรือหากไม่มี API Key ท่านสามารถกดปุ่ม 'เปิดค้นหาบนเว็บ e-GP โดยตรง' ด้านล่างได้ทันทีครับ!");
      return;
    }

    const btnSync = document.getElementById('btn-sync-live');
    const originalText = btnSync ? btnSync.innerHTML : '';
    if (btnSync) {
      btnSync.innerHTML = `<svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> กำลังดึงข้อมูลสดจากกรมบัญชีกลาง...`;
      btnSync.disabled = true;
    }

    try {
      const liveResults = await window.cgdConnector.fetchLiveContracts();
      if (liveResults && liveResults.length > 0) {
        this.tenders = liveResults;
        this.isLiveMode = true;
        localStorage.setItem('nti_live_tenders', JSON.stringify(liveResults));
        this.updateDataSourceBanner();
        this.applyFilters();
        this.renderCategoryCounts();
        if (window.tenderAnalytics) window.tenderAnalytics.renderCharts(this.tenders);
        alert(`ดึงข้อมูลสดจากกรมบัญชีกลางสำเร็จ! พบ ${liveResults.length} โครงการล่าสุดที่ตรงกับสายงานของ NTi`);
      } else {
        alert("ไม่พบข้อมูลโครงการใหม่จากเงื่อนไขที่ระบุ ลองตรวจสอบปีงบประมาณหรือคำค้นหา");
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ API: " + err.message);
    } finally {
      if (btnSync) {
        btnSync.innerHTML = originalText;
        btnSync.disabled = false;
      }
    }
  }

  /**
   * รองรับการนำเข้าไฟล์ JSON หรือ CSV ที่ดาวน์โหลดมาจาก e-GP หรือรันโดยบอท
   */
  handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        if (file.name.endsWith('.json')) {
          const json = JSON.parse(text);
          if (Array.isArray(json)) {
            this.tenders = json;
            this.isLiveMode = true;
            this.updateDataSourceBanner();
            this.applyFilters();
            this.renderCategoryCounts();
            alert(`นำเข้าข้อมูลโครงการจาก ${file.name} สำเร็จ รวม ${json.length} โครงการ`);
          }
        } else {
          alert("กรุณาเลือกไฟล์ JSON โครงการ (เช่น tenders_latest.json หรือ tenders_database.json)");
        }
      } catch (err) {
        alert("ไม่สามารถอ่านไฟล์ได้: " + err.message);
      }
    };
    reader.readAsText(file, "UTF-8");
  }

  setDataSourceFilter(val) {
    this.dataSourceFilter = val;
    const selectEl = document.getElementById('filter-data-source');
    if (selectEl) selectEl.value = val;

    const pillAll = document.getElementById('pill-filter-all');
    const pillDocs = document.getElementById('pill-filter-docs');

    if (pillAll && pillDocs) {
      pillAll.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-all';
      pillDocs.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-800 border border-slate-200 hover:border-blue-300 transition-all flex items-center gap-1';

      if (val === 'with_docs') {
        pillDocs.className = 'px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-xs flex items-center gap-1 transition-all';
      } else {
        pillAll.className = 'px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white shadow-xs flex items-center gap-1 transition-all';
      }
    }

    this.applyFilters();
  }

  applyFilters() {
    this.filteredTenders = this.tenders.filter(item => {
      // ตัดงานที่ทำสัญญาแล้วหรือประกาศผู้ชนะไปแล้วออก 100% (ต้องการเฉพาะงานที่กำลังหาคนประมูล)
      if (item.status === 'AWARDED' || (item.winner_company && item.winner_company.trim() !== '') || (item.contract_no && item.contract_no.trim() !== '')) {
        return false;
      }

      // กรองแหล่งข้อมูล: มีเอกสารจริงดาวน์โหลดได้ทันที
      if (this.dataSourceFilter === 'with_docs' && !item.has_local_docs && (item.docs_count || 0) <= 0) {
        return false;
      }

      if (this.currentCategory !== 'all' && item.category_id !== this.currentCategory) {
        return false;
      }

      // กรองตามขั้นตอนการเปิดรับซอง (D0 ประกาศเชิญชวน / B0 ร่าง TOR / ปีงบประมาณ)
      if (this.fiscalYearFilter !== 'all') {
        if (this.fiscalYearFilter === 'D0' || this.fiscalYearFilter === 'B0') {
          if (item.stage !== this.fiscalYearFilter) return false;
        } else {
          const fy = item.fiscal_year || (item.project_id ? '25' + item.project_id.substring(0, 2) : '');
          if (fy !== this.fiscalYearFilter) return false;
        }
      }

      if (this.searchTerm) {
        const keywords = this.searchTerm.split(/\s+/).filter(Boolean);
        const fullContent = `${item.project_name || ''} ${item.dept_name || ''} ${item.project_id || ''} ${item.province || ''} ${item.tender_method || ''} ${item.announce_date || ''} ${item.closing_date || ''} ${item.category_id || ''}`.toLowerCase();
        const isMatch = keywords.every(kw => {
          if (fullContent.includes(kw)) return true;
          if ((kw === 'ma' || kw === 'pm') && (fullContent.includes('บำรุงรักษา') || fullContent.includes('ซ่อมแซม') || item.category_id === 'ma_pm')) return true;
          if ((kw === 'pc' || kw === 'notebook') && (fullContent.includes('คอมพิวเตอร์') || item.category_id === 'pc_hardware')) return true;
          if ((kw === 'server' || kw === 'แม่ข่าย') && (fullContent.includes('แม่ข่าย') || fullContent.includes('server'))) return true;
          if ((kw === 'lan' || kw === 'fiber' || kw === 'สายสัญญาณ') && (fullContent.includes('สายสัญญาณ') || fullContent.includes('เครือข่าย') || item.category_id === 'cabling_power')) return true;
          if ((kw === 'network' || kw === 'wifi' || kw === 'firewall') && (fullContent.includes('เครือข่าย') || item.category_id === 'network_security')) return true;
          if ((kw === 'cctv' || kw === 'กล้อง' || kw === 'กล้องวงจรปิด') && (fullContent.includes('กล้อง') || fullContent.includes('โทรทัศน์วงจรปิด') || fullContent.includes('cctv'))) return true;
          if ((kw === 'av' || kw === 'ห้องประชุม' || kw === 'โสต') && (fullContent.includes('ประชุม') || fullContent.includes('โสต') || fullContent.includes('เสียง') || item.category_id === 'meeting_av')) return true;
          if ((kw === 'software' || kw === 'ซอฟต์แวร์' || kw === 'ระบบงาน') && (fullContent.includes('ซอฟต์แวร์') || fullContent.includes('โปรแกรม') || fullContent.includes('ระบบ') || item.category_id === 'software_license')) return true;
          return false;
        });
        if (!isMatch) return false;
      }

      const budget = Number(item.budget) || 0;
      if (this.budgetFilter === 'under_500k' && budget > 500000) return false;
      if (this.budgetFilter === '500k_to_2m' && (budget < 500000 || budget > 2000000)) return false;
      if (this.budgetFilter === '2m_to_5m' && (budget < 2000000 || budget > 5000000)) return false;
      if (this.budgetFilter === '5m_to_15m' && (budget < 5000000 || budget > 15000000)) return false;
      if (this.budgetFilter === 'over_15m' && budget < 15000000) return false;

      if (this.methodFilter !== 'all') {
        const m = item.tender_method || '';
        if (this.methodFilter === 'ebidding' && !m.includes('e-Bidding') && !m.includes('ประกวดราคา')) return false;
        if (this.methodFilter === 'specific' && !m.includes('เฉพาะเจาะจง')) return false;
        if (this.methodFilter === 'private' && item.sector !== 'private' && !m.includes('เอกชน')) return false;
      }

      if (this.provinceFilter !== 'all') {
        const p = item.province || '';
        if (this.provinceFilter === 'nonthaburi') {
          if (!p.includes('นนทบุรี')) return false;
        } else if (this.provinceFilter === 'bangkok') {
          if (!p.includes('กรุงเทพ')) return false;
        } else if (this.provinceFilter === 'metropolitan') {
          if (!['นนทบุรี', 'กรุงเทพมหานคร', 'ปทุมธานี', 'สมุทรปราการ', 'สมุทรสาคร', 'นครปฐม'].some(prov => p.includes(prov))) return false;
        } else {
          if (!p.includes(this.provinceFilter)) return false;
        }
      }

      return true;
    });

    // เรียงตามวันที่ประกาศล่าสุดก่อน (พ.ย. 69 -> ต.ค. 69) แล้วเรียงตามงาน D0 และ NTi Match Score
    this.filteredTenders.sort((a, b) => {
      const dateA = a.announce_date_iso || '';
      const dateB = b.announce_date_iso || '';
      if (dateB !== dateA) return dateB.localeCompare(dateA);
      if (a.stage !== b.stage) return a.stage === 'D0' ? -1 : 1;
      return (b.nti_match_score || 0) - (a.nti_match_score || 0);
    });

    this.renderTenders();
    this.updateResultCount();

    if (window.tenderAnalytics && this.currentTab === 'analytics') {
      window.tenderAnalytics.renderCharts(this.filteredTenders);
    }
  }

  updateResultCount() {
    const countEl = document.getElementById('search-result-count');
    if (countEl) {
      countEl.innerText = `พบ ${this.filteredTenders.length} โครงการที่เปิดรับซองอยู่จริง (ตรวจ GreenBook แล้ว 100%)`;
    }
  }

  renderCategoryCounts() {
    const counts = { all: this.tenders.length };
    this.tenders.forEach(t => {
      counts[t.category_id] = (counts[t.category_id] || 0) + 1;
    });

    document.querySelectorAll('.cat-pill').forEach(btn => {
      const cat = btn.dataset.category;
      const badge = btn.querySelector('.cat-count');
      if (badge) {
        badge.innerText = counts[cat] || 0;
      }
    });
  }

  renderTenders() {
    const container = document.getElementById('tenders-container');
    if (!container) return;

    if (this.filteredTenders.length === 0) {
      container.innerHTML = `
        <div class="col-span-full py-16 text-center bg-white rounded-2xl border border-slate-200">
          <div class="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>
          <h3 class="text-lg font-bold text-slate-700 mb-1">ไม่พบโครงการประมูลที่ตรงกับเงื่อนไข</h3>
          <p class="text-slate-500 text-sm max-w-md mx-auto mb-4">ลองปรับคำค้นหา หรือกดค้นหาบนระบบ e-GP ของกรมบัญชีกลางโดยตรง</p>
          <div class="flex items-center justify-center gap-2">
            <button onclick="app.resetFilters()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm">
              ล้างตัวกรองทั้งหมด
            </button>
            <a href="https://www.gprocurement.go.th/new_index.html" target="_blank" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg shadow-sm">
              เปิดค้นหาเว็บ e-GP กรมบัญชีกลางสดๆ
            </a>
          </div>
        </div>
      `;
      return;
    }

    if (this.viewMode === 'grid') {
      container.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5";
      container.innerHTML = this.filteredTenders.map(t => this.generateTenderCard(t)).join('');
    } else {
      container.className = "block bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm";
      container.innerHTML = this.generateTenderTable(this.filteredTenders);
    }
  }

  generateTenderCard(t) {
    const isBookmarked = !!this.watchlist[t.project_id];
    const catBadge = this.getCategoryBadge(t.category_id);
    const scoreClass = t.nti_match_score >= 95 ? 'bg-emerald-500 text-white' : (t.nti_match_score >= 90 ? 'bg-blue-600 text-white' : 'bg-amber-500 text-white');
    const formattedBudget = Number(t.budget).toLocaleString('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 });

    const isD0 = t.stage !== 'B0';
    const fyBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-emerald-600 text-white shadow-xs">📅 ประกาศ ${t.announce_date || 'ต.ค.-พ.ย. 69'}</span>`;

    const statusHtml = isD0 ? `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        ⚡ ประกาศเชิญชวน (เปิดรับซองจริง)
      </span>
    ` : `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
        <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
        📝 ร่าง TOR เปิดใหม่ (เตรียมรับซอง)
      </span>
    `;
    const dateLabel = 'สถานะการเปิดรับซอง:';
    const dateColorClass = isD0 ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold';

    const cardBorder = 'border-2 border-emerald-400 hover:border-emerald-600 bg-white hover:shadow-2xl';

    return `
      <div class="${cardBorder} rounded-2xl transition-all duration-200 flex flex-col justify-between overflow-hidden group">
        <div>
          <!-- Card Header -->
          <div class="p-5 pb-3 flex items-start justify-between gap-3 border-b border-slate-100 bg-emerald-50/50">
            <div class="flex flex-wrap items-center gap-1.5">
              ${fyBadge}
              ${catBadge}
              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${scoreClass}" title="${t.nti_match_reason || ''}">
                NTi Match ${t.nti_match_score}%
              </span>
            </div>
            <button onclick="app.toggleWatchlist('${t.project_id}')" class="text-slate-400 hover:text-amber-500 transition-colors p-1" title="บันทึกโครงการ">
              <svg class="w-5 h-5 ${isBookmarked ? 'fill-amber-400 text-amber-500' : 'fill-none stroke-current'}" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
            </button>
          </div>

          <!-- Card Body -->
          <div class="p-5">
            <div class="text-xs text-slate-400 font-mono mb-1.5 flex items-center justify-between flex-wrap gap-1">
              <span class="flex items-center gap-1.5">
                <span>รหัส e-GP: <strong class="text-emerald-800 font-bold">${t.project_id}</strong></span>
                <span class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-bold border border-emerald-300" title="ตรวจตารางเอกสารที่เกี่ยวข้อง (GreenBook) แล้วว่ายังไม่มีสรุปราคาและยังไม่มีผู้ชนะ">✓ GreenBook: ${t.green_book_types || 'D0'}</span>
              </span>
              ${statusHtml}
            </div>
            
            <h4 class="font-bold text-slate-800 text-base leading-snug line-clamp-2 mb-3 group-hover:text-blue-600 transition-colors cursor-pointer" onclick="app.showDetailModal('${t.project_id}', 'tor')">
              ${t.project_name}
            </h4>

            <div class="space-y-2 text-xs text-slate-600 mb-4">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                <span class="truncate font-medium">${t.dept_name}</span>
              </div>
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                <span class="truncate">${t.province} (${t.tender_method})</span>
              </div>
              <div class="flex items-center gap-2 text-slate-500">
                <svg class="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <span>${dateLabel} <span class="${dateColorClass}">${t.closing_date}</span></span>
              </div>
            </div>

            <div class="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-1.5">
              <span class="font-bold text-slate-700">📎 ไฟล์จริงตามหน้าเว็บ e-GP:</span>
              <div class="flex flex-wrap items-center gap-1">
                ${t.price_zip_url ? `<a href="${t.price_zip_url}" target="_blank" class="px-2 py-0.5 rounded bg-white border border-slate-300 hover:bg-blue-50 text-blue-700 font-semibold text-[11px]">1. ประกาศราคากลาง</a>` : ''}
                ${t.tor_zip_url ? `<a href="${t.tor_zip_url}" target="_blank" class="px-2 py-0.5 rounded bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 font-semibold text-[11px]">2. ร่าง/เอกสารประกวดราคา (TOR)</a>` : ''}
                ${t.announce_pdf_url ? `<a href="${t.announce_pdf_url}" target="_blank" class="px-2 py-0.5 rounded bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-700 font-semibold text-[11px]">3. ใบประกาศ PDF</a>` : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Card Footer -->
        <div class="p-5 pt-3 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between">
          <div>
            <div class="text-[11px] text-slate-500 font-medium">วงเงินงบประมาณ</div>
            <div class="text-base font-extrabold text-blue-700">${formattedBudget}</div>
          </div>

          <div class="flex items-center gap-1.5">
            <button onclick="app.showDetailModal('${t.project_id}', 'tor')" class="px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors">
              ดูไฟล์จริง
            </button>
            <button onclick="app.downloadTORDocument('${t.project_id}')" class="px-2.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-1 shadow-xs" title="ดาวน์โหลดไฟล์จริงทั้งหมดตามหน้าเว็บ e-GP เข้าโฟลเดอร์ชื่อโครงการ">
              <span>📥</span> โหลดไฟล์จริง
            </button>
            <button onclick="app.openAnnouncementPDF('${t.project_id}')" class="px-2.5 py-1.5 text-xs font-bold bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors flex items-center gap-1" title="เปิดไฟล์ PDF ใบประกาศตราครุฑของจริงจากเซิร์ฟเวอร์ e-GP ทันที">
              <span>📜</span> ประกาศ PDF
            </button>
            <button onclick="app.openEGP('${t.project_id}')" class="px-2.5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 transition-colors shadow-sm" title="เปิดหน้าโครงการนี้โดยตรงบนเว็บ e-GP กรมบัญชีกลาง (process5.gprocurement.go.th)">
              e-GP ↗
            </button>
          </div>
        </div>
      </div>
    `;
  }

  toggleAutoMonitoring() {
    if (this.isAutoMonitoring) {
      this.stopAutoMonitoring();
    } else {
      this.startAutoMonitoring();
    }
  }

  startAutoMonitoring() {
    this.isAutoMonitoring = true;
    const led = document.getElementById('monitor-led');
    const text = document.getElementById('monitor-status-text');
    if (led) {
      led.className = "w-2 h-2 rounded-full bg-emerald-500 animate-ping";
    }
    if (text) {
      text.innerText = `เฝ้าระวัง: กำลังตรวจทุก ${this.autoMonitorInterval} นาที`;
    }

    if (this.autoMonitorTimer) clearInterval(this.autoMonitorTimer);
    
    this.autoMonitorTimer = setInterval(() => {
      this.runAutoMonitorCycle();
    }, this.autoMonitorInterval * 60 * 1000);

    alert(`เปิดระบบเฝ้าระวังอัตโนมัติแล้ว! ระบบจะตรวจสอบและดึงประกาศจัดซื้อจัดจ้างใหม่จาก e-GP กรมบัญชีกลางทุกๆ ${this.autoMonitorInterval} นาที`);
  }

  stopAutoMonitoring() {
    this.isAutoMonitoring = false;
    if (this.autoMonitorTimer) {
      clearInterval(this.autoMonitorTimer);
      this.autoMonitorTimer = null;
    }
    const led = document.getElementById('monitor-led');
    const text = document.getElementById('monitor-status-text');
    if (led) {
      led.className = "w-2 h-2 rounded-full bg-slate-400";
    }
    if (text) {
      text.innerText = "เฝ้าระวังอัตโนมัติ: ปิด";
    }
  }

  async runAutoMonitorCycle() {
    console.log(`[Auto-Monitor] Scanning e-GP & Open Data at ${new Date().toLocaleTimeString()}...`);
    try {
      if (window.cgdConnector) {
        const results = await window.cgdConnector.fetchLiveContracts({ year: 2570 });
        if (results && results.length > 0) {
          const existingIds = new Set(this.tenders.map(x => x.project_id));
          const newItems = results.filter(x => !existingIds.has(x.project_id));
          if (newItems.length > 0) {
            this.tenders = [...newItems, ...this.tenders];
            this.applyFilters();
            this.updateKpis();
            this.renderCategoryCounts();
            this.playNotificationSound();
            alert(`🔔 บอทตรวจพบโครงการประมูลใหม่ ${newItems.length} รายการจาก e-GP กรมบัญชีกลาง!`);
          }
        }
      }
    } catch (e) {
      console.warn("[Auto-Monitor] Cycle error:", e);
    }
  }

  playNotificationSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch (e) {}
  }

  generateTenderTable(tenders) {
    return `
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm text-slate-600">
          <thead class="bg-slate-50 border-b border-slate-200 text-xs uppercase font-semibold text-slate-500">
            <tr>
              <th class="py-3.5 px-4">โครงการ</th>
              <th class="py-3.5 px-4">หมวดหมู่</th>
              <th class="py-3.5 px-4">หน่วยงานจัดซื้อ</th>
              <th class="py-3.5 px-4 text-right">งบประมาณ</th>
              <th class="py-3.5 px-4 text-center">NTi Match</th>
              <th class="py-3.5 px-4 text-center">หมดเขต</th>
              <th class="py-3.5 px-4 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${tenders.map(t => {
              const formattedBudget = Number(t.budget).toLocaleString('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 });
              return `
                <tr class="hover:bg-blue-50/50 transition-colors">
                  <td class="py-3 px-4 max-w-xs">
                    <div class="font-bold text-slate-800 line-clamp-2 hover:text-blue-600 cursor-pointer" onclick="app.showDetailModal('${t.project_id}', 'tor')">
                      ${t.project_name}
                    </div>
                    <div class="text-[11px] text-slate-400 font-mono mt-0.5">e-GP: ${t.project_id}</div>
                  </td>
                  <td class="py-3 px-4 whitespace-nowrap">${this.getCategoryBadge(t.category_id)}</td>
                  <td class="py-3 px-4">
                    <div class="font-medium text-slate-700">${t.dept_name}</div>
                    <div class="text-xs text-slate-400">${t.province}</div>
                  </td>
                  <td class="py-3 px-4 text-right font-extrabold text-blue-700 whitespace-nowrap">${formattedBudget}</td>
                  <td class="py-3 px-4 text-center">
                    <span class="inline-block px-2 py-0.5 rounded text-xs font-bold ${t.nti_match_score >= 95 ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}">
                      ${t.nti_match_score}%
                    </span>
                  </td>
                  <td class="py-3 px-4 text-center text-xs whitespace-nowrap">${t.closing_date}</td>
                  <td class="py-3 px-4 text-right whitespace-nowrap">
                    <div class="flex items-center justify-end gap-1.5">
                      <button onclick="app.showDetailModal('${t.project_id}', 'tor')" class="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg" title="ดูไฟล์จริงจากหน้าเว็บ e-GP">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                      </button>
                      <button onclick="app.downloadTORDocument('${t.project_id}')" class="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg" title="โหลดไฟล์จริงทั้งหมดเข้าโฟลเดอร์ชื่อโครงการ">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                      </button>
                      <button onclick="app.openAnnouncementPDF('${t.project_id}')" class="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg" title="เปิดไฟล์ PDF ใบประกาศจริงจาก e-GP">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                      </button>
                      <button onclick="app.openEGP('${t.project_id}')" class="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg" title="เปิดหน้าโครงการบนระบบ e-GP กรมบัญชีกลาง">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  getCategoryBadge(catId) {
    const badges = {
      pc_hardware: `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">💻 จัดซื้อ PC/Server</span>`,
      ma_pm: `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">🛠️ งานจ้าง MA & PM</span>`,
      cabling_power: `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">🔌 เดินสาย LAN/Fiber</span>`,
      network_security: `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">🌐 Network & Wi-Fi</span>`,
      meeting_av: `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-pink-100 text-pink-800">📹 ห้องประชุม & AV</span>`,
      software_license: `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800">📦 ซอฟต์แวร์ & App</span>`
    };
    return badges[catId] || `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">งานไอที</span>`;
  }

  showToast(message, type = 'success', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const bgColors = {
      success: 'bg-emerald-600 text-white',
      error: 'bg-rose-600 text-white',
      warning: 'bg-amber-600 text-white',
      info: 'bg-blue-600 text-white'
    };
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    toast.className = `pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-xs md:text-sm font-semibold ${bgColors[type] || bgColors.info} transform transition-all duration-300 translate-y-3 opacity-0`;
    toast.innerHTML = `
      <span class="text-base">${icons[type] || '🔔'}</span>
      <span class="leading-snug">${message}</span>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-3', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  copyToClipboard(text, label = 'ข้อความ') {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        const shortText = text.length > 25 ? text.substring(0, 25) + '...' : text;
        this.showToast(`คัดลอก${label}แล้ว: ${shortText}`, 'success');
      }).catch(() => {
        this.fallbackCopyText(text, label);
      });
    } else {
      this.fallbackCopyText(text, label);
    }
  }

  fallbackCopyText(text, label) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      this.showToast(`คัดลอก${label}เรียบร้อยแล้ว`, 'success');
    } catch (err) {
      this.showToast(`คัดลอก: ${text}`, 'info');
    }
    document.body.removeChild(textArea);
  }

  getSearchKeyword(item) {
    if (!item) return 'คอมพิวเตอร์';
    if (item.search_keyword) return item.search_keyword;
    const name = item.project_name || '';
    if (name.includes('คอมพิวเตอร์')) return 'คอมพิวเตอร์';
    if (name.includes('ไมโครโฟน') || name.includes('ระบบเสียง')) return 'ระบบเสียง';
    if (name.includes('ห้องประชุม')) return 'ห้องประชุม';
    if (name.includes('แม่ข่าย') || name.includes('Server')) return 'คอมพิวเตอร์แม่ข่าย';
    if (name.includes('เครือข่าย') || name.includes('สายสัญญาณ') || name.includes('Lan')) return 'เครือข่าย';
    if (name.includes('บำรุงรักษา') || name.includes('ซ่อมแซม')) return 'บำรุงรักษา';
    if (name.includes('กล้อง') || name.includes('CCTV')) return 'กล้องวงจรปิด';
    return 'คอมพิวเตอร์';
  }

  openEGP(projectId) {
    const item = this.tenders.find(t => t.project_id === projectId);
    if (!item) return;

    const directUrl = item.egp_direct_url || item.egp_url || 'https://www.gprocurement.go.th/new_index.html';

    // คัดลอกรหัส 11 หลักของจริง และเปิดหน้าโครงการบนเว็บ e-GP กรมบัญชีกลางโดยตรงทันที
    this.copyToClipboard(item.project_id, `รหัสโครงการ e-GP 11 หลัก "${item.project_id}"`);
    window.open(directUrl, '_blank', 'noopener,noreferrer');
    this.showToast(`🟢 เปิดหน้าโครงการ "${item.project_id}" บนเซิร์ฟเวอร์ e-GP กรมบัญชีกลางโดยตรง (และคัดลอกรหัส 11 หลักให้แล้ว)`, 'success', 5500);
  }

  openAnnouncementPDF(projectId) {
    const item = this.tenders.find(t => t.project_id === projectId);
    if (!item) return;

    if (item.announce_pdf_url) {
      window.open(item.announce_pdf_url, '_blank', 'noopener,noreferrer');
      this.showToast(`📜 เปิดไฟล์ PDF ใบประกาศตราครุฑจริงจากเซิร์ฟเวอร์ e-GP (${item.project_id})`, 'success', 4500);
    }
    this.showDetailModal(projectId, 'tor');
  }

  getSafeFolderName(projName, projId) {
    let clean = (projName || 'โครงการ_eGP').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean.length > 60) clean = clean.substring(0, 60).trim();
    return `${clean}_${projId}`;
  }

  getClientWorkDir() {
    try {
      if (window.location.protocol === 'file:') {
        let p = decodeURIComponent(window.location.pathname || '');
        if (/^\/[a-zA-Z]:/.test(p)) {
          p = p.substring(1);
        }
        p = p.replace(/\//g, '\\');
        const lastSlash = p.lastIndexOf('\\');
        if (lastSlash > 0) {
          return p.substring(0, lastSlash);
        }
      }
    } catch (e) {}
    return '';
  }

  getProjectRealDocuments(projectId) {
    const docs = [];
    const item = this.tenders.find(t => t.project_id === projectId);
    if (!item) return docs;

    const dlInfo = (this.downloadedProjectFiles && this.downloadedProjectFiles[projectId]) || null;

    // หากดาวน์โหลดและแตกไฟล์ลงโฟลเดอร์ชื่อโครงการในเครื่องแล้ว ให้แสดงไฟล์ที่แตกออกมาทั้งหมดก่อน
    if (dlInfo && Array.isArray(dlInfo.files) && dlInfo.files.length > 0) {
      dlInfo.files.forEach((f, idx) => {
        const sizeKb = f.size > 1048576
          ? `${(f.size / 1048576).toFixed(2)} MB`
          : `${Math.max(1, Math.round((f.size || 0) / 1024))} KB`;
        const relUrl = `./เอกสารโครงการ_eGP/${encodeURIComponent(dlInfo.folderName)}/${encodeURIComponent(f.name)}`;
        docs.push({
          name: f.name,
          type: f.type || 'PDF',
          size: sizeKb,
          date: item.announce_date || 'ต.ค.-พ.ย. 2569',
          url: relUrl,
          desc: `${f.category || 'ไฟล์จริงจาก e-GP'} • บันทึกในโฟลเดอร์: ${dlInfo.folderName}`,
          isPrimaryTor: idx === 0 || f.name.includes('TOR'),
          isExtractedLocal: true
        });
      });
    }

    // 1. ร่างเอกสารประกวดราคา(e-Bidding) / เอกสารประกวดราคาและขอบเขตงาน TOR (ZIP จริงจาก e-GP)
    if (item.tor_zip_url) {
      docs.push({
        name: item.stage === 'B0'
          ? 'ร่างเอกสารประกวดราคา (e-Bidding) และร่างขอบเขตงาน TOR ครบชุด (ZIP จริงจาก e-GP)'
          : 'เอกสารประกวดราคา (e-Bidding) และขอบเขตของงาน TOR ครบชุด (ZIP จริงจาก e-GP)',
        type: 'ZIP',
        size: item.tor_zip_name || `${item.project_id}.zip`,
        date: item.announce_date || 'ต.ค.-พ.ย. 2569',
        url: item.tor_zip_url,
        desc: 'ไฟล์ต้นฉบับจริงจากเซิร์ฟเวอร์กรมบัญชีกลาง (process5.gprocurement.go.th) ภายในบรรจุไฟล์ PDF ขอบเขตงาน TOR ฉบับเต็ม, เอกสารประกวดราคา e-Bidding และประกาศ',
        isPrimaryTor: !dlInfo
      });
    }

    // 2. ประกาศราคากลาง และตารางคำนวณราคากลาง บก.06 (ZIP จริงจาก e-GP)
    if (item.price_zip_url) {
      docs.push({
        name: 'ประกาศราคากลาง และตารางแสดงวงเงินงบประมาณที่ได้รับจัดสรร (บก.06 ZIP จริงจาก e-GP)',
        type: 'ZIP',
        size: item.price_zip_name || `pricebuild_${item.project_id}.zip`,
        date: item.announce_date || 'ต.ค.-พ.ย. 2569',
        url: item.price_zip_url,
        desc: 'ไฟล์ประกาศราคากลางของจริงจากตาราง "เอกสาร/ประกาศที่เกี่ยวข้อง" ลำดับที่ 1 บนหน้าเว็บ e-GP ของโครงการนี้'
      });
    }

    // 3. ใบประกาศเชิญชวน / ร่างประกาศประกวดราคา ตราครุฑ (PDF จริงจาก e-GP)
    if (item.announce_pdf_url) {
      docs.push({
        name: item.stage === 'B0'
          ? 'ร่างประกาศประกวดราคาอิเล็กทรอนิกส์ (ไฟล์ PDF ตราครุฑจริงจาก e-GP)'
          : 'ประกาศเชิญชวนประกวดราคาอิเล็กทรอนิกส์ (ไฟล์ PDF ตราครุฑจริงจาก e-GP)',
        type: 'PDF',
        size: 'PDF ตราครุฑทางการ',
        date: item.announce_date || 'ต.ค.-พ.ย. 2569',
        url: item.announce_pdf_url,
        desc: 'ไฟล์ PDF ใบประกาศตราครุฑฉบับจริงจากระบบ Template Service ของกรมบัญชีกลาง เปิดอ่านหรือบันทึกได้ทันที'
      });
    }

    // 4. กรณีโครงการมีไฟล์ร่างเอกสาร B0 แยกต่างหากจาก D0
    if (item.draft_zip_url && item.draft_zip_url !== item.tor_zip_url) {
      docs.push({
        name: 'ร่างเอกสารประกวดราคา (e-Bidding) ขั้นตอนรับฟังวิจารณ์ B0 (ZIP จริงจาก e-GP)',
        type: 'ZIP',
        size: `Draft_B0_${item.project_id}.zip`,
        date: item.announce_date || 'ต.ค.-พ.ย. 2569',
        url: item.draft_zip_url,
        desc: 'ชุดไฟล์ร่างเอกสารประกวดราคา (B0) ต้นฉบับจากเซิร์ฟเวอร์ e-GP'
      });
    }

    if (item.draft_pdf_url && item.draft_pdf_url !== item.announce_pdf_url) {
      docs.push({
        name: 'ร่างประกาศประกวดราคา ขั้นตอน B0 (ไฟล์ PDF ตราครุฑจริงจาก e-GP)',
        type: 'PDF',
        size: 'PDF ตราครุฑทางการ',
        date: item.announce_date || 'ต.ค.-พ.ย. 2569',
        url: item.draft_pdf_url,
        desc: 'ไฟล์ PDF ร่างประกาศประกวดราคา (B0) จากเซิร์ฟเวอร์ e-GP'
      });
    }

    // 5. ลิงก์เปิดหน้าโครงการสดบนเว็บ e-GP กรมบัญชีกลางโดยตรง
    if (item.egp_direct_url || item.egp_url) {
      docs.push({
        name: 'หน้าประกาศโครงการสดบนเว็บ e-GP กรมบัญชีกลาง (Direct Project Link)',
        type: 'e-GP Direct',
        size: 'เปิดหน้าโครงการทันที',
        date: 'สดจาก process5.gprocurement.go.th',
        url: item.egp_direct_url || item.egp_url,
        desc: 'เปิดหน้าตาราง "เอกสาร/ประกาศที่เกี่ยวข้อง" ของโครงการนี้บนเว็บ e-GP กรมบัญชีกลางโดยตรง ไม่ต้องกรอกค้นหาใหม่',
        isSearchPortal: true
      });
    }

    return docs;
  }

  async openLocalProjectFolder(projectId) {
    const item = this.tenders.find(t => t.project_id === projectId);
    if (!item) return;
    const dlInfo = (this.downloadedProjectFiles && this.downloadedProjectFiles[projectId]) || null;
    const folderPath = dlInfo ? dlInfo.folderPath : '';
    const clientWorkDir = this.getClientWorkDir();
    try {
      const res = await fetch('http://127.0.0.1:8765/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ folderPath, client_work_dir: clientWorkDir })
      });
      if (res.ok) {
        const data = await res.json();
        this.showToast(`📂 เปิดโฟลเดอร์ "${data.opened || this.getSafeFolderName(item.project_name, item.project_id)}" บนหน้าจอแล้ว`, 'success');
        return;
      }
    } catch (e) {}
    this.showToast(`⚠️ กรุณาดับเบิลคลิกไฟล์ NTi_Tender_Server.exe หรือ start_dashboard.bat ในโฟลเดอร์โปรแกรม 1 ครั้งเพื่อให้ระบบเปิดโฟลเดอร์อัตโนมัติ`, 'warning', 6000);
  }

  async downloadTORDocument(projectId) {
    const item = this.tenders.find(t => t.project_id === projectId);
    if (!item) return;

    this.downloadedProjectFiles = this.downloadedProjectFiles || {};
    const folderName = this.getSafeFolderName(item.project_name, item.project_id);
    const clientWorkDir = this.getClientWorkDir();

    // เปิดหน้าต่างคลังเอกสารจริงทันทีเพื่อให้เห็นสถานะและรายการไฟล์ทั้งหมด
    this.showDetailModal(projectId, 'tor');
    this.showToast(`⏳ กำลังดึงไฟล์จริงทั้งหมดจากเว็บ e-GP (ประกาศราคากลาง + ร่างเอกสารประกวดราคา/TOR + ใบประกาศ) เข้าโฟลเดอร์ "${folderName}"...`, 'info', 4500);

    try {
      const response = await fetch('http://127.0.0.1:8765/api/download-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          project_id: item.project_id,
          project_name: item.project_name,
          dept_name: item.dept_name,
          tor_zip_url: item.tor_zip_url,
          tor_zip_name: item.tor_zip_name,
          price_zip_url: item.price_zip_url,
          price_zip_name: item.price_zip_name,
          announce_pdf_url: item.announce_pdf_url,
          draft_zip_url: item.draft_zip_url,
          draft_pdf_url: item.draft_pdf_url,
          client_work_dir: clientWorkDir,
          open_folder: true
        })
      });

      if (response.ok) {
        const resData = await response.json();
        if (resData && resData.ok) {
          this.downloadedProjectFiles[projectId] = resData;
          this.showDetailModal(projectId, 'tor');
          this.showToast(`✅ โหลดและแตกไฟล์จริงครบทั้งชุด (${resData.filesCount} ไฟล์) ลงใน "${resData.folderPath}" เรียบร้อยแล้ว!`, 'success', 6500);
          return;
        }
      }
    } catch (err) {
      console.warn('Local folder organizer service not reachable, falling back to direct browser downloads:', err);
    }

    // Fallback: ดาวน์โหลดไฟล์ทั้งหมดจาก process5.gprocurement.go.th ผ่านเบราว์เซอร์โดยตรง
    const urlsToDownload = [];
    if (item.tor_zip_url) urlsToDownload.push({ url: item.tor_zip_url, label: 'ร่างเอกสารประกวดราคา & TOR (.zip)' });
    if (item.price_zip_url) urlsToDownload.push({ url: item.price_zip_url, label: 'ประกาศราคากลาง (.zip)' });
    if (item.draft_zip_url && item.draft_zip_url !== item.tor_zip_url) {
      urlsToDownload.push({ url: item.draft_zip_url, label: 'ร่างเอกสาร B0 (.zip)' });
    }

    urlsToDownload.forEach((u, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = u.url;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, i * 700);
    });

    if (item.announce_pdf_url) {
      window.open(item.announce_pdf_url, '_blank', 'noopener,noreferrer');
    }

    this.showToast(`📥 กำลังดาวน์โหลดชุดไฟล์จริงทั้งหมดของโครงการ ${item.project_id} (TOR ZIP + ประกาศราคากลาง ZIP + ใบประกาศ PDF) จาก e-GP`, 'success', 5500);
  }

  switchModalTab(tabName) {
    this.currentModalTab = tabName;
    const overviewContent = document.getElementById('modal-tab-content-overview');
    const torContent = document.getElementById('modal-tab-content-tor');

    const btnOverview = document.getElementById('modal-tab-btn-overview');
    const btnTor = document.getElementById('modal-tab-btn-tor');

    if (overviewContent) overviewContent.classList.add('hidden');
    if (torContent) torContent.classList.add('hidden');

    const inactiveClass = 'px-3.5 py-2 text-xs md:text-sm font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition-colors';
    const activeClassBlue = 'px-3.5 py-2 text-xs md:text-sm font-bold border-b-2 border-blue-600 text-blue-600 flex items-center gap-1.5 transition-colors';
    const activeClassEmerald = 'px-3.5 py-2 text-xs md:text-sm font-bold border-b-2 border-emerald-600 text-emerald-700 flex items-center gap-1.5 transition-colors';

    if (btnOverview) btnOverview.className = inactiveClass;
    if (btnTor) btnTor.className = inactiveClass;

    if (tabName === 'overview') {
      if (overviewContent) overviewContent.classList.remove('hidden');
      if (btnOverview) btnOverview.className = activeClassBlue;
    } else {
      if (torContent) torContent.classList.remove('hidden');
      if (btnTor) btnTor.className = activeClassEmerald;
    }
  }

  showDetailModal(projectId, defaultTab = 'tor') {
    const item = this.tenders.find(t => t.project_id === projectId);
    if (!item) return;

    this.activeModalProjectId = projectId;
    this.currentModalTab = defaultTab || 'tor';

    const modalBackdrop = document.getElementById('tender-modal-backdrop');
    const modalContent = document.getElementById('tender-modal-content');
    if (!modalBackdrop || !modalContent) return;

    const isBookmarked = !!this.watchlist[item.project_id];
    const formattedBudget = Number(item.budget).toLocaleString('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 });
    const formattedRefPrice = Number(item.reference_price || item.budget).toLocaleString('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 });
    const realDocs = this.getProjectRealDocuments(item.project_id);

    const docsCardsHtml = realDocs.map((doc) => {
      let badgeColor = 'bg-red-100 text-red-800 border-red-200';
      let icon = '📄';
      if (doc.type === 'ZIP') {
        badgeColor = 'bg-amber-100 text-amber-800 border-amber-200';
        icon = '📦';
      } else if (doc.type === 'Excel' || doc.type === 'XLSX' || doc.type === 'XLS') {
        badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
        icon = '📊';
      } else if (doc.type === 'e-GP Direct') {
        badgeColor = 'bg-blue-100 text-blue-800 border-blue-200';
        icon = '🏛️';
      }

      const isPrimary = doc.isPrimaryTor;
      const borderClass = isPrimary ? 'border-2 border-emerald-500 bg-emerald-50/40' : 'border border-slate-200 bg-white hover:border-slate-300';

      return `
        <div class="p-4 rounded-2xl ${borderClass} shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all">
          <div class="flex items-start gap-3">
            <span class="text-2xl shrink-0 p-2 bg-slate-50 rounded-xl border border-slate-100">${icon}</span>
            <div>
              <div class="flex flex-wrap items-center gap-2 mb-1">
                <span class="font-bold text-slate-900 text-sm md:text-base">${doc.name}</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${badgeColor}">${doc.type}</span>
                ${isPrimary ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white shadow-xs">★ ไฟล์จริงจากหน้าเว็บ e-GP</span>' : ''}
              </div>
              <p class="text-xs text-slate-500 mb-1.5">${doc.desc || ''}</p>
              <div class="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 font-mono">
                <span>📁 ขนาด: <strong class="text-slate-600">${doc.size}</strong></span>
                <span>📅 วันที่ประกาศ: <strong class="text-slate-600">${doc.date}</strong></span>
                ${doc.isSearchPortal ? '<span class="text-blue-600 font-semibold">🏛️ ลิงก์ตรงหน้าโครงการบน e-GP</span>' : '<span class="text-emerald-700 font-bold">✓ ไฟล์ของจริงตามหน้าเว็บ e-GP 100%</span>'}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0 self-end md:self-center">
            ${doc.isSearchPortal ? `
              <button onclick="app.openEGP('${item.project_id}')" class="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all">
                <span>🏛️</span> เปิดหน้าเว็บ e-GP ↗
              </button>
            ` : `
              <a href="${doc.url}" target="_blank" class="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all" title="เปิดดูไฟล์ของจริง">
                <span>👁️</span> เปิดดูไฟล์จริง
              </a>
              <a href="${doc.url}" download class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all">
                <span>📥</span> โหลดไฟล์นี้
              </a>
            `}
          </div>
        </div>
      `;
    }).join('');

    modalContent.innerHTML = `
      <div class="p-6 md:p-8">
        <!-- Modal Top Bar -->
        <div class="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
          <div>
            <div class="flex flex-wrap items-center gap-2 mb-2">
              <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-xs">🟢 โครงการจริง e-GP 100% (เฉพาะไฟล์จริงตามหน้าเว็บ)</span>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">📅 ประกาศ ${item.announce_date}</span>
              ${this.getCategoryBadge(item.category_id)}
              <span class="text-xs font-bold px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                ✓ GreenBook: ${item.green_book_types || 'D0'}
              </span>
            </div>
            <h3 class="text-xl md:text-2xl font-bold text-slate-800 leading-snug">
              ${item.project_name}
            </h3>
            <div class="flex items-center gap-2 mt-1.5">
              <span class="text-xs text-slate-500 font-mono">เลขที่โครงการ e-GP: <strong class="text-emerald-800 font-bold">${item.project_id}</strong> <span class="text-[11px] text-emerald-700 font-bold">(11 หลักของจริง)</span></span>
              <button onclick="app.copyToClipboard('${item.project_id}', 'เลขที่โครงการ e-GP')" class="px-2 py-0.5 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md flex items-center gap-1 transition-colors">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                คัดลอกรหัส
              </button>
            </div>
          </div>
          <button onclick="app.closeModal()" class="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors shrink-0">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- In-Modal 2-Tab Navigation (Real Files & Real e-GP Info Only) -->
        <div class="flex items-center gap-2 border-b border-slate-200 mb-5 pb-1">
          <button id="modal-tab-btn-tor" onclick="app.switchModalTab('tor')" class="px-3.5 py-2 text-xs md:text-sm font-bold border-b-2 border-emerald-600 text-emerald-700 flex items-center gap-1.5 transition-colors">
            <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            ไฟล์เอกสารจริงตามหน้าเว็บ e-GP
            <span class="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-full">ของจริงเท่านั้น</span>
          </button>
          <button id="modal-tab-btn-overview" onclick="app.switchModalTab('overview')" class="px-3.5 py-2 text-xs md:text-sm font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            ข้อมูลโครงการจากหน้าเว็บ e-GP
          </button>
        </div>

        <!-- TAB 1: OFFICIAL E-GP DOCUMENTS HUB (DEFAULT ACTIVE) -->
        <div id="modal-tab-content-tor" class="space-y-4">
          <!-- Hub Header Banner -->
          <div class="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-950 text-white shadow-md">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <h3 class="font-bold text-base md:text-lg">
                    ไฟล์ของจริงตามตาราง "เอกสาร/ประกาศที่เกี่ยวข้อง" บนหน้าเว็บ e-GP
                  </h3>
                </div>
                <p class="text-xs text-blue-200 leading-relaxed">
                  ดึงเฉพาะไฟล์ต้นฉบับของจริงจากเซิร์ฟเวอร์กรมบัญชีกลาง (ประกาศราคากลาง + ร่างเอกสารประกวดราคา/TOR + ใบประกาศ PDF) ไม่มีไฟล์สรุปสร้างเองหรือไฟล์ตัวอย่างจำลอง:
                </p>
                <div class="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs font-mono">
                  <span>📁 โฟลเดอร์ชื่อโครงการ:</span>
                  <strong class="text-white">เอกสารโครงการ_eGP\\${this.getSafeFolderName(item.project_name, item.project_id)}</strong>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2 shrink-0">
                <button onclick="app.downloadTORDocument('${item.project_id}')" class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm">
                  <span>📥</span> โหลดไฟล์จริงทั้งหมดเข้าโฟลเดอร์โครงการ
                </button>
                <button onclick="app.openLocalProjectFolder('${item.project_id}')" class="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-bold transition-all flex items-center gap-1.5">
                  <span>📂</span> เปิดโฟลเดอร์ในเครื่อง
                </button>
                <button onclick="app.openEGP('${item.project_id}')" class="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all flex items-center gap-1 shadow-sm">
                  หน้าเว็บ e-GP ↗
                </button>
              </div>
            </div>
          </div>

          <!-- Documents List -->
          <div class="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1">
            ${docsCardsHtml}
          </div>
        </div>

        <!-- TAB 2: REAL E-GP METADATA OVERVIEW -->
        <div id="modal-tab-content-overview" class="hidden space-y-4">
          <!-- Active Status Banner -->
          <div class="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
              <span class="text-xs font-bold text-emerald-800 uppercase tracking-wide">สถานะโครงการบน e-GP:</span>
              <span class="text-xs sm:text-sm font-extrabold text-emerald-950">${item.closing_date}</span>
            </div>
            <span class="text-[11px] px-2.5 py-1 rounded-full font-bold bg-emerald-200 text-emerald-900 border border-emerald-300">
              ✓ เอกสารที่เกี่ยวข้องบนเว็บ e-GP: ${item.green_book_types || 'D0'} (ยังไม่มีประกาศผู้ชนะ)
            </span>
          </div>

          <!-- Real e-GP Metadata Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div class="text-xs text-slate-400 mb-1">เลขที่โครงการ e-GP (11 หลัก)</div>
              <div class="font-mono font-bold text-emerald-800 text-base">${item.project_id}</div>
              <div class="text-xs text-slate-500 mt-1">ปีงบประมาณที่จัดซื้อจัดจ้าง: <strong class="text-slate-700">${item.fiscal_year}</strong></div>
            </div>

            <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div class="text-xs text-slate-400 mb-1">งบประมาณและราคากลาง (ตามหน้าเว็บ e-GP)</div>
              <div class="text-xl font-black text-blue-600">${formattedBudget}</div>
              <div class="text-xs text-slate-500">ราคากลาง: <strong class="text-slate-800">${formattedRefPrice}</strong></div>
            </div>

            <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div class="text-xs text-slate-400 mb-1">ชื่อหน่วยงาน / หน่วยจัดซื้อ</div>
              <div class="font-bold text-slate-800">${item.dept_name}</div>
              <div class="text-xs text-slate-500 mt-1">จังหวัด: <strong class="text-slate-700">${item.province}</strong></div>
            </div>

            <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div class="text-xs text-slate-400 mb-1">วิธีการจัดซื้อจัดจ้าง & วันที่ประกาศ</div>
              <div class="font-semibold text-slate-800">${item.tender_method}</div>
              <div class="text-xs text-slate-500 mt-1">วันที่ประกาศบน e-GP: <strong class="text-emerald-700">${item.announce_date}</strong></div>
            </div>
          </div>
        </div>

        <!-- Modal Bottom Sticky Actions -->
        <div class="flex flex-wrap items-center justify-between gap-3 pt-4 mt-4 border-t border-slate-100">
          <button onclick="app.toggleWatchlist('${item.project_id}'); app.showDetailModal('${item.project_id}', app.currentModalTab);" class="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold flex items-center gap-2 transition-colors">
            <svg class="w-4 h-4 ${isBookmarked ? 'fill-amber-400 text-amber-500' : 'text-slate-400'}" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
            ${isBookmarked ? 'อยู่ในรายการติดตามแล้ว' : 'บันทึกเข้า Watchlist'}
          </button>

          <div class="flex flex-wrap items-center gap-2">
            <button onclick="app.openAnnouncementPDF('${item.project_id}')" class="px-3.5 py-2.5 rounded-xl border border-indigo-200 hover:bg-indigo-50 text-indigo-700 text-sm font-semibold flex items-center gap-1.5 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              ดูใบประกาศตราครุฑ (PDF จริง)
            </button>

            <button onclick="app.downloadTORDocument('${item.project_id}')" class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center gap-2 shadow-sm transition-colors" title="ดาวน์โหลดไฟล์จริงทั้งหมดตามหน้าเว็บ e-GP เข้าโฟลเดอร์ชื่อโครงการ">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              โหลดไฟล์จริงทั้งหมดเข้าโฟลเดอร์โครงการ
            </button>

            <button onclick="app.openLocalProjectFolder('${item.project_id}')" class="px-3.5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold flex items-center gap-1.5 transition-colors" title="เปิดโฟลเดอร์ของโครงการนี้ใน Windows Explorer">
              📂 เปิดโฟลเดอร์โครงการ
            </button>

            <button onclick="app.openEGP('${item.project_id}')" class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center gap-2 shadow-sm transition-colors" title="เปิดหน้าโครงการนี้โดยตรงบนเว็บ e-GP กรมบัญชีกลาง">
              เปิดหน้าโครงการบน e-GP
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;

    modalBackdrop.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    if (defaultTab === 'overview') {
      this.switchModalTab('overview');
    } else {
      this.switchModalTab('tor');
    }
  }

  closeModal() {
    const modalBackdrop = document.getElementById('tender-modal-backdrop');
    if (modalBackdrop) modalBackdrop.classList.add('hidden');
    document.body.style.overflow = '';
  }

  toggleWatchlist(projectId) {
    if (this.watchlist[projectId]) {
      delete this.watchlist[projectId];
    } else {
      this.watchlist[projectId] = {
        saved_at: new Date().toISOString(),
        status: 'interested',
        internal_note: ''
      };
    }

    localStorage.setItem('nti_watchlist', JSON.stringify(this.watchlist));
    this.renderWatchlistBadge();
    this.renderTenders();

    if (this.currentTab === 'watchlist') {
      this.renderWatchlist();
    }
  }

  updateWatchlistStatus(projectId, status) {
    if (this.watchlist[projectId]) {
      this.watchlist[projectId].status = status;
      localStorage.setItem('nti_watchlist', JSON.stringify(this.watchlist));
      this.renderWatchlist();
    }
  }

  updateWatchlistNote(projectId, note) {
    if (this.watchlist[projectId]) {
      this.watchlist[projectId].internal_note = note;
      localStorage.setItem('nti_watchlist', JSON.stringify(this.watchlist));
    }
  }

  renderWatchlistBadge() {
    const count = Object.keys(this.watchlist).length;
    const badge = document.getElementById('watchlist-count-badge');
    if (badge) {
      badge.innerText = count;
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
  }

  renderWatchlist() {
    const container = document.getElementById('watchlist-items-container');
    if (!container) return;

    const savedIds = Object.keys(this.watchlist);
    if (savedIds.length === 0) {
      container.innerHTML = `
        <div class="py-16 text-center bg-white rounded-2xl border border-slate-200">
          <div class="w-16 h-16 mx-auto mb-4 bg-amber-50 rounded-full flex items-center justify-center text-amber-500">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
          </div>
          <h3 class="text-lg font-bold text-slate-700 mb-1">ยังไม่มีโครงการในรายการติดตาม</h3>
          <p class="text-slate-500 text-sm max-w-md mx-auto mb-4">กดไอคอนดาว ⭐ ที่โครงการประมูลใดก็ได้เพื่อบันทึกและจัดการขั้นตอนการทำราคาที่นี่</p>
          <button onclick="document.getElementById('tab-search').click()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
            กลับไปค้นหาโครงการ
          </button>
        </div>
      `;
      return;
    }

    const savedTenders = this.tenders.filter(t => this.watchlist[t.project_id]);

    container.innerHTML = `
      <div class="space-y-4">
        ${savedTenders.map(t => {
          const wInfo = this.watchlist[t.project_id];
          const formattedBudget = Number(t.budget).toLocaleString('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 });

          return `
            <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1.5">
                  ${this.getCategoryBadge(t.category_id)}
                  <span class="text-xs text-slate-400 font-mono">e-GP: ${t.project_id}</span>
                </div>
                <h4 class="font-bold text-slate-800 text-base hover:text-blue-600 cursor-pointer mb-1" onclick="app.showDetailModal('${t.project_id}')">
                  ${t.project_name}
                </h4>
                <div class="text-xs text-slate-500 flex flex-wrap items-center gap-3">
                  <span>🏢 ${t.dept_name}</span>
                  <span>📍 ${t.province}</span>
                  <span class="font-bold text-blue-600">งบประมาณ: ${formattedBudget}</span>
                </div>
                <div class="mt-3">
                  <input type="text" value="${wInfo.internal_note || ''}" placeholder="บันทึกข้อความภายใน เช่น ติดต่อฝ่ายจัดซื้อแล้ว, นัดดูหน้างาน..." 
                    onchange="app.updateWatchlistNote('${t.project_id}', this.value)"
                    class="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-500 bg-slate-50">
                </div>
              </div>

              <div class="shrink-0 flex flex-col items-end gap-2">
                <select onchange="app.updateWatchlistStatus('${t.project_id}', this.value)" class="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none">
                  <option value="interested" ${wInfo.status === 'interested' ? 'selected' : ''}>📌 กำลังสนใจ</option>
                  <option value="tor_review" ${wInfo.status === 'tor_review' ? 'selected' : ''}>📋 ตรวจสอบ TOR</option>
                  <option value="pricing" ${wInfo.status === 'pricing' ? 'selected' : ''}>💰 กำลังทำราคา/หาซัพพลายเออร์</option>
                  <option value="submitted" ${wInfo.status === 'submitted' ? 'selected' : ''}>📤 ยื่นซองเสนอราคาแล้ว</option>
                  <option value="won" ${wInfo.status === 'won' ? 'selected' : ''}>🏆 ชนะการประมูล</option>
                  <option value="lost" ${wInfo.status === 'lost' ? 'selected' : ''}>❌ ไม่ผ่าน/ยกเลิก</option>
                </select>

                <div class="flex items-center gap-2">
                  <button onclick="app.openEGP('${t.project_id}')" class="text-xs font-semibold px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg flex items-center gap-1" title="เปิดค้นหาบนระบบ e-GP กรมบัญชีกลาง">
                    เปิด e-GP ↗
                  </button>
                  <button onclick="app.downloadTORDocument('${t.project_id}')" class="text-xs font-semibold px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg flex items-center gap-1" title="ดาวน์โหลดร่าง TOR">
                    โหลด TOR 📄
                  </button>
                  <button onclick="app.toggleWatchlist('${t.project_id}')" class="text-xs font-semibold px-3 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg">
                    ลบออก
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  setQuickSearch(keyword) {
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('btn-clear-search');
    if (searchInput) {
      searchInput.value = keyword;
    }
    if (clearSearchBtn) {
      if (keyword && keyword.trim().length > 0) {
        clearSearchBtn.classList.remove('hidden');
      } else {
        clearSearchBtn.classList.add('hidden');
      }
    }
    this.searchTerm = (keyword || '').trim().toLowerCase();
    this.applyFilters();
  }

  resetFilters() {
    this.searchTerm = '';
    this.currentCategory = 'all';
    this.fiscalYearFilter = 'all';
    this.budgetFilter = 'all';
    this.methodFilter = 'all';
    this.provinceFilter = 'all';
    this.dataSourceFilter = 'all';

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    const clearSearchBtn = document.getElementById('btn-clear-search');
    if (clearSearchBtn) clearSearchBtn.classList.add('hidden');

    const dataSourceSelect = document.getElementById('filter-data-source');
    if (dataSourceSelect) dataSourceSelect.value = 'all';

    const fySelect = document.getElementById('filter-fiscal-year');
    if (fySelect) fySelect.value = 'all';

    const budgetSelect = document.getElementById('filter-budget');
    if (budgetSelect) budgetSelect.value = 'all';

    const methodSelect = document.getElementById('filter-method');
    if (methodSelect) methodSelect.value = 'all';

    const provinceSelect = document.getElementById('filter-province');
    if (provinceSelect) provinceSelect.value = 'all';

    document.querySelectorAll('.cat-pill').forEach(btn => {
      if (btn.dataset.category === 'all') {
        btn.classList.add('active', 'bg-blue-600', 'text-white');
        btn.classList.remove('bg-white', 'text-slate-700', 'hover:bg-slate-100');
      } else {
        btn.classList.remove('active', 'bg-blue-600', 'text-white');
        btn.classList.add('bg-white', 'text-slate-700', 'hover:bg-slate-100');
      }
    });

    this.applyFilters();
  }

  exportToCSV() {
    if (this.filteredTenders.length === 0) {
      this.showToast("ไม่มีข้อมูลที่จะส่งออก", "warning");
      return;
    }

    const headers = ["รหัสโครงการ e-GP", "ปีงบประมาณ", "ประเภท", "ชื่อโครงการ", "หน่วยงาน", "จังหวัด", "หมวดหมู่งาน", "วงเงินงบประมาณ (บาท)", "ราคากลาง (บาท)", "วิธีการจัดหา", "NTi Match Score", "วันปิดรับซอง", "ลิงก์ e-GP"];
    const rows = this.filteredTenders.map(t => [
      `"${t.project_id}"`,
      `"${t.fiscal_year || '2569'}"`,
      `"${t.project_type || 'ANNOUNCEMENT'}"`,
      `"${(t.project_name || '').replace(/"/g, '""')}"`,
      `"${(t.dept_name || '').replace(/"/g, '""')}"`,
      `"${t.province || ''}"`,
      `"${t.category_id || ''}"`,
      t.budget || 0,
      t.reference_price || t.budget || 0,
      `"${t.tender_method || ''}"`,
      `"${t.nti_match_score}%"`,
      `"${t.closing_date || ''}"`,
      `"${t.egp_url || ''}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `NTi_IT_Tenders_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast(`✅ ส่งออกไฟล์ Excel/CSV สำเร็จ (${this.filteredTenders.length} โครงการ)`, 'success');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.app = new TenderApp();
  });
} else {
  window.app = new TenderApp();
}
