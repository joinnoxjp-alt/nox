import { app } from "./firebase-db.js";
import { getProducts, yen } from "./beauty-data.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
const form=document.querySelector("[data-order-form]"),select=form.productId,qty=form.quantity,summary=document.querySelector("[data-summary]"),status=document.querySelector("[data-status]"),confirmButton=document.querySelector("[data-confirm]"),submitButton=document.querySelector("[data-submit]"),editButton=document.querySelector("[data-edit]");
const products=await getProducts(),requested=new URLSearchParams(location.search).get("product");let confirmedData=null;
if (!products.length) {
  form.innerHTML = '<p class="empty">現在購入できる商品はありません。</p>';
  throw new Error("No public beauty products");
}
select.innerHTML=products.map(p=>`<option value="${p.id}" ${p.id===requested?"selected":""}>${p.name}（${yen(p.price)}）</option>`).join("");
function selected(){return products.find(p=>p.id===select.value)}
function render(){const p=selected(),n=Math.max(1,Number(qty.value)||1);summary.innerHTML=`<b>${p?.name||""}</b><br>商品小計：${yen((p?.price||0)*n)}<br>送料：注文受付後に確定<br><small>※最終合計と振込先は受付後のご案内をご確認ください。</small>`}
select.addEventListener("change",render);qty.addEventListener("input",render);render();
function lock(v){form.querySelectorAll("input,textarea").forEach(x=>{if(x.type!=="checkbox")x.readOnly=v});select.disabled=v;confirmButton.hidden=v;submitButton.hidden=!v;editButton.hidden=!v}
confirmButton.addEventListener("click",()=>{if(!form.reportValidity())return;confirmedData=Object.fromEntries(new FormData(form));confirmedData.productId=select.value;confirmedData.quantity=Number(qty.value);lock(true);status.textContent="内容をご確認のうえ「注文を確定」を押してください。"});
editButton.addEventListener("click",()=>{lock(false);confirmedData=null;status.textContent=""});
form.addEventListener("submit",async e=>{e.preventDefault();submitButton.disabled=true;status.textContent="送信中です…";try{const data={...confirmedData,agreed:form.agreed.checked,requestId:crypto.randomUUID()};const call=httpsCallable(getFunctions(app,"asia-northeast1"),"submitBeautyOrder"),result=await call(data);sessionStorage.setItem("beautyOrderResult",JSON.stringify(result.data));location.href=`beauty-complete.html?order=${encodeURIComponent(result.data.orderId)}`}catch(error){status.textContent=error?.message||"注文を送信できませんでした。時間をおいてお試しください。";submitButton.disabled=false}});
