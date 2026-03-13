# CRM 客户关系管理系统

一个基于 Node.js + Express + SQLite 的客户关系管理系统，包含客户管理、跟进记录、KPI统计等功能。

## 功能特性

- **客户管理**：创建、查看客户信息，支持多种分类（行业、来源、状态）
- **跟进管理**：多种跟进类型（电话、会议、拜访等），记录跟进结果和耗时
- **KPI统计**：销售人员绩效统计、跟进类型分析、客户行业分布

## 快速启动

### 1. 安装 Node.js

如果你的电脑没有安装 Node.js，请先下载安装：

1. 访问 Node.js 官网：https://nodejs.org/
2. 下载 **LTS（长期支持版）** 安装包
3. 运行安装程序，一路点击"下一步"完成安装
4. 安装完成后，打开命令行终端，输入以下命令验证安装：
   ```bash
   node --version
   npm --version
   ```
   如果显示版本号，说明安装成功。

### 2. 启动项目

打开命令行终端（Windows 按 `Win+R`，输入 `cmd` 回车），进入项目目录后执行：

```bash
# 安装依赖
npm install

# 启动服务器
node server.js
```

### 3. 访问应用

启动成功后，打开浏览器访问：http://localhost:3000

## 技术栈

| 组件 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 数据库 | SQLite (better-sqlite3) |
| 前端 | HTML/CSS/JavaScript |

## 项目结构

```
crm-demo/
├── server.js          # 主服务器文件（包含前后端）
├── package.json       # 项目依赖配置
├── crm_demo.db        # SQLite数据库（启动后自动生成）
└── README.md          # 项目说明
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/customers | 获取所有客户 |
| POST | /api/customers | 创建新客户 |
| GET | /api/customers/:id | 获取客户详情 |
| GET | /api/customers/:id/followups | 获取客户跟进记录 |
| POST | /api/customers/:id/followups | 添加跟进记录 |
| GET | /api/users | 获取所有用户 |
| GET | /api/kpi/sales | 获取销售KPI统计 |

## 许可证

MIT
