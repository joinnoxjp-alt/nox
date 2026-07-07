const TYPES = [
{
id:"LUNA",
emoji:"🌙",
name:"LUNA",
title:"ルナタイプ",
desc:"癒し系で常連を作る才能。聞き上手で自然と指名が増える。",
tags:["癒し","聞き上手","常連"],
stats:{魅力:95,会話:90,SNS:65}
},
{
id:"DIAMOND",
emoji:"💎",
name:"DIAMOND",
title:"ダイヤタイプ",
desc:"信頼を積み重ねて長く愛される実力派。",
tags:["信頼","安定","努力"],
stats:{魅力:88,会話:86,SNS:70}
},
{
id:"PHOENIX",
emoji:"🔥",
name:"PHOENIX",
title:"フェニックスタイプ",
desc:"圧倒的な存在感で売上を伸ばすカリスマ。",
tags:["カリスマ","人気","勢い"],
stats:{魅力:98,会話:80,SNS:92}
},
{
id:"QUEEN",
emoji:"👑",
name:"QUEEN",
title:"クイーンタイプ",
desc:"高級店との相性が高いリーダータイプ。",
tags:["高級感","品格","自信"],
stats:{魅力:94,会話:88,SNS:84}
},
{
id:"MIRAGE",
emoji:"🍸",
name:"MIRAGE",
title:"ミラージュタイプ",
desc:"追われる魅力を持つミステリアスな存在。",
tags:["神秘","色気","余裕"],
stats:{魅力:96,会話:74,SNS:89}
},
{
id:"CHAMELEON",
emoji:"🎭",
name:"CHAMELEON",
title:"カメレオンタイプ",
desc:"どんな相手にも合わせられる万能型。",
tags:["適応力","会話","万能"],
stats:{魅力:86,会話:97,SNS:76}
},
{
id:"STAR",
emoji:"💫",
name:"STAR",
title:"スタータイプ",
desc:"SNSでもリアルでも人気を集めやすい。",
tags:["SNS","人気","華"],
stats:{魅力:92,会話:84,SNS:99}
},
{
id:"BLOSSOM",
emoji:"🌸",
name:"BLOSSOM",
title:"ブロッサムタイプ",
desc:"未経験から着実に成長できる努力家。",
tags:["努力","成長","素直"],
stats:{魅力:82,会話:83,SNS:72}
}
];
const SUB_TYPES = [
"Royal",
"Velvet",
"Noir",
"Moon",
"Gold"
];

function getSubType(score){
return SUB_TYPES[score % 5];
}
function buildResult(type, score){

const sub = getSubType(score);

return {
emoji: type.emoji,
name: `${type.name}・${sub}`,
title: `${type.title} (${sub})`,
desc: type.desc,
stats: [
"魅力 ★★★★★",
"人気 ★★★★☆",
"指名力 ★★★★★",
"SNS ★★★★☆"
],
tags:[
"#NOX診断",
`#${type.name}`,
`#${sub}`
]
};

}
const JOB_MATCH = {
  LUNA:["ガールズバー","ラウンジ","コンカフェ","メンズエステ","スナック"],
  DIAMOND:["ラウンジ","クラブ","キャバクラ","スナック","メンズエステ"],
  PHOENIX:["キャバクラ","ガールズバー","コンカフェ","デリヘル","ライブチャット"],
  QUEEN:["クラブ","ラウンジ","キャバクラ","ソープ","スナック"],
  MIRAGE:["ラウンジ","クラブ","メンズエステ","キャバクラ","デリヘル"],
  CHAMELEON:["ガールズバー","キャバクラ","コンカフェ","ラウンジ","メンズエステ"],
  STAR:["コンカフェ","ガールズバー","キャバクラ","ライブチャット","ラウンジ"],
  BLOSSOM:["コンカフェ","ガールズバー","スナック","ラウンジ","メンズエステ"]
};
