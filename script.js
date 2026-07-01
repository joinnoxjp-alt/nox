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