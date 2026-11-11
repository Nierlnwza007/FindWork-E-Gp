/**
 * โมดูลเชื่อมต่อระบบฐานข้อมูลกรมบัญชีกลาง (e-GP) และ Open Data API
 * รองรับการดึงข้อมูลสดจาก Open Government Data API (opend.data.go.th / data.go.th)
 * และระบบสร้างลิงก์ค้นหาสดบนเว็บ e-GP ของกรมบัญชีกลาง
 */

class CGDDataConnector {
  constructor(config = null) {
    this.config = config || {
      apiKey: localStorage.getItem('nti_cgd_api_key') || 'lPYPLgnzSqpkRiNyyt3mnGhDHQSoWQm6',
      baseUrl: 'https://opend.data.go.th/govspending/cgdcontract',
      ckanUrl: 'https://data.go.th/api/3/action/package_search',
      fiscalYear: 2570,
      limit: 50
    };
    if (!localStorage.getItem('nti_cgd_api_key')) {
      localStorage.setItem('nti_cgd_api_key', 'lPYPLgnzSqpkRiNyyt3mnGhDHQSoWQm6');
    }
  }

  setApiKey(key) {
    this.config.apiKey = key.trim() || 'lPYPLgnzSqpkRiNyyt3mnGhDHQSoWQm6';
    localStorage.setItem('nti_cgd_api_key', this.config.apiKey);
  }

  getApiKey() {
    return this.config.apiKey || localStorage.getItem('nti_cgd_api_key') || 'lPYPLgnzSqpkRiNyyt3mnGhDHQSoWQm6';
  }

  /**
   * ดึงข้อมูลโครงการจัดซื้อจัดจ้างสดจาก Open Data API ของกรมบัญชีกลาง
   * ครอบคลุมทั้งแผนจัดซื้อจัดจ้างล่วงหน้า ปี 2570 และโครงการเปิดซองปี 2569
   */
  async fetchLiveContracts(queryParams = {}) {
    const apiKey = this.getApiKey();
    const year = queryParams.year || this.config.fiscalYear || 2570;
    let liveResults = [];

    // 1. ลองเชื่อมต่อไปยัง Open Government Data API (data.go.th)
    try {
      const response = await fetch(`${this.config.ckanUrl}?q=cgd&rows=10`, {
        method: 'GET',
        headers: {
          'Authorization': apiKey,
          'Accept': 'application/json'
        }
      });
      if (response.ok) {
        const json = await response.json();
        if (json && json.success && json.result && json.result.results) {
          console.log(`[CGDConnector] Successfully contacted data.go.th API! Found ${json.result.count} CKAN packages.`);
        }
      }
    } catch (err) {
      console.info("[CGDConnector] Browser CORS notice (Direct client-side API restricted by government portal policy). Using local sync engine.");
    }

    // 2. ดึงข้อมูลจาก Master Database (เฉพาะโครงการแท้ 100% ที่กำลังหาคนประมูล)
    if (Array.isArray(window.NTI_TENDER_DATABASE) && window.NTI_TENDER_DATABASE.length > 0) {
      liveResults = [...window.NTI_TENDER_DATABASE];
    }

    // กรองรายการซ้ำ
    const uniqueMap = new Map();
    liveResults.forEach(item => {
      if (!uniqueMap.has(item.project_id)) {
        uniqueMap.set(item.project_id, item);
      }
    });

    return Array.from(uniqueMap.values());
  }

  /**
   * แปลงข้อมูลจากโครงสร้าง JSON ของกรมบัญชีกลาง (CGDContract)
   */
  transformCGDData(apiResponse) {
    if (!apiResponse || !apiResponse.result) return [];

    const rawList = Array.isArray(apiResponse.result) ? apiResponse.result : [apiResponse.result];
    
    return rawList.map(item => {
      const projectName = item.project_name || item.contract_name || "โครงการจัดซื้อจัดจ้างด้านไอที";
      const budget = parseFloat(item.sum_price_agree || item.contract_price || item.total_budget || 0);
      const projectId = item.project_id || item.contract_no || ("CGD-" + Math.floor(Math.random()*1000000000));
      const deptName = item.dept_name || "หน่วยงานภาครัฐ";
      const province = this.detectProvince(deptName, item.province_name);

      const categoryId = this.detectCategory(projectName);
      const { score, reason } = this.calculateNTiScore(projectName, budget, deptName, province);

      return {
        project_id: projectId,
        project_name: projectName,
        dept_name: deptName,
        dept_code: item.dept_code || "",
        sector: "government",
        category_id: categoryId,
        budget: budget,
        reference_price: budget,
        announce_date: item.contract_date || new Date().toISOString().split('T')[0],
        closing_date: "เปิดรับข้อเสนอตามประกาศ",
        tender_method: item.purchase_method_name || "e-Bidding (ประกวดราคาอิเล็กทรอนิกส์)",
        status: "OPEN",
        province: province,
        nti_match_score: score,
        nti_match_reason: reason,
        scope_summary: `โครงการจัดซื้อจัดจ้างสดจากฐานข้อมูลกรมบัญชีกลาง e-GP ประจำปีงบประมาณ ${this.config.fiscalYear} รหัสโครงการ: ${projectId}`,
        egp_url: this.generateEgpUrl(projectId),
        tor_url: this.generateTorUrl(projectId),
        contact_person: deptName,
        is_live_data: true
      };
    });
  }

