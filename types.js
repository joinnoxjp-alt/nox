const TYPES = [
  {
    id: "LUNA",
    emoji: "🌙",
    image: "images/result-cards/luna-card.png",
    name: "LUNA",
    title: "ルナタイプ",
    desc: "癒し系で常連を作る才能。聞き上手で自然と指名が増える。",
    tags: ["癒し", "聞き上手", "常連"],
    stats: { 魅力: 95, 会話: 90, SNS: 65 }
  },
  {
    id: "PHOENIX",
    emoji: "🔥",
    image: "images/result-cards/phoenix-card.png",
    name: "PHOENIX",
    title: "フェニックスタイプ",
    desc: "圧倒的な存在感で売上を伸ばすカリスマ。",
    tags: ["カリスマ", "人気", "勢い"],
    stats: { 魅力: 98, 会話: 80, SNS: 92 }
  },
  {
    id: "QUEEN",
    emoji: "👑",
    image: "images/result-cards/queen-card.png",
    name: "QUEEN",
    title: "クイーンタイプ",
    desc: "高級店との相性が高いリーダータイプ。",
    tags: ["高級感", "品格", "自信"],
    stats: { 魅力: 94, 会話: 88, SNS: 84 }
  },
  {
    id: "MIRAGE",
    emoji: "🍸",
    image: "images/result-cards/3F0296CF-B614-483A-8A0F-7BD1D1F7B982.png",
    name: "MIRAGE",
    title: "ミラージュタイプ",
    desc: "追われる魅力を持つミステリアスな存在。",
    tags: ["神秘", "色気", "余裕"],
    stats: { 魅力: 96, 会話: 74, SNS: 89 }
  },
  {
    id: "DIAMOND",
    emoji: "💎",
    image: "images/result-cards/CE12649D-7604-47EF-943F-1074A3E888EF.png",
    name: "DIAMOND",
    title: "ダイヤタイプ",
    desc: "信頼を積み重ねて長く愛される実力派。",
    tags: ["信頼", "安定", "努力"],
    stats: { 魅力: 88, 会話: 86, SNS: 70 }
  },
  {
    id: "CHAMELEON",
    emoji: "🎭",
    image: "images/result-cards/chameleon-card.png",
    name: "CHAMELEON",
    title: "カメレオンタイプ",
    desc: "どんな相手にも合わせられる万能型。",
    tags: ["適応力", "会話", "万能"],
    stats: { 魅力: 86, 会話: 97, SNS: 76 }
  },
  {
    id: "STAR",
    emoji: "💫",
    image: "images/result-cards/60E60F32-DDCE-481C-9F92-0FC5AE62EA2E.png",
    name: "STAR",
    title: "スタータイプ",
    desc: "SNSでもリアルでも人気を集めやすい。",
    tags: ["SNS", "人気", "華"],
    stats: { 魅力: 92, 会話: 84, SNS: 99 }
  },
  {
    id: "BLOSSOM",
    emoji: "🌸",
    image: "images/result-cards/blossom-card.png",
    name: "BLOSSOM",
    title: "ブロッサムタイプ",
    desc: "未経験から着実に成長できる努力家。",
    tags: ["努力", "成長", "素直"],
    stats: { 魅力: 82, 会話: 83, SNS: 72 }
  },
  {
    id: "NOIR",
    emoji: "🌑",
    image: "images/result-cards/noir-card.png",
    name: "NOIR",
    title: "ノワールタイプ",
    desc: "静かな存在感で人を惹きつける夜の支配者。",
    tags: ["冷静", "神秘", "大人"],
    stats: { 魅力: 94, 会話: 82, SNS: 78 }
  },
  {
    id: "HUNTER",
    emoji: "🎯",
    image: "images/result-cards/hunter-card.png",
    name: "HUNTER",
    title: "ハンタータイプ",
    desc: "目標を決めたら一直線。結果を出す実力派。",
    tags: ["行動", "挑戦", "勝負"],
    stats: { 魅力: 91, 会話: 80, SNS: 82 }
  },
  {
    id: "REBEL",
    emoji: "⚡",
    image: "images/result-cards/rebel-card.png",
    name: "REBEL",
    title: "レベルタイプ",
    desc: "常識にとらわれない自由な発想が武器。",
    tags: ["自由", "個性", "革命"],
    stats: { 魅力: 90, 会話: 83, SNS: 94 }
  },
  {
    id: "ANGEL",
    emoji: "👼",
    image: "images/result-cards/angel-card.png",
    name: "ANGEL",
    title: "エンジェルタイプ",
    desc: "優しさと安心感で自然と人が集まる。",
    tags: ["優しさ", "癒し", "安心"],
    stats: { 魅力: 89, 会話: 94, SNS: 74 }
  },
  {
    id: "MUSE",
    emoji: "🎼",
    image: "images/result-cards/muse-card.png",
    name: "MUSE",
    title: "ミューズタイプ",
    desc: "人を魅了する芸術的センスを持つタイプ。",
    tags: ["芸術", "魅力", "感性"],
    stats: { 魅力: 96, 会話: 85, SNS: 91 }
  },
  {
    id: "MASTERMIND",
    emoji: "♟️",
    image: "images/result-cards/mastermind-card.png",
    name: "MASTERMIND",
    title: "マスターマインドタイプ",
    desc: "戦略的に物事を考え、成功へ導くタイプ。",
    tags: ["知性", "戦略", "分析"],
    stats: { 魅力: 88, 会話: 90, SNS: 76 }
  },
  {
    id: "TEMPTRESS",
    emoji: "❤️",
    image: "images/result-cards/temptress-card.png",
    name: "TEMPTRESS",
    title: "テンプトレスタイプ",
    desc: "色気と魅力で相手を惹きつけるタイプ。",
    tags: ["色気", "魅力", "人気"],
    stats: { 魅力: 99, 会話: 87, SNS: 90 }
  },
  {
    id: "JOKER",
    emoji: "🃏",
    image: "images/result-cards/joker-card.png",
    name: "JOKER",
    title: "ジョーカータイプ",
    desc: "予測不能な魅力で場を盛り上げるタイプ。",
    tags: ["ユーモア", "個性", "発想"],
    stats: { 魅力: 92, 会話: 96, SNS: 88 }
  }
];

