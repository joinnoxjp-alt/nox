let currentQuestion = 0;
let scores = {};
let totalScore = 0;

// 40問・複数タイプ加点式
const questions = [
  {
    text: "初対面でも相手に合わせて話せる方？",
    scores: { CHAMELEON: 4, JOKER: 2, ANGEL: 1 }
  },
  {
    text: "聞き役になることが多い？",
    scores: { LUNA: 4, ANGEL: 3, DIAMOND: 1 }
  },
  {
    text: "人から目立つと言われる？",
    scores: { PHOENIX: 4, STAR: 3, TEMPTRESS: 2 }
  },
  {
    text: "落ち着いた雰囲気があると言われる？",
    scores: { QUEEN: 4, NOIR: 3, MASTERMIND: 2 }
  },
  {
    text: "SNSで発信するのが好き？",
    scores: { STAR: 4, REBEL: 3, MUSE: 2 }
  },
  {
    text: "コツコツ努力を続けられる？",
    scores: { DIAMOND: 4, BLOSSOM: 3, LUNA: 1 }
  },
  {
    text: "ミステリアスと言われることがある？",
    scores: { MIRAGE: 4, NOIR: 3, TEMPTRESS: 2 }
  },
  {
    text: "未経験でも挑戦してみたい気持ちがある？",
    scores: { BLOSSOM: 4, HUNTER: 2, STAR: 1 }
  },
  {
    text: "自分のペースで動くのが好き？",
    scores: { REBEL: 4, NOIR: 2, JOKER: 2 }
  },
  {
    text: "人に優しいと言われる？",
    scores: { ANGEL: 4, LUNA: 3, BLOSSOM: 1 }
  },

  {
    text: "大人っぽい雰囲気に憧れる？",
    scores: { QUEEN: 3, NOIR: 3, MIRAGE: 2 }
  },
  {
    text: "結果を出すためなら本気で頑張れる？",
    scores: { HUNTER: 4, PHOENIX: 3, DIAMOND: 2 }
  },
  {
    text: "落ち着いて相手の話を聞ける？",
    scores: { LUNA: 4, MASTERMIND: 2, ANGEL: 2 }
  },
  {
    text: "場を明るくするのが得意？",
    scores: { JOKER: 4, STAR: 3, CHAMELEON: 2 }
  },
  {
    text: "個性で勝負したい？",
    scores: { REBEL: 4, JOKER: 3, MUSE: 2 }
  },
  {
    text: "可愛い雰囲気と言われることがある？",
    scores: { BLOSSOM: 3, ANGEL: 3, STAR: 2 }
  },
  {
    text: "その場の空気を読むのが得意？",
    scores: { CHAMELEON: 4, LUNA: 2, MASTERMIND: 2 }
  },
  {
    text: "常連さんを大事にできるタイプ？",
    scores: { LUNA: 4, DIAMOND: 3, ANGEL: 2 }
  },
  {
    text: "人気者になりたい気持ちがある？",
    scores: { STAR: 4, PHOENIX: 3, TEMPTRESS: 2 }
  },
  {
    text: "自分の魅力でしっかり稼ぎたい？",
    scores: { PHOENIX: 4, TEMPTRESS: 3, HUNTER: 2 }
  },

  {
    text: "相手によって話し方を変えられる？",
    scores: { CHAMELEON: 4, MASTERMIND: 2, JOKER: 1 }
  },
  {
    text: "感情よりも冷静に考えることが多い？",
    scores: { MASTERMIND: 4, NOIR: 3, QUEEN: 1 }
  },
  {
    text: "色気があると言われたい？",
    scores: { TEMPTRESS: 4, MIRAGE: 3, QUEEN: 2 }
  },
  {
    text: "負けず嫌いな方？",
    scores: { HUNTER: 4, PHOENIX: 3, REBEL: 2 }
  },
  {
    text: "人と違う雰囲気を大事にしたい？",
    scores: { MUSE: 4, REBEL: 3, MIRAGE: 2 }
  },
  {
    text: "安心感があると言われる？",
    scores: { ANGEL: 4, LUNA: 3, DIAMOND: 2 }
  },
  {
    text: "高級感のある場所に憧れる？",
    scores: { QUEEN: 4, MIRAGE: 2, TEMPTRESS: 2 }
  },
  {
    text: "話すより雰囲気で惹きつける方？",
    scores: { NOIR: 4, MIRAGE: 3, MUSE: 2 }
  },
  {
    text: "ノリの良さには自信がある？",
    scores: { JOKER: 4, STAR: 3, REBEL: 2 }
  },
  {
    text: "人に合わせすぎて疲れることがある？",
    scores: { LUNA: 3, CHAMELEON: 3, ANGEL: 2 }
  },

  {
    text: "指名や人気を伸ばしたい気持ちが強い？",
    scores: { PHOENIX: 4, STAR: 3, HUNTER: 2 }
  },
  {
    text: "目標があると燃える？",
    scores: { HUNTER: 4, DIAMOND: 3, PHOENIX: 2 }
  },
  {
    text: "自分磨きが好き？",
    scores: { TEMPTRESS: 3, QUEEN: 3, STAR: 2 }
  },
  {
    text: "相談されることが多い？",
    scores: { LUNA: 4, ANGEL: 3, MASTERMIND: 2 }
  },
  {
    text: "自由に働ける環境が好き？",
    scores: { REBEL: 4, JOKER: 2, NOIR: 2 }
  },
  {
    text: "写真や見せ方にこだわる方？",
    scores: { STAR: 4, MUSE: 3, TEMPTRESS: 2 }
  },
  {
    text: "相手の気持ちを読むのが得意？",
    scores: { LUNA: 3, MIRAGE: 3, CHAMELEON: 2 }
  },
  {
    text: "自分だけの世界観があると思う？",
    scores: { MUSE: 4, NOIR: 3, REBEL: 2 }
  },
  {
    text: "安定して長く働きたい？",
    scores: { DIAMOND: 4, LUNA: 2, ANGEL: 2 }
  },
  {
    text: "夜の世界で一度は輝いてみたい？",
    scores: { PHOENIX: 3, STAR: 3, TEMPTRESS: 2, QUEEN: 2 }
  }
];

