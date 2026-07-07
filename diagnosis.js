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
  { text: "相手に合わせて話し方を変えられる？", type: "CHAMELEON" },
  { text: "癒し系と言われることがある？", type: "LUNA" },
  { text: "負けず嫌いな方？", type: "PHOENIX" },
  { text: "高級感のある場所に憧れる？", type: "QUEEN" },
  { text: "写真や動画で自分を見せるのが得意？", type: "STAR" },
  { text: "信頼関係を大事にする？", type: "DIAMOND" },
  { text: "全部を見せない方が魅力的だと思う？", type: "MIRAGE" },
  { text: "これから伸びたい気持ちが強い？", type: "BLOSSOM" },
  { text: "その場の空気を読むのが得意？", type: "CHAMELEON" },
  { text: "常連さんを大事にできるタイプ？", type: "LUNA" },
  { text: "人気者になりたい気持ちがある？", type: "STAR" },
  { text: "自分の魅力でしっかり稼ぎたい？", type: "PHOENIX" }
];

function startQuiz() {
  currentQuestion = 0;
  totalScore = 0;
  scores = {};

  TYPES.forEach(t => {
    scores[t.id] = 0;
  });

  document.getElementById("startScreen").classList.remove("active");
  document.getElementById("resultScreen").classList.remove("active");
  document.getElementById("quizScreen").classList.add("active");

  showQuestion();
}

function showQuestion() {
  const q = questions[currentQuestion];

  document.getElementById("questionCount").textContent =
    `${currentQuestion + 1} / ${questions.length}`;

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

function showResult() {
  document.getElementById("quizScreen").classList.remove("active");
  document.getElementById("resultScreen").classList.add("active");

  let topTypeId = Object.keys(scores).sort((a, b) => scores[b] - scores[a])[0];
  let topType = TYPES.find(t => t.id === topTypeId);

  const result = buildResult(topType, totalScore);
  const jobs = JOB_MATCH[topType.id] || [];

  document.getElementById("resultEmoji").textContent = result.emoji;
  document.getElementById("resultName").textContent = `あなたは ${result.name}`;
  document.getElementById("resultTitle").textContent = result.title;
  document.getElementById("resultDesc").textContent = result.desc;

  document.getElementById("statsArea").innerHTML =
    result.stats.map(s => `<div>${s}</div>`).join("");

  document.getElementById("tagArea").innerHTML =
    `
    ${result.tags.map(t => `<span>${t}</span>`).join("")}
    <span>おすすめ職種：${jobs.slice(0, 3).join(" / ")}</span>
    `;
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
