import {db} from "./firebase-db.js";
import {collection,doc,getDoc,getDocs,query,where,orderBy} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
export const BRAND_ID="mireio";
export const initialProducts=[
 {id:"mist",shortName:"MIST",name:"Mirèio ミルアジュ ラクトバチルス保湿ミスト",volume:"100mL",price:3600,janCode:"8800298230002",description:"きめ細かなミストで、肌にうるおいを与えて整えます。",displayOrder:1},
 {id:"ampoule",shortName:"AMPOULE",name:"MIRÈIO リバイタライズ アンプル",volume:"30mL",price:8000,janCode:"8800298230019",description:"いつものお手入れに取り入れやすい、なめらかな使用感の美容液です。",displayOrder:2},
 {id:"cream",shortName:"CREAM",name:"MIRÈIO モイスチャライジング ラディアント クリーム",volume:"50g",price:6400,janCode:"8800298230026",description:"肌にうるおいを与え、毎日の保湿ケアを心地よく仕上げます。",displayOrder:3},
 {id:"three-step-set",shortName:"3STEP SET",name:"MIRÈIO 3点セット",volume:"MIST + AMPOULE + CREAM",price:18000,janCode:"",description:"3STEPで始めるプレミアムケア。",displayOrder:4,isSetProduct:true,setProductIds:["mist","ampoule","cream"]}
];
export const initialBrand={brandName:"MIRÈIO",brandNameJa:"ミルアジュ",partnerLabel:"NOX公式パートナーブランド",catchCopy:"魅せる肌を目指す方 必見。",subCopy:"韓国発プレミアムスキンケアブランド",description:"NOXでは、美容意識の高いユーザーの皆様へ新しい選択肢を届けるため、韓国発スキンケアブランドMIRÈIOと公式パートナー提携しました。",story:"MIRÈIOは韓国発のプレミアムスキンケアブランド。毎日続けやすい3STEPで、肌にうるおいを与え、すこやかに整えるケアを提案します。",trustText:"販売事業者から提供された商品情報・資料を確認のうえ掲載しています。",isPublic:false};
export async function getBrand(){try{const s=await getDoc(doc(db,"beautyBrands",BRAND_ID));return s.exists()?{id:s.id,...s.data()}:{...initialBrand,isPublic:false}}catch{return{...initialBrand,isPublic:false}}}
export async function getBrands(){try{const s=await getDocs(query(collection(db,"beautyBrands"),where("isPublic","==",true)));return s.docs.map(d=>({id:d.id,...d.data()}))}catch{return[]}}
export async function getProducts(){try{const s=await getDocs(query(collection(db,"beautyProducts"),where("brandId","==",BRAND_ID),where("isPublic","==",true),orderBy("displayOrder")));return s.docs.map(d=>({id:d.id,...d.data()}))}catch{return[]}}
export async function getProduct(id){try{const s=await getDoc(doc(db,"beautyProducts",id));if(s.exists()&&s.data().isPublic===true)return{id:s.id,...s.data()}}catch{}return null}
export function yen(v){return `${Number(v||0).toLocaleString("ja-JP")}円（税込）`}
export function safeUrl(v){return typeof v==="string"&&/^https:\/\//.test(v)?v:""}
export function mediaMarkup(media,alt=""){if(!media||media.isVisible===false||!safeUrl(media.url))return"";return media.type==="video"?`<video controls muted playsinline preload="metadata" ${safeUrl(media.posterUrl)?`poster="${safeUrl(media.posterUrl)}"`:""}><source src="${safeUrl(media.url)}" type="video/mp4"></video>`:`<img src="${safeUrl(media.url)}" alt="${String(alt).replace(/[&<>\"]/g,"")}" loading="lazy">`}
