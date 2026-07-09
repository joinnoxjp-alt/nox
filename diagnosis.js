let currentQuestion = 0;
let scores = {};
let totalScore = 0;

const questions = [
  { text: "初対面の人と話すのは得意？", type: "CHAMELEON" },
  { text: "聞き役になることが多い？", type: "LUNA" },
  { text: "人から目立つと言われる？", type: "PHOENIX" },
  { text: "落ち着いた雰囲気があると言われる？", type: "QUEEN" },
  { text: "SNSで発信するのが好き？", type: "STAR" },
  { text: "努力をコツコツ続けられる？", type: "DIAMOND" },
  { text: "ミステリアスと言われることがある？", type: "MIRAGE" },
  { text: "未経験でも挑戦してみたい気持ちが強い？", type: "BLOSSOM" },
  { text: "自分のペースで動くのが好き？", type: "WOLF" },
  { text: "人に優しいと言われる？", type: "ANGEL" },
  { text: "大人っぽい雰囲気がある？", type: "ROSE" },
  { text: "行動力がある方？", type: "THUNDER" },
  { text: "落ち着いて話を聞ける？", type: "ORBIT" },
  { text: "場を明るくするのが得意？", type: "MELODY" },
  { text: "個性で勝負したい？", type: "NOVA" },
  { text: "可愛い雰囲気と言われる？", type: "FAIRY" },
  { text: "その場の空気を読むのが得意？", type: "CHAMELEON" },
  { text: "常連さんを大事にできるタイプ？", type: "LUNA" },
  { text: "人気者になりたい気持ちがある？", type: "STAR" },
  { text: "自分の魅力でしっかり稼ぎたい？", type: "PHOENIX" }
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

  const options = [
    { label: "かなり当てはまる", point: 5 },
    { label: "当てはまる", point: 4 },
    { label: "どちらでもない", point: 3 },
    { label: "あまり当てはまらない", point: 2 },
    { label: "当てはまらない", point: 1 }
  ];

  options.forEach(option => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = option.label;
    btn.onclick = () => answerQuestion(q.type, option.point);
    optionsArea.appendChild(btn);
  });
}

function answerQuestion(type, point) {
  scores[type] += point;
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

function showResult() {
  document.getElementById("quizScreen").classList.remove("active");
  document.getElementById("resultScreen").classList.add("active");

  const topTypeId = Object.keys(scores).sort((a, b) => scores[b] - scores[a])[0];
  const topType = TYPES.find(t => t.id === topTypeId);
  const result = buildResult(topType, totalScore);
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

  const charm = percent(topType.stats.魅力);
  const talk = percent(topType.stats.会話);
  const sns = percent(topType.stats.SNS);
  const work = percent(90 + (totalScore % 10));

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
