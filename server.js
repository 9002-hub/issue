import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const { Pool } = pg;
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

if (!DATABASE_URL) console.warn("DATABASE_URL is not set. Set it before starting the app.");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

async function db(text, params = []) {
  return pool.query(text, params);
}

async function init() {
  if (!DATABASE_URL) return;
  await db(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(180) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(30) NOT NULL DEFAULT 'cashier',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      sku VARCHAR(80) UNIQUE,
      price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
      stock NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (stock >= 0),
      low_stock NUMERIC(12,2) NOT NULL DEFAULT 5,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id),
      total NUMERIC(12,2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id SERIAL PRIMARY KEY,
      sale_id INT REFERENCES sales(id) ON DELETE CASCADE,
      product_id INT REFERENCES products(id),
      quantity NUMERIC(12,2) NOT NULL,
      price NUMERIC(12,2) NOT NULL
    );
  `);

  const adminEmail = process.env.ADMIN_EMAIL || "admin@shop.local";
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const existing = await db("SELECT id FROM users WHERE email=$1", [adminEmail]);
  if (!existing.rowCount) {
    const hash = await bcrypt.hash(adminPassword, 12);
    await db("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'admin')",
      ["Administrator", adminEmail, hash]);
    console.log(`Created admin user: ${adminEmail}`);
  }
}

function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Authentication required" });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin" && req.user.role !== "manager")
    return res.status(403).json({ error: "Admin/manager permission required" });
  next();
}

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const r = await db("SELECT * FROM users WHERE email=$1", [email]);
    if (!r.rowCount || !(await bcrypt.compare(password, r.rows[0].password_hash)))
      return res.status(401).json({ error: "Invalid email or password" });
    const u = r.rows[0];
    const token = jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role }, JWT_SECRET, { expiresIn: "12h" });
    res.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/me", auth, (req,res)=>res.json(req.user));

app.get("/api/products", auth, async (req,res)=>{
  try {
    const r = await db("SELECT id,name,sku,price,stock,low_stock FROM products ORDER BY name");
    res.json(r.rows);
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.post("/api/products", auth, adminOnly, async (req,res)=>{
  try {
    const {name, sku, price, stock, low_stock} = req.body;
    const r = await db(
      "INSERT INTO products(name,sku,price,stock,low_stock) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [name, sku || null, price, stock || 0, low_stock || 5]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ res.status(400).json({error:e.message}); }
});

app.put("/api/products/:id", auth, adminOnly, async (req,res)=>{
  try {
    const {name, sku, price, stock, low_stock} = req.body;
    const r = await db(
      "UPDATE products SET name=$1,sku=$2,price=$3,stock=$4,low_stock=$5 WHERE id=$6 RETURNING *",
      [name, sku || null, price, stock, low_stock, req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e){ res.status(400).json({error:e.message}); }
});

app.delete("/api/products/:id", auth, adminOnly, async (req,res)=>{
  try {
    await db("DELETE FROM products WHERE id=$1", [req.params.id]);
    res.json({ok:true});
  } catch(e){ res.status(400).json({error:e.message}); }
});

app.post("/api/sales", auth, async (req,res)=>{
  const client = await pool.connect();
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({error:"Cart is empty"});
    await client.query("BEGIN");
    let total = 0;
    const checked = [];
    for (const item of items) {
      const p = await client.query("SELECT * FROM products WHERE id=$1 FOR UPDATE", [item.product_id]);
      if (!p.rowCount) throw new Error("Product not found");
      const product = p.rows[0];
      const qty = Number(item.quantity);
      if (!qty || qty <= 0) throw new Error("Invalid quantity");
      if (Number(product.stock) < qty) throw new Error(`Not enough stock: ${product.name}`);
      const price = Number(product.price);
      total += price * qty;
      checked.push({product, qty, price});
    }
    const sale = await client.query("INSERT INTO sales(user_id,total) VALUES($1,$2) RETURNING id,total,created_at", [req.user.id,total]);
    for (const x of checked) {
      await client.query("INSERT INTO sale_items(sale_id,product_id,quantity,price) VALUES($1,$2,$3,$4)",
        [sale.rows[0].id,x.product.id,x.qty,x.price]);
      await client.query("UPDATE products SET stock=stock-$1 WHERE id=$2",[x.qty,x.product.id]);
    }
    await client.query("COMMIT");
    res.status(201).json(sale.rows[0]);
  } catch(e) {
    await client.query("ROLLBACK");
    res.status(400).json({error:e.message});
  } finally { client.release(); }
});

app.get("/api/sales", auth, async (req,res)=>{
  try {
    const r = await db(`
      SELECT s.id,s.total,s.created_at,u.name AS cashier
      FROM sales s LEFT JOIN users u ON u.id=s.user_id
      ORDER BY s.created_at DESC LIMIT 100`);
    res.json(r.rows);
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.get("/api/dashboard", auth, async (req,res)=>{
  try {
    const [sales, products, low, today] = await Promise.all([
      db("SELECT COALESCE(SUM(total),0) total FROM sales"),
      db("SELECT COUNT(*) count FROM products"),
      db("SELECT COUNT(*) count FROM products WHERE stock <= low_stock"),
      db("SELECT COALESCE(SUM(total),0) total FROM sales WHERE created_at::date=CURRENT_DATE")
    ]);
    res.json({
      totalSales: Number(sales.rows[0].total),
      products: Number(products.rows[0].count),
      lowStock: Number(low.rows[0].count),
      todaySales: Number(today.rows[0].total)
    });
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.get("/api/users", auth, adminOnly, async (req,res)=>{
  const r = await db("SELECT id,name,email,role,created_at FROM users ORDER BY name");
  res.json(r.rows);
});

app.post("/api/users", auth, adminOnly, async (req,res)=>{
  try {
    const {name,email,password,role} = req.body;
    if (!name || !email || !password) return res.status(400).json({error:"Name, email and password are required"});
    const hash = await bcrypt.hash(password,12);
    const r = await db("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,email,role",
      [name,email,hash,role || "cashier"]);
    res.status(201).json(r.rows[0]);
  } catch(e){ res.status(400).json({error:e.message}); }
});

app.get("*", (req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

init().then(()=>app.listen(PORT,()=>console.log(`POS running on port ${PORT}`)))
  .catch(e=>{console.error(e); process.exit(1);});
