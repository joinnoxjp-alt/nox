// NOX script.js

import { db } from "./pages/firebase-db.js";

import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ===========================
   ページ読み込み
=========================== */

window.addEventListener("load", () => {
  const loading = document.getElementById("loading");

  if (loading) {
    setTimeout(() => {
      loading.classList.add("hide");
    }, 900);
  }

  revealOnScroll();
});

/* ===========================
   ヘッダー・スクロール演出
=========================== */

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
  const windowHeight = window.innerHeight;
  const revealPoint = 90;

  reveals.forEach((item) => {
    const itemTop = item.getBoundingClientRect().top;

    if (itemTop < windowHeight - revealPoint) {
      item.classList.add("active");
    }
  });
}

/* ===========================
   通知表示
=========================== */

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

/* ===========================
   ボタン押下演出
=========================== */

document.addEventListener("click", (event) => {
  const button = event.target.closest(
    ".btn, .job-card button, .sns-grid a"
  );

  if (!button) return;

  button.style.transform = "scale(0.96)";

  setTimeout(() => {
    button.style.transform = "";
  }, 160);
});

/* ===========================
   求人カードお気に入り用
=========================== */

document.addEventListener("dblclick", (event) => {
  const card = event.target.closest(".job-card");

  if (!card) return;

  showNotice("お気に入り機能は準備中です");
});

/* ===========================
   AI診断データ
=========================== */

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

if (adSlides.length > 0) {
  let currentAd = 0;

  function showAd(index) {
    if (!adSlides[index]) return;

    adSlides.forEach((slide) => {
      slide.classList.remove("active");
    });

    adDots.forEach((dot) => {
      dot.classList.remove("active");
    });

    adSlides[index].classList.add("active");

    if (adDots[index]) {
      adDots[index].classList.add("active");
    }

    currentAd = index;
  }

  adDots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      showAd(index);
    });
  });

  showAd(0);

  if (adSlides.length > 1) {
    setInterval(() => {
      currentAd += 1;

      if (currentAd >= adSlides.length) {
        currentAd = 0;
      }

      showAd(currentAd);
    }, 5500);
  }
}

/* ===========================
   HTML特殊文字の処理
=========================== */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ===========================
   求人画像取得
=========================== */

function getJobImage(job) {
  if (job.mainImage) return job.mainImage;
  if (job.imageUrl) return job.imageUrl;
  if (job.logoUrl) return job.logoUrl;
  if (job.storeImage) return job.storeImage;

  if (Array.isArray(job.images) && job.images.length > 0) {
    return job.images[0];
  }

  return "images/line_oa_chat_260708_192846.jpeg";
}

/* ===========================
   TOP 新着求人
=========================== */

const topJobs = document.getElementById("topNewJobs");

if (topJobs) {
  loadTopJobs();
}

async function loadTopJobs() {
  try {
    topJobs.innerHTML = "<p>求人情報を読み込んでいます...</p>";

    const snapshot = await getDocs(collection(db, "jobs"));
    const jobs = [];

    snapshot.forEach((documentSnapshot) => {
      const job = {
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      };

      // 承認済み求人のみ表示
      if (job.status !== "approved") return;

      // テスト求人を非表示
      const searchText = [
        job.storeName,
        job.name,
        job.title,
        job.shopName,
        job.storeTitle
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (searchText.includes("テスト")) return;
      if (searchText.includes("test")) return;
      if (searchText.includes("dummy")) return;

      jobs.push(job);
    });

    jobs.sort((jobA, jobB) => {
      const timeA =
        jobA.createdAt?.seconds ??
        jobA.approvedAt?.seconds ??
        0;

      const timeB =
        jobB.createdAt?.seconds ??
        jobB.approvedAt?.seconds ??
        0;

      return timeB - timeA;
    });

    const latestJobs = jobs.slice(0, 3);

    if (latestJobs.length === 0) {
      topJobs.innerHTML =
        '<p class="top-jobs-empty">現在、掲載準備中です。</p>';
      return;
    }

    topJobs.innerHTML = latestJobs
      .map((job) => {
        const storeName =
          job.storeName ||
          job.shopName ||
          job.storeTitle ||
          job.name ||
          "店舗名未設定";

        const area =
          job.area ||
          job.prefecture ||
          job.location ||
          "エリア未設定";

        const salary =
          job.salary ||
          job.salaryText ||
          job.hourlyWage ||
          job.hourlyPay ||
          "給与は詳細ページをご確認ください";

        const imageUrl = getJobImage(job);

        return `
          <div class="top-job-card">

            <img
              src="${escapeHtml(imageUrl)}"
              alt="${escapeHtml(storeName)}の求人画像"
              loading="lazy"
              onerror="this.onerror=null; this.src='images/line_oa_chat_260708_192846.jpeg';"
            >

            <div class="top-job-body">

              <h3>${escapeHtml(storeName)}</h3>

              <p>📍 ${escapeHtml(area)}</p>

              <p>💰 ${escapeHtml(salary)}</p>

              <a
                href="pages/job-detail.html?id=${encodeURIComponent(job.id)}"
                class="btn gold"
              >
                詳細を見る
              </a>

            </div>

          </div>
        `;
      })
      .join("");

  } catch (error) {
    console.error("TOP求人の読み込みエラー:", error);

    topJobs.innerHTML = `
      <p class="top-jobs-error">
        求人情報を読み込めませんでした。時間を置いて再度お試しください。
      </p>
    `;
  }
}
