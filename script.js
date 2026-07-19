// NOX script.js

import { db } from "./pages/firebase-db.js";
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ===========================
   基本設定
=========================== */

const AD_SLOT_COUNT = 6;
const AD_CHANGE_TIME = 5000;
const AD_CONTACT_URL = "https://lin.ee/waXmsqX";

let noxAds = [];
let currentAdIndex = 0;
let adInterval = null;

/* ===========================
   ページ読み込み
=========================== */

window.addEventListener("load", () => {
  const loading = document.getElementById("loading");

  if (loading) {
    setTimeout(() => {
      loading.classList.add("hide");

      setTimeout(() => {
        loading.style.display = "none";
      }, 700);
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
    header.classList.toggle(
      "scrolled",
      window.scrollY > 40
    );
  }

  revealOnScroll();
});

function revealOnScroll() {
  const reveals =
    document.querySelectorAll(".reveal");

  const windowHeight = window.innerHeight;
  const revealPoint = 90;

  reveals.forEach((item) => {
    const itemTop =
      item.getBoundingClientRect().top;

    if (itemTop < windowHeight - revealPoint) {
      item.classList.add("active");
    }
  });
}

/* ===========================
   通知表示
=========================== */

function showNotice(message) {
  const notice =
    document.getElementById("notice");

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

  if (!button) {
    return;
  }

  button.style.transform = "scale(0.96)";

  setTimeout(() => {
    button.style.transform = "";
  }, 160);
});

/* ===========================
   求人カードお気に入り用
=========================== */

document.addEventListener("dblclick", (event) => {
  const card =
    event.target.closest(".job-card");

  if (!card) {
    return;
  }

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

console.log(
  "NOX AI Questions Ready:",
  noxAiQuestions
);

/* ===========================
   HTML特殊文字処理
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
   広告掲載期間チェック
=========================== */

function isAdWithinPeriod(ad) {
  const now = new Date();

  if (ad.startDate) {
    const startDate = new Date(
      `${ad.startDate}T00:00:00`
    );

    if (
      !Number.isNaN(startDate.getTime()) &&
      now < startDate
    ) {
      return false;
    }
  }

  if (ad.endDate) {
    const endDate = new Date(
      `${ad.endDate}T23:59:59`
    );

    if (
      !Number.isNaN(endDate.getTime()) &&
      now > endDate
    ) {
      return false;
    }
  }

  return true;
}

/* ===========================
   空き広告枠
=========================== */

function createRecruitmentAd(slotNumber) {
  return {
    id: `recruitment${slotNumber}`,
    slot: slotNumber,
    isRecruitment: true,
    enabled: true,
    advertiserName: "NOX",
    title: "広告掲載企業・店舗様募集中",
    description:
      "あなたの企業・店舗・サービスをNOXでPRしませんか？",
    buttonText: "広告掲載のご相談",
    linkUrl: AD_CONTACT_URL,
    imageUrl: ""
  };
}

/* ===========================
   表示回数
=========================== */

async function countAdImpression(ad) {
  if (!ad || ad.isRecruitment) {
    return;
  }

  try {
    await updateDoc(
      doc(db, "ads", ad.id),
      {
        impressions: increment(1)
      }
    );
  } catch (error) {
    console.warn(
      "広告表示回数を記録できませんでした",
      error
    );
  }
}

/* ===========================
   クリック数
=========================== */

async function countAdClick(ad) {
  if (!ad || ad.isRecruitment) {
    return;
  }

  try {
    await updateDoc(
      doc(db, "ads", ad.id),
      {
        clicks: increment(1)
      }
    );
  } catch (error) {
    console.warn(
      "広告クリック数を記録できませんでした",
      error
    );
  }
}

/* ===========================
   契約広告を作成
=========================== */

function createContractAdSlide(ad, index) {
  const link = document.createElement("a");

  link.className =
    `nox-ad-slide ${
      index === 0 ? "active" : ""
    }`;

  link.href = ad.linkUrl || "#";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.dataset.index = String(index);

  if (ad.imageUrl) {
    link.innerHTML = `
      <img
        src="${escapeHtml(ad.imageUrl)}"
        alt="${escapeHtml(
          ad.title || `広告${ad.slot}`
        )}"
        loading="${index === 0 ? "eager" : "lazy"}"
      >
    `;
  } else {
    link.innerHTML = `
      <div class="nox-ad-content">

        <span class="nox-ad-badge">
          AD ${escapeHtml(ad.slot)}
        </span>

        <div class="nox-ad-text">
          <strong>
            ${escapeHtml(
              ad.title || "広告掲載中"
            )}
          </strong>

          <p>
            ${escapeHtml(
              ad.description || ""
            )}
          </p>
        </div>

        <span class="nox-ad-button">
          ${escapeHtml(
            ad.buttonText || "詳しく見る"
          )}
        </span>

      </div>
    `;
  }

  link.addEventListener("click", (event) => {
    if (!ad.linkUrl) {
      event.preventDefault();
    }

    countAdClick(ad);
  });

  return link;
}

/* ===========================
   広告募集中枠を作成
=========================== */

function createRecruitmentAdSlide(ad, index) {
  const link = document.createElement("a");

  link.className =
    `nox-ad-slide nox-ad-recruitment ${
      index === 0 ? "active" : ""
    }`;

  link.href = AD_CONTACT_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  link.innerHTML = `
    <div class="nox-ad-recruitment-inner">

      <span class="nox-ad-recruitment-slot">
        AD SPACE ${escapeHtml(ad.slot)}
      </span>

      <p class="nox-ad-recruitment-small">
        NOX PREMIUM ADVERTISEMENT
      </p>

      <strong>
        広告掲載企業・店舗様募集中
      </strong>

      <p>
        あなたの企業・店舗・サービスを、<br>
        NOXユーザーへ大きくPRしませんか？
      </p>

      <span class="nox-ad-recruitment-price">
        月額15,000円〜
      </span>

      <span class="nox-ad-button">
        広告掲載のご相談はこちら
      </span>

    </div>
  `;

  return link;
}

/* ===========================
   広告スライド作成
=========================== */

function createAdSlide(ad, index) {
  if (ad.isRecruitment) {
    return createRecruitmentAdSlide(
      ad,
      index
    );
  }

  return createContractAdSlide(
    ad,
    index
  );
}

/* ===========================
   広告ドット作成
=========================== */

function createAdDot(index) {
  const button =
    document.createElement("button");

  button.type = "button";
  button.className =
    index === 0 ? "active" : "";

  button.setAttribute(
    "aria-label",
    `広告${index + 1}を表示`
  );

  button.addEventListener("click", () => {
    showAd(index);
    restartAdInterval();
  });

  return button;
}

/* ===========================
   指定広告を表示
=========================== */

function showAd(index) {
  const slider =
    document.getElementById("noxAdSlider");

  const dotsContainer =
    document.getElementById("noxAdDots");

  if (!slider || !dotsContainer) {
    return;
  }

  const slides =
    slider.querySelectorAll(".nox-ad-slide");

  const dots =
    dotsContainer.querySelectorAll("button");

  if (slides.length === 0) {
    return;
  }

  if (index >= slides.length) {
    index = 0;
  }

  if (index < 0) {
    index = slides.length - 1;
  }

  slides.forEach((slide, slideIndex) => {
    slide.classList.toggle(
      "active",
      slideIndex === index
    );
  });

  dots.forEach((dot, dotIndex) => {
    dot.classList.toggle(
      "active",
      dotIndex === index
    );
  });

  currentAdIndex = index;

  countAdImpression(
    noxAds[currentAdIndex]
  );
}

/* ===========================
   次の広告
=========================== */

function showNextAd() {
  if (noxAds.length <= 1) {
    return;
  }

  const nextIndex =
    (currentAdIndex + 1) %
    noxAds.length;

  showAd(nextIndex);
}

/* ===========================
   自動切り替え
=========================== */

function startAdInterval() {
  if (noxAds.length <= 1) {
    return;
  }

  adInterval = window.setInterval(
    showNextAd,
    AD_CHANGE_TIME
  );
}

function restartAdInterval() {
  if (adInterval) {
    window.clearInterval(adInterval);
  }

  startAdInterval();
}

/* ===========================
   Firestoreから広告①〜⑥取得
=========================== */

async function loadNoxAdvertisements() {
  const adArea =
    document.getElementById("noxAdArea");

  const slider =
    document.getElementById("noxAdSlider");

  const dotsContainer =
    document.getElementById("noxAdDots");

  if (!adArea || !slider || !dotsContainer) {
    return;
  }

  slider.innerHTML = `
    <div class="nox-ad-empty">
      広告を読み込んでいます...
    </div>
  `;

  dotsContainer.innerHTML = "";

  try {
    const completedSlots = [];

    for (
      let slotNumber = 1;
      slotNumber <= AD_SLOT_COUNT;
      slotNumber++
    ) {
      const adId = `slot${slotNumber}`;

      const adSnapshot = await getDoc(
        doc(db, "ads", adId)
      );

      if (adSnapshot.exists()) {
        const adData = {
          id: adSnapshot.id,
          slot: slotNumber,
          ...adSnapshot.data()
        };

        const hasContent =
          Boolean(adData.imageUrl) ||
          Boolean(adData.title);

        const canDisplay =
          adData.enabled === true &&
          hasContent &&
          isAdWithinPeriod(adData);

        if (canDisplay) {
          completedSlots.push(adData);
          continue;
        }
      }

      completedSlots.push(
        createRecruitmentAd(slotNumber)
      );
    }

    noxAds = completedSlots;

    slider.innerHTML = "";
    dotsContainer.innerHTML = "";

    noxAds.forEach((ad, index) => {
      slider.appendChild(
        createAdSlide(ad, index)
      );

      dotsContainer.appendChild(
        createAdDot(index)
      );
    });

    currentAdIndex = 0;

    showAd(0);
    startAdInterval();

  } catch (error) {
    console.error(
      "広告読み込みエラー",
      error
    );

    noxAds = [];

    for (
      let slotNumber = 1;
      slotNumber <= AD_SLOT_COUNT;
      slotNumber++
    ) {
      noxAds.push(
        createRecruitmentAd(slotNumber)
      );
    }

    slider.innerHTML = "";
    dotsContainer.innerHTML = "";

    noxAds.forEach((ad, index) => {
      slider.appendChild(
        createAdSlide(ad, index)
      );

      dotsContainer.appendChild(
        createAdDot(index)
      );
    });

    showAd(0);
    startAdInterval();
  }
}

/* ===========================
   タブ非表示中の自動切替停止
=========================== */

document.addEventListener(
  "visibilitychange",
  () => {
    if (document.hidden) {
      if (adInterval) {
        window.clearInterval(adInterval);
      }
    } else {
      restartAdInterval();
    }
  }
);

/* ===========================
   求人画像取得
=========================== */

function getJobImage(job) {
  if (job.mainImage) return job.mainImage;
  if (job.imageUrl) return job.imageUrl;
  if (job.image) return job.image;
  if (job.logoUrl) return job.logoUrl;
  if (job.storeImage) return job.storeImage;

  if (
    Array.isArray(job.images) &&
    job.images.length > 0
  ) {
    const validImage =
      job.images.find((image) => {
        return (
          typeof image === "string" &&
          image.trim() !== ""
        );
      });

    if (validImage) {
      return validImage;
    }
  }

  return "images/7240C21C-E2E7-47E1-9F48-6ECC3468406D.png";
}

/* ==========================
   TOP 注目求人
========================== */

const topJobs =
  document.getElementById("topNewJobs");

const pickupFemaleButton =
  document.getElementById(
    "pickupFemaleButton"
  );

const pickupMaleButton =
  document.getElementById(
    "pickupMaleButton"
  );

let allTopFeaturedJobs = [];
let selectedPickupGender = "female";

if(topJobs){
  loadTopJobs();
}

function getPickupGender(job){

  const targetGender =
    String(
      job.targetGender ||
      job.jobAudience ||
      job.gender ||
      job.audience ||
      ""
    ).toLowerCase();

  if(
    targetGender === "male" ||
    targetGender === "men" ||
    targetGender === "男性" ||
    targetGender === "男性向け"
  ){
    return "male";
  }

  if(
    targetGender === "female" ||
    targetGender === "women" ||
    targetGender === "女性" ||
    targetGender === "女性向け"
  ){
    return "female";
  }

  const maleSearchText = [
    job.businessType,
    job.jobType,
    job.position,
    job.title,
    job.storeName,
    job.shopName
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const maleKeywords = [
    "ホスト",
    "ボーイズバー",
    "メンズコンカフェ",
    "メンコン",
    "黒服",
    "内勤",
    "幹部候補",
    "店長候補",
    "ドライバー"
  ];

  const isMaleJob =
    maleKeywords.some(
      (keyword) =>
        maleSearchText.includes(
          keyword.toLowerCase()
        )
    );

  return isMaleJob
    ? "male"
    : "female";
}

function setPickupGender(gender){

  selectedPickupGender = gender;

  if(pickupFemaleButton){

    pickupFemaleButton.classList.toggle(
      "gold",
      gender === "female"
    );

    pickupFemaleButton.classList.toggle(
      "ghost",
      gender !== "female"
    );
  }

  if(pickupMaleButton){

    pickupMaleButton.classList.toggle(
      "gold",
      gender === "male"
    );

    pickupMaleButton.classList.toggle(
      "ghost",
      gender !== "male"
    );
  }

  renderTopJobs();

  if(topJobs){
    topJobs.scrollTo({
      left:0,
      behavior:"smooth"
    });
  }
}

async function loadTopJobs(){

  try{

    topJobs.innerHTML = `
      <p class="jobs-loading">
        注目求人を読み込んでいます...
      </p>
    `;

    const snapshot =
      await getDocs(
        collection(db,"jobs")
      );

    const jobs = [];

    snapshot.forEach(
      (documentSnapshot) => {

        const job = {
          id:documentSnapshot.id,
          ...documentSnapshot.data()
        };

        if(job.status !== "approved"){
          return;
        }

        if(job.topFeatured !== true){
          return;
        }

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

        if(searchText.includes("テスト")){
          return;
        }

        if(searchText.includes("test")){
          return;
        }

        if(searchText.includes("dummy")){
          return;
        }

        if(searchText.includes("nox店舗")){
          return;
        }

        if(searchText.includes("nox確認店")){
          return;
        }

        jobs.push({
          ...job,
          resolvedPickupGender:
            getPickupGender(job)
        });
      }
    );

    jobs.sort((jobA,jobB) => {

      const orderA =
        typeof jobA.topOrder === "number"
          ? jobA.topOrder
          : 9999;

      const orderB =
        typeof jobB.topOrder === "number"
          ? jobB.topOrder
          : 9999;

      if(orderA !== orderB){
        return orderA - orderB;
      }

      const timeA =
        jobA.topFeaturedAt?.seconds ??
        jobA.approvedAt?.seconds ??
        jobA.createdAt?.seconds ??
        0;

      const timeB =
        jobB.topFeaturedAt?.seconds ??
        jobB.approvedAt?.seconds ??
        jobB.createdAt?.seconds ??
        0;

      return timeB - timeA;
    });

    allTopFeaturedJobs = jobs;

    renderTopJobs();

  }catch(error){

    console.error(
      "TOP注目求人の読み込みエラー:",
      error
    );

    topJobs.innerHTML = `
      <p class="top-jobs-error">
        求人情報を読み込めませんでした。
      </p>
    `;
  }
}

function renderTopJobs(){

  if(!topJobs){
    return;
  }

  const featuredJobs =
    allTopFeaturedJobs
      .filter(
        (job) =>
          job.resolvedPickupGender ===
          selectedPickupGender
      )
      .slice(0,6);

  if(featuredJobs.length === 0){

    const genderLabel =
      selectedPickupGender === "male"
        ? "男性向け"
        : "女性向け";

    topJobs.innerHTML = `
      <div
        class="top-jobs-empty"
        style="
          flex:0 0 100%;
          text-align:center;
          padding:50px 18px;
        "
      >
        <p>
          現在、${genderLabel}の注目求人を準備中です。
        </p>
      </div>
    `;

    return;
  }

  topJobs.innerHTML =
    featuredJobs
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

        const imageUrl =
          getJobImage(job);

        const genderLabel =
          job.resolvedPickupGender === "male"
            ? "MEN'S PICK UP"
            : "PICK UP";

        return `
          <div
            class="top-job-card"
            style="
              flex:0 0 min(86vw,420px);
              scroll-snap-align:start;
            "
          >

            <div class="top-featured-label">
              ${escapeHtml(genderLabel)}
            </div>

            <img
              src="${escapeHtml(imageUrl)}"
              alt="${escapeHtml(storeName)}の求人画像"
              loading="lazy"
              onerror="this.onerror=null;this.style.display='none';"
            >

            <div class="top-job-body">

              <h3>
                ${escapeHtml(storeName)}
              </h3>

              <p>
                📍 ${escapeHtml(area)}
              </p>

              <p>
                💰 ${escapeHtml(salary)}
              </p>

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
}

if(pickupFemaleButton){

  pickupFemaleButton.addEventListener(
    "click",
    () => {
      setPickupGender("female");
    }
  );
}

if(pickupMaleButton){

  pickupMaleButton.addEventListener(
    "click",
    () => {
      setPickupGender("male");
    }
  );
}

/* ===========================
   初期実行
=========================== */

loadNoxAdvertisements();
/* ==========================
   MEMBER LOUNGE
========================== */


const memberLoungeSection =
  document.getElementById(
    "memberLoungeSection"
  );

const memberWelcomeTitle =
  document.getElementById(
    "memberWelcomeTitle"
  );
const savedJobsCount =
  document.getElementById(
    "savedJobsCount"
  );

const offersCount =
  document.getElementById(
    "offersCount"
  );

const applicationsCount =
  document.getElementById(
    "applicationsCount"
  );
onAuthStateChanged(
  auth,
  async (user) => {

    if(!memberLoungeSection){
      return;
    }

    if(!user){

      memberLoungeSection.style.display =
        "none";

      return;
    }

    memberLoungeSection.style.display =
      "block";

    let displayName =
      user.displayName ||
      "会員";

    try{

      const userSnapshot =
        await getDoc(
          doc(
            db,
            "users",
            user.uid
          )
        );
const userData =
  userSnapshot.exists()
    ? userSnapshot.data()
    : {};

const savedJobIds =
  Array.isArray(
    userData.savedJobIds
  )
    ? userData.savedJobIds
    : [];

if(savedJobsCount){

  savedJobsCount.textContent =
    `${savedJobIds.length}件`;

}
      if(userSnapshot.exists()){

        displayName =
          userData.displayName ||
          userData.name ||
          userData.nickname ||
          displayName;
      }

    }catch(error){

      console.error(
        "会員情報読み込みエラー:",
        error
      );
    }

    if(memberWelcomeTitle){

      memberWelcomeTitle.textContent =
        `${displayName}さん、おかえりなさい`;
    }
  }
);
