const root=document.getElementById("app");
let token=localStorage.getItem("pos_token");
let me=JSON.parse(localStorage.getItem("pos_user")||"null");
let products=[],cart=[],page="dashboard";

async function api(url,opt={}){
  opt.headers={...(opt.headers||{}),"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})};
  const r=await fetch(url,opt); const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||"Request failed");
  return data;
}
function money(v){return new Intl.NumberFormat("en-RW",{style:"currency",currency:"RWF",maximumFractionDigits:0}).format(v)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

function login(){
 root.innerHTML=`<div class="login"><div class="card"><h1>Shop POS</h1><p class="muted">Multi-user point of sale</p>
 <form id="login"><label>Email</label><input id="email" type="email" value="admin@shop.local" required>
 <label>Password</label><input id="password" type="password" value="ChangeMe123!" required>
 <button class="primary" style="width:100%">Sign in</button><p id="err" class="muted"></p></form></div></div>`;
 document.getElementById("login").onsubmit=async e=>{e.preventDefault();try{
  const x=await api("/api/login",{method:"POST",body:JSON.stringify({email:email.value,password:password.value})});
  token=x.token;me=x.user;localStorage.setItem("pos_token",token);localStorage.setItem("pos_user",JSON.stringify(me));render();
 }catch(err){document.getElementById("err").textContent=err.message}};
}

async function render(){
 if(!token||!me)return login();
 root.innerHTML=`<div class="layout"><aside class="side"><h2>Shop POS</h2>
 ${["dashboard","pos","products","sales",...(me.role==="admin"||me.role==="manager"?["users"]:[])].map(x=>`<button class="${page===x?"active":""}" onclick="go('${x}')">${x[0].toUpperCase()+x.slice(1)}</button>`).join("")}
 <button onclick="logout()">Logout</button></aside><main class="main"><div class="top"><h1>${page[0].toUpperCase()+page.slice(1)}</h1><span>${esc(me.name)} · <span class="badge">${esc(me.role)}</span></span></div><div id="content"></div></main></div>`;
 try{if(page==="dashboard")await dashboard();if(page==="pos")await pos();if(page==="products")await productPage();if(page==="sales")await sales();if(page==="users")await users();}catch(e){document.getElementById("content").innerHTML=`<div class="panel">${esc(e.message)}</div>`}
}
window.go=x=>{page=x;render()};window.logout=()=>{localStorage.clear();token=null;me=null;login()};

async function dashboard(){
 const d=await api("/api/dashboard");
 content.innerHTML=`<div class="grid"><div class="stat">Total sales<strong>${money(d.totalSales)}</strong></div><div class="stat">Today's sales<strong>${money(d.todaySales)}</strong></div><div class="stat">Products<strong>${d.products}</strong></div><div class="stat">Low stock<strong>${d.lowStock}</strong></div></div>
 <div class="panel"><h3>Quick start</h3><p>Use <b>POS</b> to sell products. Stock is automatically reduced after a completed sale. All browsers connected to this server share the same PostgreSQL database.</p></div>`;
}
async function pos(){
 products=await api("/api/products");
 content.innerHTML=`<div class="pos"><div><div class="toolbar"><input id="search" placeholder="Search product..." oninput="filterProducts()"></div><div id="productGrid" class="products" style="margin-top:12px"></div></div>
 <div class="panel"><h3>Cart</h3><div id="cart"></div><div class="total" id="cartTotal">RWF 0</div><button class="primary" style="width:100%" onclick="checkout()">Complete sale</button></div></div>`;
 drawProducts(products);drawCart();
}
window.filterProducts=()=>drawProducts(products.filter(p=>(p.name+" "+(p.sku||"")).toLowerCase().includes(search.value.toLowerCase())));
function drawProducts(list){productGrid.innerHTML=list.map(p=>`<div class="product" onclick="addCart(${p.id})"><b>${esc(p.name)}</b><br><small>${esc(p.sku||"")}</small><p>${money(p.price)}</p><span class="badge ${Number(p.stock)<=Number(p.low_stock)?"low":""}">Stock: ${p.stock}</span></div>`).join("")}
window.addCart=id=>{const p=products.find(x=>x.id===id);if(Number(p.stock)<=0)return alert("Out of stock");const x=cart.find(x=>x.product_id===id);if(x)x.quantity++;else cart.push({product_id:id,quantity:1,name:p.name,price:Number(p.price)});drawCart()};
window.changeQty=(id,q)=>{const x=cart.find(x=>x.product_id===id);if(x){x.quantity=Math.max(1,Number(q));drawCart()}};
window.removeCart=id=>{cart=cart.filter(x=>x.product_id!==id);drawCart()};
function drawCart(){const el=document.getElementById("cart");if(!el)return;el.innerHTML=cart.length?cart.map(x=>`<div class="cart-row"><span>${esc(x.name)}<br><small>${money(x.price)} × <input style="width:65px;margin:0;padding:5px" type="number" min="1" value="${x.quantity}" onchange="changeQty(${x.product_id},this.value)"></small></span><button class="danger" onclick="removeCart(${x.product_id})">×</button></div>`).join(""):"<p class='muted'>Cart is empty</p>";document.getElementById("cartTotal").textContent=money(cart.reduce((a,x)=>a+x.price*x.quantity,0))}
window.checkout=async()=>{try{const r=await api("/api/sales",{method:"POST",body:JSON.stringify({items:cart.map(x=>({product_id:x.product_id,quantity:x.quantity}))})});alert("Sale #"+r.id+" completed");cart=[];await pos()}catch(e){alert(e.message)}};

async function productPage(){
 products=await api("/api/products");
 const can=me.role==="admin"||me.role==="manager";
 content.innerHTML=`<div class="panel"><h3>Add product</h3>${can?`<form id="pf" class="toolbar"><input id="pn" placeholder="Product name" required><input id="ps" placeholder="SKU"><input id="pp" type="number" min="0" step=".01" placeholder="Price" required><input id="pst" type="number" min="0" step=".01" placeholder="Stock"><input id="pl" type="number" min="0" value="5" placeholder="Low stock"><button class="primary">Add</button></form>`:"<p class='muted'>Only managers/admins can change products.</p>"}</div>
 <div class="panel"><table><thead><tr><th>Name</th><th>SKU</th><th>Price</th><th>Stock</th><th>Low stock</th>${can?"<th></th>":""}</tr></thead><tbody>${products.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.sku||"")}</td><td>${money(p.price)}</td><td class="${Number(p.stock)<=Number(p.low_stock)?"low":""}">${p.stock}</td><td>${p.low_stock}</td>${can?`<td><button onclick="delProduct(${p.id})" class="danger">Delete</button></td>`:""}</tr>`).join("")}</tbody></table></div>`;
 if(can)pf.onsubmit=async e=>{e.preventDefault();try{await api("/api/products",{method:"POST",body:JSON.stringify({name:pn.value,sku:ps.value,price:pp.value,stock:pst.value,low_stock:pl.value})});await productPage()}catch(x){alert(x.message)}};
}
window.delProduct=async id=>{if(confirm("Delete this product?")){try{await api("/api/products/"+id,{method:"DELETE"});productPage()}catch(e){alert(e.message)}}};

async function sales(){
 const rows=await api("/api/sales");
 content.innerHTML=`<div class="panel"><table><thead><tr><th>Sale #</th><th>Cashier</th><th>Total</th><th>Date</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.id}</td><td>${esc(x.cashier||"")}</td><td>${money(x.total)}</td><td>${new Date(x.created_at).toLocaleString()}</td></tr>`).join("")}</tbody></table></div>`;
}
async function users(){
 const rows=await api("/api/users");
 content.innerHTML=`<div class="panel"><h3>Create user</h3><form id="uf" class="toolbar"><input id="un" placeholder="Name" required><input id="ue" type="email" placeholder="Email" required><input id="up" type="password" placeholder="Password" required><select id="ur"><option>cashier</option><option>manager</option><option>admin</option></select><button class="primary">Create</button></form></div>
 <div class="panel"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Created</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.email)}</td><td><span class="badge">${esc(x.role)}</span></td><td>${new Date(x.created_at).toLocaleDateString()}</td></tr>`).join("")}</tbody></table></div>`;
 uf.onsubmit=async e=>{e.preventDefault();try{await api("/api/users",{method:"POST",body:JSON.stringify({name:un.value,email:ue.value,password:up.value,role:ur.value})});await users()}catch(x){alert(x.message)}};
}
render();
