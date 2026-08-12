(function initializeEasyJobParser(globalObject) {
  const LABELS = {
    businessType: ["業種", "職種", "職種・業種"], area: ["エリア", "地域"],
    address: ["住所", "勤務地住所", "勤務地"], station: ["最寄り駅", "最寄駅", "駅"],
    workHours: ["営業時間", "勤務時間"], closedDay: ["定休日", "店休日"],
    storePr: ["店舗PR", "PR", "店舗紹介"], customers: ["客層"],
    averageSalary: ["平均時給", "時給"], hiringSalary: ["採用時給"], salarySystem: ["給料システム", "給与システム"],
    payDay: ["給料日", "給与日"], paymentMethod: ["支払い方法", "支払方法"],
    accompanyBack: ["同伴バック"], nominationBack: ["本指名バック"], inHouseBack: ["場内バック"],
    extensionBack: ["延長バック"], bottleBack: ["ボトルバック"], drinkBack: ["ドリンクバック"], otherBack: ["その他バック", "各種バック"],
    dailyPay: ["全額日払い", "日払い"], quota: ["ノルマ"], quotaPenalty: ["ノルマペナルティ"], attendancePenalty: ["勤怠ペナルティ"],
    incomeTax: ["所得税"], welfareFee: ["厚生費"], hairMake: ["ヘアメイク"], clothing: ["勤務時の服装", "服装"],
    pickup: ["送迎"], pickupArea: ["送迎エリア"], pickupTime: ["送迎時間"], dormitory: ["寮"], dormitoryArea: ["寮エリア"],
    requirements: ["採用条件", "応募条件"], identification: ["身分証明書", "必要身分証"],
    trialIdentification: ["体験時身分証", "体入時身分証", "体験入店時身分証"],
  };
  const aliasMap = new Map(Object.entries(LABELS).flatMap(([key, labels]) => labels.map((label) => [label, key])));
  const clean = (value, max = 5000) => String(value || "").replace(/<\/?[^>]+>/g, "").replace(/\u0000/g, "").trim().slice(0, max);
  function storeName(text) {
    const raw = clean(text.match(/《([^》]+)》/)?.[1] || "", 120);
    if (!raw) return "";
    const parts = raw.split("/").map((part) => part.trim()).filter(Boolean);
    return parts.length === 2 ? `${parts[0]}（${parts[1]}）` : raw;
  }
  function parseFields(text) {
    const result = {};
    const matches = [...String(text || "").matchAll(/【([^】]+)】\s*([^【■\n][^\n]*(?:\n(?!\s*(?:【|■))[^\n]*)*)?/g)];
    for (const match of matches) {
      const key = aliasMap.get(clean(match[1], 50));
      if (key && !(key in result)) result[key] = clean(match[2]);
    }
    return result;
  }
  const present = (value) => Boolean(clean(value));
  const isNo = (value) => /^(なし|無し|無|no)$/i.test(clean(value));
  function parse(text) {
    const originalText = String(text || "").slice(0, 50000);
    const fields = parseFields(originalText);
    fields.storeName = storeName(originalText);
    fields.salary = fields.averageSalary || fields.hiringSalary || "";
    const backs = [["同伴バック", fields.accompanyBack], ["本指名バック", fields.nominationBack], ["場内バック", fields.inHouseBack], ["延長バック", fields.extensionBack], ["ボトルバック", fields.bottleBack], ["ドリンクバック", fields.drinkBack], ["その他バック", fields.otherBack]]
      .filter(([, value]) => present(value)).map(([label, value]) => `${label}：${value}`).join("\n");
    const benefits = [["送迎", fields.pickup], ["送迎エリア", fields.pickupArea], ["送迎時間", fields.pickupTime], ["勤務時の服装", fields.clothing], ["ヘアメイク", fields.hairMake], ["寮", fields.dormitory], ["寮エリア", fields.dormitoryArea], ["全額日払い", fields.dailyPay], ["ノルマ", fields.quota], ["勤怠ペナルティ", fields.attendancePenalty]]
      .filter(([, value]) => present(value)).map(([label, value]) => `${label}：${value}`).join("\n");
    const femaleTypes = /ガールズバー|キャバクラ|ラウンジ|コンカフェ|スナック/;
    const nightTypes = /ガールズバー|キャバクラ|ラウンジ|コンカフェ|スナック|クラブ|ホスト/;
    const features = fields.salary ? fields.salary : backs ? "各種バックあり" : "";
    const noQuota = present(fields.quota) && isNo(fields.quota);
    const titleTail = [features, noQuota ? "ノルマなし" : ""].filter(Boolean).join("・");
    const title = `${fields.area ? `【${fields.area}】` : ""}${fields.businessType ? `${fields.businessType}「` : ""}${fields.storeName || "店舗"}${fields.businessType ? "」" : ""} キャスト募集${titleTail ? `｜${titleTail}` : ""}`.slice(0, 160);
    const sections = [];
    if (fields.area && fields.businessType && fields.storeName) sections.push(`${fields.area}の${fields.businessType}『${fields.storeName}』にてキャスト募集中。`);
    if (fields.storePr) sections.push(fields.storePr);
    const salaryLines = [["平均時給", fields.averageSalary], ["採用時給", fields.hiringSalary], ["給料システム", fields.salarySystem], ["給料日", fields.payDay], ["支払い方法", fields.paymentMethod], ["所得税", fields.incomeTax], ["厚生費", fields.welfareFee]].filter(([,v]) => present(v)).map(([k,v]) => `${k}：${v}`);
    if (salaryLines.length) sections.push(`【給与】\n${salaryLines.join("\n")}`);
    if (backs) sections.push(`【各種バック】\n${backs}`);
    if (benefits) sections.push(`【待遇】\n${benefits}`);
    const ids = [["身分証明書", fields.identification], ["体験時身分証", fields.trialIdentification]].filter(([,v]) => present(v)).map(([k,v]) => `${k}：${v}`);
    if (ids.length) sections.push(`【必要書類】\n${ids.join("\n")}`);
    sections.push("求人についてのご相談はNOX公式LINEよりお気軽にお問い合わせください。");
    return { ...fields, originalText, backs, benefits, title, description: sections.join("\n\n").slice(0, 5000), targetGender: femaleTypes.test(fields.businessType || "") ? "female" : "", businessScope: nightTypes.test(fields.businessType || "") ? "night" : "general", dailyPayValue: present(fields.dailyPay) ? String(!isNo(fields.dailyPay)) : "", beginner: /未経験歓迎|未経験者歓迎/.test(originalText) };
  }
  globalObject.NoxEasyJobParser = { parse };
  if (typeof module !== "undefined" && module.exports) module.exports = { parse };
})(typeof window !== "undefined" ? window : globalThis);
