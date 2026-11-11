/**
 * โมดูลแสดงแผนภูมิสถิติและการวิเคราะห์งานประมูล (Tender Analytics & Visuals)
 * พัฒนาสำหรับ บริษัท นิวเทคโนโลยี่อินฟอร์เมชั่น จำกัด (NTi)
 */

class TenderAnalytics {
  constructor() {
    this.categoryChart = null;
    this.methodChart = null;
  }

  renderCharts(tenders) {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js ยังไม่ได้โหลด');
      return;
    }

    this.renderCategoryChart(tenders);
    this.renderMethodChart(tenders);
    this.updateStatsCards(tenders);
  }

  updateStatsCards(tenders) {
    const totalCount = tenders.length;
    const totalBudget = tenders.reduce((sum, t) => sum + (Number(t.budget) || 0), 0);
    const avgScore = totalCount > 0 
      ? Math.round(tenders.reduce((sum, t) => sum + (t.nti_match_score || 0), 0) / totalCount)
      : 0;

    // จำนวนโครงการในเขตนนทบุรี/ปริมณฑล
    const nonthaburiCount = tenders.filter(t => (t.province || '').includes('นนทบุรี')).length;

    // อัปเดตตัวเลขใน DOM
    const elCount = document.getElementById('stat-total-count');
    const elBudget = document.getElementById('stat-total-budget');
    const elScore = document.getElementById('stat-avg-score');
    const elLocal = document.getElementById('stat-local-count');

    if (elCount) elCount.innerText = totalCount.toLocaleString();
    if (elBudget) elBudget.innerText = (totalBudget / 1000000).toFixed(2) + ' ล้านบาท';
    if (elScore) elScore.innerText = avgScore + '%';
    if (elLocal) elLocal.innerText = nonthaburiCount + ' โครงการ';
  }

  renderCategoryChart(tenders) {
    const ctx = document.getElementById('categoryBudgetChart');
    if (!ctx) return;

    // คำนวณงบประมาณตามหมวดหมู่
    const catMap = {
      pc_hardware: { label: 'ซื้อคอมพิวเตอร์/PC/Server', total: 0, color: '#3B82F6' },
      ma_pm: { label: 'งานจ้าง MA & PM', total: 0, color: '#F59E0B' },
      cabling_power: { label: 'เดินสาย LAN/Fiber/ไฟ', total: 0, color: '#10B981' },
      network_security: { label: 'ระบบ Network/Firewall', total: 0, color: '#8B5CF6' },
      meeting_av: { label: 'ห้องประชุม/Smart Board', total: 0, color: '#EC4899' },
      software_license: { label: 'ซอฟต์แวร์/พัฒนาระบบ', total: 0, color: '#06B6D4' }
    };

    tenders.forEach(t => {
      const cat = catMap[t.category_id] || catMap['pc_hardware'];
      cat.total += Number(t.budget) || 0;
    });

    const labels = Object.values(catMap).map(c => c.label);
    const dataValues = Object.values(catMap).map(c => Math.round(c.total / 100000) / 10); // หน่วยล้านบาท
    const bgColors = Object.values(catMap).map(c => c.color);

    if (this.categoryChart) {
      this.categoryChart.destroy();
    }

    this.categoryChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: dataValues,
          backgroundColor: bgColors,
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              font: { family: "'Sarabun', 'Inter', sans-serif", size: 11 },
              padding: 10
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return ` ${context.label}: ${context.parsed} ล้านบาท`;
              }
            }
          }
        },
        cutout: '65%'
      }
    });
  }

  renderMethodChart(tenders) {
    const ctx = document.getElementById('tenderMethodChart');
    if (!ctx) return;

    const methodCounts = {
      'e-Bidding': 0,
      'เฉพาะเจาะจง': 0,
      'ประมูลเอกชน': 0,
      'อื่นๆ': 0
    };

    tenders.forEach(t => {
      const m = t.tender_method || '';
      if (m.includes('e-Bidding') || m.includes('ประกวดราคา')) methodCounts['e-Bidding']++;
      else if (m.includes('เฉพาะเจาะจง')) methodCounts['เฉพาะเจาะจง']++;
      else if (m.includes('เอกชน') || t.sector === 'private') methodCounts['ประมูลเอกชน']++;
      else methodCounts['อื่นๆ']++;
    });

    if (this.methodChart) {
      this.methodChart.destroy();
    }

    this.methodChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Object.keys(methodCounts),
        datasets: [{
          label: 'จำนวนโครงการ',
          data: Object.values(methodCounts),
          backgroundColor: ['#2563EB', '#10B981', '#F59E0B', '#64748B'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0, font: { family: "'Sarabun', sans-serif" } },
            grid: { color: 'rgba(0,0,0,0.05)' }
          },
          x: {
            ticks: { font: { family: "'Sarabun', sans-serif", size: 12 } },
            grid: { display: false }
          }
        }
      }
    });
  }
}

window.tenderAnalytics = new TenderAnalytics();
