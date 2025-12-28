# Linux.do 用户帖子监控

监控 Linux.do 论坛指定用户的新帖子/回复，通过 Telegram Bot 发送通知。

## 功能

- 监控指定用户发布的新话题
- 监控指定用户发布的新回复
- 通过 Telegram Bot 实时通知
- 支持同时监控多个用户
- 首次运行自动记录现有帖子，不重复通知
- 状态持久化，重启后继续监控

## 环境要求

- Node.js >= 18.0.0

## 安装

```bash
cd linuxdo-monitor
npm install
```

## 配置

1. 复制配置文件

```bash
cp config.example.json config.json
```

2. 编辑 `config.json`，填写以下信息：

```json
{
  "cookie": "你的 Linux.do Cookie",
  "telegram": {
    "botToken": "你的 Telegram Bot Token",
    "chatId": "你的 Telegram Chat ID"
  },
  "monitorUsers": ["username1", "username2"],
  "checkInterval": 300,
  "monitorTopics": true,
  "monitorReplies": true
}
```

### 配置说明

| 字段 | 说明 |
|------|------|
| cookie | Linux.do 的 Cookie，从浏览器开发者工具获取 |
| telegram.botToken | Telegram Bot Token，从 @BotFather 获取 |
| telegram.chatId | 你的 Chat ID，从 @userinfobot 获取 |
| monitorUsers | 要监控的用户名数组 |
| checkInterval | 检查间隔（秒），默认 300（5分钟） |
| monitorTopics | 是否监控新话题，默认 true |
| monitorReplies | 是否监控新回复，默认 true |

## 获取配置信息

### 1. 获取 Linux.do Cookie

1. 使用浏览器访问 https://linux.do 并登录
2. 按 `F12` 打开开发者工具
3. 切换到 "网络 (Network)" 标签
4. 刷新页面
5. 点击任意请求，找到 "请求头" 中的 `Cookie` 字段
6. 复制完整的 Cookie 值

### 2. 创建 Telegram Bot

1. 在 Telegram 中搜索 `@BotFather`
2. 发送 `/newbot` 创建新 Bot
3. 按提示设置 Bot 名称
4. 记录返回的 Bot Token

### 3. 获取 Chat ID

1. 在 Telegram 中搜索 `@userinfobot`
2. 发送 `/start`
3. 记录返回的 `Id` 数字

## 运行

### 直接运行

```bash
npm start
```

### 后台运行 (Linux)

使用 nohup：

```bash
nohup npm start > monitor.log 2>&1 &
```

### 使用 PM2 (推荐)

```bash
# 安装 PM2
npm install -g pm2

# 启动
pm2 start src/index.js --name linuxdo-monitor

# 查看日志
pm2 logs linuxdo-monitor

# 开机自启
pm2 startup
pm2 save
```

### 使用 systemd (Linux)

创建 `/etc/systemd/system/linuxdo-monitor.service`：

```ini
[Unit]
Description=Linux.do Monitor
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/linuxdo-monitor
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

然后：

```bash
sudo systemctl enable linuxdo-monitor
sudo systemctl start linuxdo-monitor
```

## 通知示例

新话题通知：
```
🆕 username 发布了新话题

📌 话题标题

🔗 点击查看

⏰ 2024-01-01 12:00:00
```

新回复通知：
```
💬 username 发布了新回复

📌 话题: 话题标题

📝 回复内容预览...

🔗 点击查看

⏰ 2024-01-01 12:00:00
```

## 注意事项

1. Cookie 会过期，需要定期更新
2. 检查间隔不要设置太短，避免对服务器造成压力，建议 >= 60 秒
3. 首次运行会记录用户现有的帖子，不会发送通知
4. `state.json` 文件保存监控状态，删除后会重新初始化

## 许可证

MIT