const options = [
  { label: "かなり当てはまる", point: 5 },
  { label: "当てはまる", point: 4 },
  { label: "どちらでもない", point: 3 },
  { label: "あまり当てはまらない", point: 2 },
  { label: "当てはまらない", point: 1 }
];

function startQuiz() {
  currentQuestion = 0;
  totalScore = 0;
  scores = {};

  TYPES.forEach(t => scores[t.id] = 0);

  document.getElementById("startScreen").classList.remove("active");
  document.getElementById("resultScreen").classList.remove("active");
  document.getElementById("quizScreen").classList.add("active");

  showQuestion();
}

function showQuestion() {
  const q = questions[currentQuestion];

  document.getElementById("questionCount").textContent =
    `Q.${currentQuestion + 1} / ${questions.length}`;

  document.getElementById("questionTitle").textContent = q.text;

  const optionsArea = document.getElementById("optionsArea");
  optionsArea.innerHTML = "";

  options.forEach(option => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = option.label;
    btn.onclick = () => answerQuestion(q.scores, option.point);
    optionsArea.appendChild(btn);
  });
}

function answerQuestion(questionScores, point) {
  const multiplier = point - 3;

  Object.keys(questionScores).forEach(type => {
    if (!scores[type]) scores[type] = 0;
    scores[type] += questionScores[type] * multiplier;
  });

  totalScore += point;
  currentQuestion++;

  if (currentQuestion >= questions.length) {
    showResult();
  } else {
    showQuestion();
  }
}

