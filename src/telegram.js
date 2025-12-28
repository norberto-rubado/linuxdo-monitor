import https from 'https';

/**
 * Telegram Bot 通知模块
 */
export class TelegramBot {
  constructor(botToken, chatId) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  /**
   * 发送 HTTPS 请求
   */
  request(path, data) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(data);
      const url = `${this.baseUrl}${path}`;

      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve({ ok: false, error: body });
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  /**
   * 发送消息
   * @param {string} text - 消息内容 (支持 Markdown)
   * @returns {Promise<Object>}
   */
  async sendMessage(text) {
    const result = await this.request('/sendMessage', {
      chat_id: this.chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: false
    });

    if (!result.ok) {
      console.error('[Telegram] 发送消息失败:', result);
    }

    return result;
  }

  /**
   * 发送新话题通知
   * @param {string} username - 用户名
   * @param {Object} topic - 话题对象
   */
  async notifyNewTopic(username, topic) {
    const topicUrl = `https://linux.do/t/${topic.slug}/${topic.id}`;
    const message = `🆕 *${username}* 发布了新话题

📌 *${this.escapeMarkdown(topic.title)}*

🔗 [点击查看](${topicUrl})

⏰ ${new Date(topic.created_at).toLocaleString('zh-CN')}`;

    return this.sendMessage(message);
  }

  /**
   * 发送新回复通知
   * @param {string} username - 用户名
   * @param {Object} post - 回复对象
   * @param {string} topicTitle - 话题标题
   */
  async notifyNewReply(username, post, topicTitle) {
    const postUrl = `https://linux.do/t/${post.topic_slug}/${post.topic_id}/${post.post_number}`;

    // 截取回复内容前 200 字符
    const excerpt = post.excerpt || post.raw?.substring(0, 200) || '';

    const message = `💬 *${username}* 发布了新回复

📌 话题: *${this.escapeMarkdown(topicTitle)}*

📝 ${this.escapeMarkdown(excerpt)}${excerpt.length >= 200 ? '...' : ''}

🔗 [点击查看](${postUrl})

⏰ ${new Date(post.created_at).toLocaleString('zh-CN')}`;

    return this.sendMessage(message);
  }

  /**
   * 发送启动通知
   * @param {string[]} usernames - 监控的用户列表
   * @param {number} interval - 检查间隔(秒)
   */
  async notifyStartup(usernames, interval) {
    const message = `🚀 *Linux.do 监控已启动*

👤 监控用户: ${usernames.join(', ')}
⏱️ 检查间隔: ${interval} 秒

监控类型: 新话题 + 新回复`;

    return this.sendMessage(message);
  }

  /**
   * 发送错误通知
   * @param {string} error - 错误信息
   */
  async notifyError(error) {
    const message = `⚠️ *监控出现错误*

${this.escapeMarkdown(error)}

请检查配置或 Cookie 是否过期`;

    return this.sendMessage(message);
  }

  /**
   * 转义 Markdown 特殊字符
   */
  escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&');
  }

  /**
   * 测试 Bot 连接
   */
  async testConnection() {
    try {
      const result = await this.request('/getMe', {});
      if (result.ok) {
        console.log(`[Telegram] Bot 连接成功: @${result.result.username}`);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[Telegram] Bot 连接失败:', err.message);
      return false;
    }
  }
}