const SUB_TYPES = [
  "Royal",
  "Velvet",
  "Noir",
  "Moon",
  "Gold"
];

function getSubType(score) {
  return SUB_TYPES[score % SUB_TYPES.length];
}

function buildResult(type, score) {
  const sub = getSubType(score);

  return {
    emoji: type.emoji,
    image: type.image,
    name: `${type.name}・${sub}`,
    title: `${type.title} (${sub})`,
    desc: type.desc,
    stats: [
      `💎 魅力 ${type.stats.魅力}%`,
      `💬 会話 ${type.stats.会話}%`,
      `📱 SNS ${type.stats.SNS}%`,
      `🌙 夜職適性 ${90 + (score % 10)}%`
    ],
    tags: [
      "#NOX診断",
      `#${type.name}`,
      `#${sub}`
    ]
  };
}

const JOB_MATCH = {
  LUNA: ["ラウンジ", "ガールズバー", "コンカフェ", "メンズエステ", "スナック"],
  PHOENIX: ["キャバクラ", "ガールズバー", "コンカフェ", "デリヘル", "ライブチャット"],
  QUEEN: ["クラブ", "ラウンジ", "キャバクラ", "ソープ", "スナック"],
  MIRAGE: ["ラウンジ", "クラブ", "メンズエステ", "キャバクラ", "デリヘル"],
  DIAMOND: ["ラウンジ", "クラブ", "キャバクラ", "スナック", "メンズエステ"],
  CHAMELEON: ["ガールズバー", "キャバクラ", "コンカフェ", "ラウンジ", "メンズエステ"],
  STAR: ["コンカフェ", "ガールズバー", "キャバクラ", "ライブチャット", "ラウンジ"],
  BLOSSOM: ["コンカフェ", "ガールズバー", "スナック", "ラウンジ", "メンズエステ"],
  NOIR: ["クラブ", "ラウンジ", "ソープ", "キャバクラ", "スナック"],
  HUNTER: ["キャバクラ", "デリヘル", "ガールズバー", "コンカフェ", "ライブチャット"],
  REBEL: ["ガールズバー", "キャバクラ", "ライブチャット", "コンカフェ", "デリヘル"],
  ANGEL: ["スナック", "ラウンジ", "ガールズバー", "コンカフェ", "メンズエステ"],
  MUSE: ["コンカフェ", "ガールズバー", "ラウンジ", "キャバクラ", "ライブチャット"],
  MASTERMIND: ["クラブ", "ラウンジ", "キャバクラ", "メンズエステ", "スナック"],
  TEMPTRESS: ["ソープ", "キャバクラ", "クラブ", "ラウンジ", "デリヘル"],
  JOKER: ["ガールズバー", "コンカフェ", "キャバクラ", "ライブチャット", "スナック"]
};