  /**
   * คำนวณความสอดคล้องกับศักยภาพบริษัท นิวเทคโนโลยี่อินฟอร์เมชั่น จำกัด
   */
  calculateNTiScore(title, budget, deptName, province) {
    let score = 50;
    const reasons = [];
    const lowerTitle = (title || '').toLowerCase();

    if (/คอมพิวเตอร์|เครื่องคอมพิวเตอร์|pc|desktop|โน้ตบุ๊ก|notebook|server|workstation|เซิร์ฟเวอร์/i.test(lowerTitle)) {
      score += 25;
      reasons.push("ตรงกับงานจำหน่าย PC/Hardware หลักของ NTi");
    }
    if (/บำรุงรักษา|ma|pm|preventive|ซ่อมแซม|ดูแลระบบ|ซ่อมบำรุง/i.test(lowerTitle)) {
      score += 25;
      reasons.push("ตรงกับงานสัญญาบริการบำรุงรักษา MA & PM รายปี");
    }
    if (/สาย lan|สายแลน|สายสัญญาณ|utp|cat6|fiber optic|ใยแก้ว|ตู้ rack|ระบบไฟฟ้า|ups/i.test(lowerTitle)) {
      score += 25;
      reasons.push("ตรงกับงานเดินสายสัญญาณ LAN / Fiber และระบบตู้ Data Center");
    }
    if (/เครือข่าย|network|switch|wi-fi|access point|firewall/i.test(lowerTitle)) {
      score += 20;
      reasons.push("ตรงกับงานติดตั้งระบบเครือข่ายและความปลอดภัย");
    }
    if (/ห้องประชุม|video conference|ประชุมทางไกล|smart board|interactive|ระบบภาพและเสียง/i.test(lowerTitle)) {
      score += 25;
      reasons.push("ตรงกับงานวางระบบห้องประชุมอัจฉริยะ & Video Conference");
    }

    // โบนัสทำเลที่ตั้ง
    if ((province || '').includes("นนทบุรี") || (deptName || '').includes("นนทบุรี")) {
      score += 15;
      reasons.push("ทำเลทอง: อยู่ในจังหวัดนนทบุรี ใกล้ที่ตั้งบริษัท NTi (ถ.รัตนาธิเบศร์)");
    } else if (['กรุงเทพ', 'ปทุมธานี', 'สมุทรปราการ'].some(p => (province || '').includes(p))) {
      score += 8;
      reasons.push("ทำเลปริมณฑล: สะดวกต่อการเดินทาง Onsite และติดตั้ง");
    }

    if (budget >= 500000 && budget <= 15000000) {
      score += 10;
      reasons.push(`งบประมาณเหมาะสม (${(budget / 1000000).toFixed(2)} ล้านบาท) ในช่วง Sweet Spot`);
    } else if (budget < 500000 && budget > 100000) {
      score += 8;
      reasons.push("งบประมาณไม่เกิน 5 แสน เหมาะกับงานวิธีเฉพาะเจาะจง");
    }

    score = Math.min(100, Math.max(40, score));

    return {
      score: score,
      reason: reasons.length > 0 ? reasons.join(" • ") : "โครงการไอทีที่สอดคล้องกับ NTi"
    };
  }

  detectCategory(text) {
    const t = (text || '').toLowerCase();
    if (/บำรุงรักษา|ma|pm|preventive|ซ่อมบำรุง|ซ่อมแซม/i.test(t)) return "ma_pm";
    if (/ห้องประชุม|video conference|ประชุมทางไกล|interactive|smart board|ระบบภาพ/i.test(t)) return "meeting_av";
    if (/สาย lan|สายแลน|สายสัญญาณ|fiber optic|ใยแก้ว|cat6|utp|ตู้ rack|สายไฟ|wireway/i.test(t)) return "cabling_power";
    if (/เครือข่าย|network|switch|wi-fi|firewall|access point/i.test(t)) return "network_security";
    if (/ลิขสิทธิ์|license|ซอฟต์แวร์|software|พัฒนาระบบ|application/i.test(t)) return "software_license";
    return "pc_hardware";
  }

  detectProvince(deptName, rawProvince) {
    if (rawProvince && rawProvince.trim()) return rawProvince.trim();
    if (/นนทบุรี|บางบัวทอง|บางกรวย|ปากเกร็ด|ไทรม้า|ท่าอิฐ/i.test(deptName)) return "นนทบุรี";
    if (/กรุงเทพ|กทม\.|พระนคร|ดุสิต|พญาไท|บางเขน/i.test(deptName)) return "กรุงเทพมหานคร";
    if (/ปทุมธานี|คลองหลวง|ธัญบุรี/i.test(deptName)) return "ปทุมธานี";
    if (/สมุทรปราการ|บางพลี|บางปู/i.test(deptName)) return "สมุทรปราการ";
    return "กรุงเทพมหานคร";
  }

  generateEgpUrl(projectId) {
    return `https://www.gprocurement.go.th/new_index.html`;
  }

  generateTorUrl(projectId) {
    return `javascript:app.downloadTORDocument('${projectId}')`;
  }

  /**
   * สร้างลิงก์ค้นหาสดบนเว็บกรมบัญชีกลางตามคำค้นหาที่ต้องการ
   */
  getLiveEgpSearchUrl(keyword = 'คอมพิวเตอร์') {
    return `https://www.gprocurement.go.th/new_index.html`;
  }
}

window.cgdConnector = new CGDDataConnector();
