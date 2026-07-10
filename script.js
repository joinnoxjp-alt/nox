
// NOX script.js

window.addEventListener("load", () => {
  const loading = document.getElementById("loading");

  if (loading) {
    setTimeout(() => {
      loading.classList.add("hide");
    }, 900);
  }

  revealOnScroll();
});

const header = document.querySelector(".site-header");

window.addEventListener("scroll", () => {
  if (header) {
    if (window.scrollY > 40) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  }

  revealOnScroll();
});

function revealOnScroll() {
  const reveals = document.querySelectorAll(".reveal");

  reveals.forEach((item) => {
    const windowHeight = window.innerHeight;
    const itemTop = item.getBoundingClientRect().top;
    const revealPoint = 90;

    if (itemTop < windowHeight - revealPoint) {
      item.classList.add("active");
    }
  });
}

function showNotice(message) {
  const notice = document.getElementById("notice");

  if (!notice) {
    alert(message);
    return;
  }

  notice.textContent = message;
  notice.classList.add("show");

  setTimeout(() => {
    notice.classList.remove("show");
  }, 2600);
}

// ボタン押下の高級感演出
document.querySelectorAll(".btn, .job-card button, .sns-grid a").forEach((el) => {
  el.addEventListener("click", () => {
    el.style.transform = "scale(0.96)";

    setTimeout(() => {
      el.style.transform = "";
    }, 160);
  });
});

// 求人カードお気に入り用の土台
document.querySelectorAll(".job-card").forEach((card) => {
  card.addEventListener("dblclick", () => {
    showNotice("お気に入り機能は準備中です");
  });
});

// AI診断データの土台
const noxAiQuestions = [
  "年齢",
  "働きたいエリア",
  "時給の希望",
  "希望業種",
  "寮希望",
  "日払い希望",
  "未経験か経験者か",
  "お酒は飲める？",
  "ノルマなし希望？",
  "送り希望？"
];

console.log("NOX AI Questions Ready:", noxAiQuestions);
/* ===========================
   NOX 広告ローテーション
=========================== */

const adSlides = document.querySelectorAll(".nox-ad-slide");
const adDots = document.querySelectorAll(".nox-ad-dots button");

if (adSlides.length) {

  let currentAd = 0;

  function showAd(index){

    adSlides.forEach(slide => slide.classList.remove("active"));

    adDots.forEach(dot => dot.classList.remove("active"));

    adSlides[index].classList.add("active");

    if(adDots[index]){
      adDots[index].classList.add("active");
    }

    currentAd = index;
  }

  adDots.forEach((dot,index)=>{

    dot.addEventListener("click",()=>{

      showAd(index);

    });

  });

  setInterval(()=>{

    currentAd++;

    if(currentAd>=adSlides.length){

      currentAd=0;

    }

    showAd(currentAd);

  },5500);

}
/* ===========================
   TOP 新着求人
=========================== */

import { db } from "./pages/firebase-db.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const topJobs = document.getElementById("topNewJobs");

if (topJobs) {

  loadTopJobs();

  async function loadTopJobs() {

    const snap = await getDocs(collection(db, "jobs"));

    let jobs = [];
        snap.forEach((doc) => {

      const job = {
        id: doc.id,
        ...doc.data()
      };

      if (job.status !== "approved") return;

      const text =
        `${job.storeName || ""}
        ${job.name || ""}
        ${job.title || ""}
        ${job.shopName || ""}
        ${job.storeTitle || ""}`;

      if (text.includes("テスト")) return;
      if (text.toLowerCase().includes("test")) return;
      if (text.toLowerCase().includes("dummy")) return;

      jobs.push(job);

    });

    jobs.sort((a, b) => {
      const da = a.createdAt?.seconds || 0;
      const db = b.createdAt?.seconds || 0;
      return db - da;
    });

    jobs = jobs.slice(0, 3);
        if (jobs.length === 0) {
      topJobs.innerHTML = "<p>まだ求人がありません。</p>";
      return;
    }

    topJobs.innerHTML = "";

    jobs.forEach(job => {

      topJobs.innerHTML += `
      <div class="top-job-card">

        <img
src="${job.imageUrl || job.image || 'images/line_oa_chat_260708_192846.jpeg'}"
alt="${job.storeName || job.name || '求人画像'}"
onerror="this.src='images/line_oa_chat_260708_192846.jpeg';"
/>
/>

        <div class="top-job-body">

          <h3>${job.storeName || job.name || "店舗名未設定"}</h3>

          <p>📍 ${job.area || "-"}</p>

          <p>💰 ${job.salary || job.salaryText || "給与未設定"}</p>

          <a href="pages/job-detail.html?id=${job.id}" class="btn gold">
            詳細を見る
          </a>

        </div>

      </div>
      `;

    });
      }

}