function percent(value) {
  return Math.min(99, Math.max(65, value));
}

function getTopType() {
  const sorted = Object.keys(scores)
    .map(id => ({ id, score: scores[id] }))
    .sort((a, b) => b.score - a.score);

  const highest = sorted[0].score;

  const candidates = sorted.filter(item => item.score >= highest - 2);

  const randomIndex = Math.floor(Math.random() * candidates.length);

  return candidates[randomIndex].id;
}

function showResult() {
  document.getElementById("quizScreen").classList.remove("active");
  document.getElementById("resultScreen").classList.add("active");

  const topTypeId = getTopType();
  const topType = TYPES.find(t => t.id === topTypeId) || TYPES[0];

  const result = buildResult(topType, totalScore + Math.abs(Math.round(scores[topTypeId] || 0)));
  const jobs = JOB_MATCH[topType.id] || [];

  const resultImage = document.getElementById("resultImage");
  const resultEmoji = document.getElementById("resultEmoji");

  resultEmoji.textContent = result.emoji;

  if (result.image) {
    resultImage.src = result.image;
    resultImage.onload = () => {
      resultImage.style.display = "block";
      resultEmoji.style.display = "none";
    };
    resultImage.onerror = () => {
      resultImage.style.display = "none";
      resultEmoji.style.display = "block";
    };
  }

  document.getElementById("resultName").textContent = `${result.emoji} ${result.name}`;
  document.getElementById("resultTitle").textContent = result.title;
  document.getElementById("resultDesc").textContent = result.desc;

  const charm = percent(topType.stats.魅力 + Math.floor((scores[topTypeId] || 0) % 4));
  const talk = percent(topType.stats.会話 + Math.floor((scores[topTypeId] || 0) % 3));
  const sns = percent(topType.stats.SNS + Math.floor((scores[topTypeId] || 0) % 5));
  const work = percent(88 + Math.abs(Math.round(scores[topTypeId] || 0)) % 12);

  document.getElementById("statsArea").innerHTML = `
    <div>💎 魅力 <strong>${charm}%</strong></div>
    <div>💬 会話 <strong>${talk}%</strong></div>
    <div>📱 SNS <strong>${sns}%</strong></div>
    <div>🌙 夜職適性 <strong>${work}%</strong></div>
  `;

  document.getElementById("tagArea").innerHTML = `
    ${result.tags.map(t => `<span>${t}</span>`).join("")}
    <span>おすすめ職種：${jobs.slice(0, 3).join(" / ")}</span>
  `;

  const detailArea = document.getElementById("detailArea");

  if (detailArea && window.TYPE_DETAILS && window.TYPE_DETAILS[topType.id]) {
    detailArea.innerHTML = window.TYPE_DETAILS[topType.id].description;
    detailArea.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

function shareResult() {
  const text = document.getElementById("resultName").textContent;
  const url = "https://joinnox.jp/ai-diagnosis.html";
  const shareUrl =
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text + "｜NOX TYPE 夜の性格診断")}&url=${encodeURIComponent(url)}`;
  window.open(shareUrl, "_blank");
}

function copyResult() {
  const resultName = document.getElementById("resultName").textContent;
  const resultTitle = document.getElementById("resultTitle").textContent;

  navigator.clipboard.writeText(
    `${resultName}\n${resultTitle}\nNOX TYPE 夜の性格診断\nhttps://joinnox.jp/ai-diagnosis.html`
  );

  alert("診断結果をコピーしました");
}

function restartQuiz() {
  document.getElementById("resultScreen").classList.remove("active");
  document.getElementById("startScreen").classList.add("active");
}

// ↓ここから追加（332行目）

async function saveResultImage() {
  const card = document.querySelector(".result-card");

  const canvas = await html2canvas(card, {
    backgroundColor: "#050505",
    scale: 2
  });

  const link = document.createElement("a");
  link.download = "NOX-TYPE.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}
