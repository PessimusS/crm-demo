// server.js
const express = require('express');
const Database = require('better-sqlite3');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// init sqlite db (file)
const DB_FILE = './crm_demo.db';
const db = new Database(DB_FILE);

// better-sqlite3 helper functions (synchronous API)
function runAsync(sql, params=[]) {
  try {
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    return Promise.resolve(result);
  } catch (err) {
    return Promise.reject(err);
  }
}
function allAsync(sql, params=[]) {
  try {
    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    return Promise.resolve(rows);
  } catch (err) {
    return Promise.reject(err);
  }
}
function getAsync(sql, params=[]) {
  try {
    const stmt = db.prepare(sql);
    const row = stmt.get(...params);
    return Promise.resolve(row);
  } catch (err) {
    return Promise.reject(err);
  }
}

// initialize tables
try {
  db.prepare(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    name TEXT NOT NULL, 
    email TEXT UNIQUE,
    role TEXT DEFAULT 'sales',
    department TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    name TEXT NOT NULL, 
    company TEXT, 
    contact TEXT, 
    email TEXT,
    phone TEXT,
    industry TEXT,
    status TEXT DEFAULT 'active',
    source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS followups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    notes TEXT,
    outcome TEXT,
    duration_minutes INTEGER,
    followup_date DATE DEFAULT CURRENT_DATE,
    next_followup_date DATE,
    priority TEXT DEFAULT 'medium',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );`).run();
  
  // seed demo data if none
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if(!userCount || userCount.c === 0) {
    db.prepare('INSERT INTO users (name,email,role,department) VALUES (?,?,?,?)').run('Alice Sales','alice@example.com','sales','华东区');
    db.prepare('INSERT INTO users (name,email,role,department) VALUES (?,?,?,?)').run('Bob Rep','bob@example.com','sales','华北区');
    db.prepare('INSERT INTO users (name,email,role,department) VALUES (?,?,?,?)').run('Charlie Manager','charlie@example.com','manager','销售部');
  }
  
  const customerCount = db.prepare('SELECT COUNT(*) as c FROM customers').get();
  if(!customerCount || customerCount.c === 0) {
    db.prepare('INSERT INTO customers (name,company,contact,email,phone,industry,status,source) VALUES (?,?,?,?,?,?,?,?)').run(
      'ABC科技有限公司','ABC科技','张经理','zhang@abc.com','13800138000','科技','active','展会'
    );
    db.prepare('INSERT INTO customers (name,company,contact,email,phone,industry,status,source) VALUES (?,?,?,?,?,?,?,?)').run(
      'XYZ制造有限公司','XYZ制造','李总','li@xyz.com','13900139000','制造','active','推荐'
    );
  }
} catch (err) {
  console.error('Database initialization error:', err);
}

// Serve minimal frontend
app.get('/', (req,res) => {
  res.type('html').send(frontendHtml);
});

// APIs
app.get('/api/customers', async (req,res) => {
  const rows = await allAsync('SELECT * FROM customers ORDER BY created_at DESC');
  res.json(rows);
});
app.post('/api/customers', async (req,res) => {
  const {name,company,contact,email,phone,industry,status,source} = req.body;
  if(!name) return res.status(400).json({error:'name required'});
  const r = await runAsync('INSERT INTO customers (name,company,contact,email,phone,industry,status,source) VALUES (?,?,?,?,?,?,?,?)',
    [name,company||'',contact||'',email||'',phone||'',industry||'',status||'active',source||'']);
  const customer = await getAsync('SELECT * FROM customers WHERE id=?',[r.lastID]);
  res.json(customer);
});
app.get('/api/customers/:id', async (req,res) => {
  const id = req.params.id;
  const c = await getAsync('SELECT * FROM customers WHERE id=?',[id]);
  if(!c) return res.status(404).json({error:'not found'});
  res.json(c);
});
app.get('/api/customers/:id/followups', async (req,res) => {
  const id = req.params.id;
  const rows = await allAsync('SELECT f.*, u.name as user_name FROM followups f LEFT JOIN users u ON u.id=f.user_id WHERE customer_id=? ORDER BY created_at DESC',[id]);
  res.json(rows);
});
app.post('/api/customers/:id/followups', async (req,res) => {
  const customer_id = req.params.id;
  const {user_id, type, notes, outcome, duration_minutes, followup_date, next_followup_date, priority} = req.body;
  if(!user_id || !type) return res.status(400).json({error:'user_id and type required'});
  const r = await runAsync('INSERT INTO followups (customer_id,user_id,type,notes,outcome,duration_minutes,followup_date,next_followup_date,priority) VALUES (?,?,?,?,?,?,?,?,?)',
    [customer_id,user_id,type,notes||'',outcome||'', duration_minutes || null, followup_date || new Date().toISOString().split('T')[0], next_followup_date || null, priority || 'medium']);
  const f = await getAsync('SELECT f.*, u.name as user_name FROM followups f LEFT JOIN users u ON u.id=f.user_id WHERE f.id=?',[r.lastID]);
  res.json(f);
});

// Enhanced KPI statistics
app.get('/api/kpi/sales', async (req,res) => {
  const {start, end} = req.query;
  const s = start || '1970-01-01';
  const e = end || '9999-12-31';
  const rows = await allAsync(`
    SELECT u.id, u.name, u.department,
      COUNT(f.id) AS followup_count,
      SUM(CASE WHEN f.type='call' THEN 1 ELSE 0 END) AS calls,
      SUM(CASE WHEN f.type='online_meeting' THEN 1 ELSE 0 END) AS online_meetings,
      SUM(CASE WHEN f.type='visit' THEN 1 ELSE 0 END) AS visits,
      SUM(f.duration_minutes) AS total_duration,
      AVG(f.duration_minutes) AS avg_duration,
      COUNT(DISTINCT f.customer_id) AS unique_customers
    FROM users u
    LEFT JOIN followups f ON f.user_id = u.id AND f.followup_date BETWEEN ? AND ?
    WHERE u.role = 'sales'
    GROUP BY u.id, u.name, u.department
    ORDER BY followup_count DESC
  `,[s,e]);
  res.json(rows);
});

// Customer statistics
app.get('/api/kpi/customers', async (req,res) => {
  const rows = await allAsync(`
    SELECT 
      COUNT(*) as total_customers,
      SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active_customers,
      SUM(CASE WHEN status='inactive' THEN 1 ELSE 0 END) as inactive_customers,
      industry,
      source
    FROM customers
    GROUP BY industry, source
    ORDER BY total_customers DESC
  `);
  res.json(rows);
});

// Followup statistics by type and outcome
app.get('/api/kpi/followups', async (req,res) => {
  const {start, end} = req.query;
  const s = start || '1970-01-01';
  const e = end || '9999-12-31';
  const rows = await allAsync(`
    SELECT 
      type,
      outcome,
      COUNT(*) as count,
      AVG(duration_minutes) as avg_duration
    FROM followups
    WHERE followup_date BETWEEN ? AND ?
    GROUP BY type, outcome
    ORDER BY count DESC
  `,[s,e]);
  res.json(rows);
});

// list users (for selection)
app.get('/api/users', async (req,res) => {
  const rows = await allAsync('SELECT * FROM users');
  res.json(rows);
});

const PORT = 3000;
app.listen(PORT, () => console.log('Server running on http://localhost:'+PORT));

// --- Simple but complete frontend HTML ---
const frontendHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CRM 客户关系管理系统</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #f5f7fa;
            color: #333;
            line-height: 1.6;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e6ed;
        }
        
        h1 {
            color: #2c3e50;
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        
        .subtitle {
            color: #7f8c8d;
            font-size: 1.1rem;
        }
        
        .dashboard {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .card {
            background: white;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            border: 1px solid #e0e6ed;
        }
        
        .card h2 {
            color: #2c3e50;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid #e0e6ed;
        }
        
        .form-group {
            margin-bottom: 15px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
            color: #2c3e50;
        }
        
        .form-control {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 14px;
        }
        
        .form-control:focus {
            outline: none;
            border-color: #3498db;
            box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
        }
        
        textarea.form-control {
            min-height: 100px;
            resize: vertical;
        }
        
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        
        .btn-primary {
            background-color: #3498db;
            color: white;
        }
        
        .btn-primary:hover {
            background-color: #2980b9;
        }
        
        .btn-success {
            background-color: #2ecc71;
            color: white;
        }
        
        .btn-warning {
            background-color: #f39c12;
            color: white;
        }
        
        .btn-danger {
            background-color: #e74c3c;
            color: white;
        }
        
        .customer-list {
            margin-top: 20px;
        }
        
        .customer-item {
            padding: 15px;
            border: 1px solid #e0e6ed;
            border-radius: 5px;
            margin-bottom: 10px;
            background: white;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .customer-info h3 {
            margin-bottom: 5px;
            color: #2c3e50;
        }
        
        .customer-meta {
            color: #7f8c8d;
            font-size: 0.9rem;
        }
        
        .detail-section {
            display: none;
            margin-top: 30px;
        }
        
        .detail-section.active {
            display: block;
        }
        
        .customer-detail {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        
        .detail-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        
        .detail-item {
            margin-bottom: 10px;
        }
        
        .detail-label {
            font-size: 0.9rem;
            color: #7f8c8d;
            margin-bottom: 3px;
        }
        
        .detail-value {
            font-size: 1rem;
            font-weight: 500;
            color: #2c3e50;
        }
        
        .followup-form {
            background: white;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
            border: 1px solid #e0e6ed;
        }
        
        .followup-history {
            margin-top: 20px;
        }
        
        .followup-item {
            padding: 15px;
            border: 1px solid #e0e6ed;
            border-radius: 5px;
            margin-bottom: 10px;
            background: white;
        }
        
        .followup-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .followup-type {
            font-weight: 600;
            color: #2c3e50;
        }
        
        .followup-meta {
            color: #7f8c8d;
            font-size: 0.9rem;
        }
        
        .followup-notes {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #e0e6ed;
        }
        
        .kpi-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        
        .stat-card {
            background: white;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
            border: 1px solid #e0e6ed;
        }
        
        .stat-value {
            font-size: 1.8rem;
            font-weight: 700;
            color: #3498db;
            margin-bottom: 5px;
        }
        
        .stat-label {
            font-size: 0.9rem;
            color: #7f8c8d;
        }
        
        .badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: 500;
        }
        
        .badge-success {
            background: #d4edda;
            color: #155724;
        }
        
        .badge-warning {
            background: #fff3cd;
            color: #856404;
        }
        
        .badge-danger {
            background: #f8d7da;
            color: #721c24;
        }
        
        .badge-info {
            background: #d1ecf1;
            color: #0c5460;
        }
        
        .hidden {
            display: none;
        }
        
        .flex {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        
        .mt-3 {
            margin-top: 15px;
        }
        
        .mb-3 {
            margin-bottom: 15px;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📊 CRM 客户关系管理系统</h1>
            <p class="subtitle">客户跟进、事件管理、KPI统计一体化平台</p>
        </header>
        
        <div class="dashboard">
            <!-- 新建客户 -->
            <div class="card">
                <h2>新建客户</h2>
                <div class="form-group">
                    <label for="c_name">客户姓名/公司 *</label>
                    <input type="text" id="c_name" class="form-control" placeholder="请输入客户姓名或公司名称">
                </div>
                <div class="form-group">
                    <label for="c_company">公司名称</label>
                    <input type="text" id="c_company" class="form-control" placeholder="请输入公司名称">
                </div>
                <div class="form-group">
                    <label for="c_contact">联系人</label>
                    <input type="text" id="c_contact" class="form-control" placeholder="请输入联系人">
                </div>
                <div class="form-group">
                    <label for="c_phone">联系电话</label>
                    <input type="tel" id="c_phone" class="form-control" placeholder="请输入联系电话">
                </div>
                <div class="form-group">
                    <label for="c_email">邮箱</label>
                    <input type="email" id="c_email" class="form-control" placeholder="请输入邮箱">
                </div>
                <div class="form-group">
                    <label for="c_industry">行业</label>
                    <select id="c_industry" class="form-control">
                        <option value="">选择行业</option>
                        <option value="科技">科技</option>
                        <option value="制造">制造</option>
                        <option value="金融">金融</option>
                        <option value="教育">教育</option>
                        <option value="医疗">医疗</option>
                        <option value="零售">零售</option>
                        <option value="其他">其他</option>
                    </select>
                </div>
                <button class="btn btn-primary" onclick="createCustomer()">创建客户</button>
            </div>
            
            <!-- 客户列表 -->
            <div class="card">
                <h2>客户列表</h2>
                <div id="customers" class="customer-list">
                    <!-- 客户列表将通过JavaScript动态加载 -->
                </div>
            </div>
        </div>
        
        <!-- 客户详情区域（默认隐藏） -->
        <div id="detailSection" class="detail-section">
            <div class="customer-detail">
                <h2>客户详情 - <span id="detailName"></span></h2>
                <div class="detail-grid" id="customerDetail">
                    <!-- 客户详情将通过JavaScript动态加载 -->
                </div>
            </div>
            
            <!-- 新增跟进表单 -->
            <div class="followup-form">
                <h3>新增跟进</h3>
                <div class="form-group">
                    <label for="selUser">跟进人员 *</label>
                    <select id="selUser" class="form-control">
                        <option value="">选择跟进人员</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="selType">跟进类型 *</label>
                    <select id="selType" class="form-control">
                        <option value="call">电话</option>
                        <option value="online_meeting">线上会议</option>
                        <option value="visit">上门拜访</option>
                        <option value="email">邮件</option>
                        <option value="other">其他</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="followup_date">跟进日期</label>
                    <input type="date" id="followup_date" class="form-control">
                </div>
                <div class="form-group">
                    <label for="duration">耗时（分钟）</label>
                    <input type="number" id="duration" class="form-control" placeholder="输入跟进耗时">
                </div>
                <div class="form-group">
                    <label for="outcome">跟进结果</label>
                    <select id="outcome" class="form-control">
                        <option value="">选择结果</option>
                        <option value="positive">积极</option>
                        <option value="neutral">中性</option>
                        <option value="negative">消极</option>
                        <option value="pending">待定</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="notes">跟进备注</label>
                    <textarea id="notes" class="form-control" placeholder="请输入跟进备注"></textarea>
                </div>
                <button class="btn btn-success" onclick="addFollowup()">添加跟进</button>
            </div>
            
            <!-- 历史记录 -->
            <div class="followup-history">
                <h3>历史记录</h3>
                <div id="history">
                    <!-- 历史记录将通过JavaScript动态加载 -->
                </div>
            </div>
        </div>
        
        <!-- KPI统计 -->
        <div class="card">
            <h2>KPI统计</h2>
            <div class="kpi-stats" id="kpiStats">
                <!-- KPI统计将通过JavaScript动态加载 -->
            </div>
            <button class="btn btn-primary mt-3" onclick="loadKPI()">刷新KPI</button>
        </div>
    </div>
    
    <script>
        let currentCustomerId = null;
        
        // 通用API请求函数
        async function fetchJson(url, options = {}) {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            return response.json();
        }
        
        // 加载客户列表
        async function loadCustomers() {
            try {
                const customers = await fetchJson('/api/customers');
                const container = document.getElementById('customers');
                container.innerHTML = '';
                
                customers.forEach(customer => {
                    const item = document.createElement('div');
                    item.className = 'customer-item';
                    item.innerHTML = \`
                        <div class="customer-info">
                            <h3>\${customer.name}</h3>
                            <div class="customer-meta">
                                \${customer.company ? customer.company + ' • ' : ''}
                                \${customer.contact ? customer.contact + ' • ' : ''}
                                创建于: \${new Date(customer.created_at).toLocaleDateString()}
                            </div>
                        </div>
                        <button class="btn btn-primary btn-sm" onclick="showCustomerDetail(\${customer.id})">查看详情</button>
                    \`;
                    container.appendChild(item);
                });
            } catch (error) {
                console.error('加载客户列表失败:', error);
                alert('加载客户列表失败，请检查网络连接');
            }
        }
        
        // 创建新客户
        async function createCustomer() {
            const name = document.getElementById('c_name').value.trim();
            if (!name) {
                alert('请输入客户姓名/公司');
                return;
            }
            
            const customerData = {
                name: name,
                company: document.getElementById('c_company').value.trim(),
                contact: document.getElementById('c_contact').value.trim(),
                phone: document.getElementById('c_phone').value.trim(),
                email: document.getElementById('c_email').value.trim(),
                industry: document.getElementById('c_industry').value,
                source: document.getElementById('c_source').value,
                status: 'active'
            };
            
            try {
                await fetchJson('/api/customers', {
                    method: 'POST',
                    body: JSON.stringify(customerData)
                });
                
                // 清空表单
                ['c_name', 'c_company', 'c_contact', 'c_phone', 'c_email'].forEach(id => {
                    document.getElementById(id).value = '';
                });
                document.getElementById('c_industry').value = '';
                document.getElementById('c_source').value = '';
                
                alert('客户创建成功！');
                loadCustomers();
            } catch (error) {
                console.error('创建客户失败:', error);
                alert('创建客户失败: ' + (error.message || '未知错误'));
            }
        }
        
        // 显示客户详情
        async function showCustomerDetail(customerId) {
            currentCustomerId = customerId;
            
            try {
                // 显示详情区域
                document.getElementById('detailSection').classList.add('active');
                
                // 加载客户详情
                const customer = await fetchJson(\`/api/customers/\${customerId}\`);
                document.getElementById('detailName').textContent = customer.name;
                
                const detailGrid = document.getElementById('customerDetail');
                detailGrid.innerHTML = \`
                    <div class="detail-item">
                        <div class="detail-label">公司</div>
                        <div class="detail-value">\${customer.company || '未填写'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">联系人</div>
                        <div class="detail-value">\${customer.contact || '未填写'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">电话</div>
                        <div class="detail-value">\${customer.phone || '未填写'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">邮箱</div>
                        <div class="detail-value">\${customer.email || '未填写'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">行业</div>
                        <div class="detail-value">\${customer.industry || '未填写'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">来源</div>
                        <div class="detail-value">\${customer.source || '未填写'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">状态</div>
                        <div class="detail-value">
                            <span class="badge \${customer.status === 'active' ? 'badge-success' : 'badge-danger'}">
                                \${customer.status === 'active' ? '活跃' : '不活跃'}
                            </span>
                        </div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">创建时间</div>
                        <div class="detail-value">\${new Date(customer.created_at).toLocaleString()}</div>
                    </div>
                \`;
                
                // 加载用户列表（用于跟进人员选择）
                await loadUsers();
                
                // 加载历史记录
                await loadHistory();
                
                // 滚动到详情区域
                document.getElementById('detailSection').scrollIntoView({ behavior: 'smooth' });
            } catch (error) {
                console.error('加载客户详情失败:', error);
                alert('加载客户详情失败');
            }
        }
        
        // 加载用户列表
        async function loadUsers() {
            try {
                const users = await fetchJson('/api/users');
                const select = document.getElementById('selUser');
                select.innerHTML = '<option value="">选择跟进人员</option>';
                
                users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.id;
                    option.textContent = \`\${user.name} (\${user.department || '未分配部门'})\`;
                    select.appendChild(option);
                });
            } catch (error) {
                console.error('加载用户列表失败:', error);
            }
        }
        
        // 添加跟进
        async function addFollowup() {
            if (!currentCustomerId) {
                alert('请先选择客户');
                return;
            }
            
            const userSelect = document.getElementById('selUser');
            const typeSelect = document.getElementById('selType');
            
            if (!userSelect.value) {
                alert('请选择跟进人员');
                return;
            }
            
            if (!typeSelect.value) {
                alert('请选择跟进类型');
                return;
            }
            
            const followupData = {
                user_id: parseInt(userSelect.value),
                type: typeSelect.value,
                notes: document.getElementById('notes').value.trim(),
                outcome: document.getElementById('outcome').value,
                duration_minutes: document.getElementById('duration').value ? parseInt(document.getElementById('duration').value) : null,
                followup_date: document.getElementById('followup_date').value,
                priority: 'medium'
            };
            
            try {
                await fetchJson(\`/api/customers/\${currentCustomerId}/followups\`, {
                    method: 'POST',
                    body: JSON.stringify(followupData)
                });
                
                // 清空表单
                document.getElementById('notes').value = '';
                document.getElementById('duration').value = '';
                document.getElementById('outcome').value = '';
                
                alert('跟进记录添加成功！');
                
                // 重新加载历史记录和KPI
                await loadHistory();
                await loadKPI();
            } catch (error) {
                console.error('添加跟进失败:', error);
                alert('添加跟进失败: ' + (error.message || '未知错误'));
            }
        }
        
        // 加载历史记录
        async function loadHistory() {
            if (!currentCustomerId) return;
            
            try {
                const followups = await fetchJson(\`/api/customers/\${currentCustomerId}/followups\`);
                const historyContainer = document.getElementById('history');
                historyContainer.innerHTML = '';
                
                if (followups.length === 0) {
                    historyContainer.innerHTML = '<p class="text-muted">暂无跟进记录</p>';
                    return;
                }
                
                followups.forEach(followup => {
                    const item = document.createElement('div');
                    item.className = 'followup-item';
                    
                    const typeMap = {
                        'call': '电话',
                        'online_meeting': '线上会议',
                        'visit': '上门拜访',
                        'email': '邮件',
                        'other': '其他'
                    };
                    
                    const outcomeMap = {
                        'positive': '积极',
                        'neutral': '中性',
                        'negative': '消极',
                        'pending': '待定'
                    };
                    
                    item.innerHTML = \`
                        <div class="followup-header">
                            <div class="followup-type">\${typeMap[followup.type] || followup.type}</div>
                            <div class="followup-meta">
                                \${followup.user_name || '未知用户'} • 
                                \${new Date(followup.created_at).toLocaleString()}
                            </div>
                        </div>
                        <div class="followup-meta">
                            耗时: \${followup.duration_minutes || '未记录'} 分钟 • 
                            结果: \${followup.outcome ? outcomeMap[followup.outcome] || followup.outcome : '未记录'}
                        </div>
                        \${followup.notes ? \`<div class="followup-notes">\${followup.notes}</div>\` : ''}
                    \`;
                    historyContainer.appendChild(item);
                });
            } catch (error) {
                console.error('加载历史记录失败:', error);
            }
        }
        
        // 加载KPI统计
        async function loadKPI() {
            try {
                const kpiData = await fetchJson('/api/kpi/sales');
                const kpiContainer = document.getElementById('kpiStats');
                kpiContainer.innerHTML = '';
                
                if (kpiData.length === 0) {
                    kpiContainer.innerHTML = '<p class="text-muted">暂无KPI数据</p>';
                    return;
                }
                
                kpiData.forEach(kpi => {
                    const statCard = document.createElement('div');
                    statCard.className = 'stat-card';
                    statCard.innerHTML = \`
                        <div class="stat-value">\${kpi.followup_count || 0}</div>
                        <div class="stat-label">\${kpi.name}</div>
                        <div class="text-sm text-muted mt-3">
                            电话: \${kpi.calls || 0} | 
                            会议: \${kpi.online_meetings || 0} | 
                            拜访: \${kpi.visits || 0}
                        </div>
                    \`;
                    kpiContainer.appendChild(statCard);
                });
            } catch (error) {
                console.error('加载KPI失败:', error);
            }
        }
        
        // 页面加载时初始化
        document.addEventListener('DOMContentLoaded', () => {
            loadCustomers();
            loadKPI();
            
            // 设置默认日期为今天
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('followup_date').value = today;
        });
    </script>
</body>
</html>
`;
