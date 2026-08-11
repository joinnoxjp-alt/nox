// NOX DAY script.js

import { db } from "../pages/firebase-db.js";

import "../analytics.js";
import {
  doc,
  getDoc
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
   掲載期間チェック
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
   広告募集中の空き枠
=========================== */

function createRecruitmentAd(slotNumber) {
  return {
    id: `dayRecruitment${slotNumber}`,
    slot: slotNumber,
    isRecruitment: true,
    enabled: true,
    title: "広告掲載企業様募集中",
    description:
      "企業・店舗・サービスをNOXの一般求人サイトでPRしませんか？",
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

  const slide = document.querySelector(`.nox-ad-slide[data-ad-id="${CSS.escape(ad.id)}"]`);
  window.noxAnalytics?.trackAdImpression(ad.id, slide);
}

/* ===========================
   クリック数
=========================== */

async function countAdClick(ad) {
  if (!ad || ad.isRecruitment) {
    return;
  }

  await window.noxAnalytics?.trackAdClick(ad.id);
}

/* ===========================
   契約広告スライド
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
  link.dataset.adId = ad.id;

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
   募集中広告スライド
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
        DAY AD SPACE ${escapeHtml(ad.slot)}
      </span>

      <p class="nox-ad-recruitment-small">
        NOX GENERAL JOBS ADVERTISEMENT
      </p>

      <strong>
        広告掲載企業様募集中
      </strong>

      <p>
        企業・店舗・サービスを、<br>
        NOXの一般求人ユーザーへPRしませんか？
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
   広告スライド振り分け
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
   ドット作成
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

  if (adInterval) {
    window.clearInterval(adInterval);
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
   Firestoreから昼職広告取得
=========================== */

async function loadDayAdvertisements() {
  const slider =
    document.getElementById("noxAdSlider");

  const dotsContainer =
    document.getElementById("noxAdDots");

  if (!slider || !dotsContainer) {
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
      const adId =
        `daySlot${slotNumber}`;

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
      "昼職広告読み込みエラー",
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

    currentAdIndex = 0;

    showAd(0);
    startAdInterval();
  }
}

/* ===========================
   タブ非表示中は停止
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
   初期実行
=========================== */

loadDayAdvertisements();
