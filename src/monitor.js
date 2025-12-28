import { LinuxDoApi } from './api.js';
import { TelegramBot } from './telegram.js';
import { Storage } from './storage.js';

/**
 * 监控服务
 */
export class Monitor {
  constructor(config) {
    this.config = config;
    this.api = new LinuxDoApi(config.cookie);
    this.telegram = new TelegramBot(config.telegram.botToken, config.telegram.chatId);
    this.storage = new Storage();
    this.running = false;
    this.timer = null;
  }

  /**
   * 启动监控
   */
  async start() {
    console.log('[Monitor] 正在启动...');

    // 测试 Telegram 连接
    const telegramOk = await this.telegram.testConnection();
    if (!telegramOk) {
      console.error('[Monitor] Telegram Bot 连接失败，请检查配置');
      return;
    }

    // 验证 Cookie
    const cookieValid = await this.api.validateCookie();
    if (!cookieValid) {
      console.warn('[Monitor] Cookie 验证失败，可能已过期，但仍尝试继续...');
    }

    // 初始化用户状态（首次运行记录现有帖子，不发通知）
    for (const username of this.config.monitorUsers) {
      if (!this.storage.isInitialized(username)) {
        console.log(`[Monitor] 初始化用户 ${username} 的状态...`);
        await this.initializeUser(username);
      }
    }

    this.running = true;

    // 发送启动通知
    await this.telegram.notifyStartup(this.config.monitorUsers, this.config.checkInterval);

    // 开始定时检查
    console.log(`[Monitor] 开始监控，间隔 ${this.config.checkInterval} 秒`);
    this.timer = setInterval(() => this.check(), this.config.checkInterval * 1000);

    // 立即执行一次检查
    await this.check();
  }

  /**
   * 停止监控
   */
  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[Monitor] 已停止');
  }

  /**
   * 初始化用户状态（记录现有帖子，不发通知）
   */
  async initializeUser(username) {
    try {
      // 获取现有话题
      const topics = await this.api.getUserTopics(username);
      for (const topic of topics) {
        this.storage.markTopicKnown(username, topic.id);
      }
      console.log(`[Monitor] ${username}: 记录了 ${topics.length} 个现有话题`);

      // 获取现有回复
      const posts = await this.api.getUserPosts(username);
      for (const post of posts) {
        this.storage.markPostKnown(username, post.id);
      }
      console.log(`[Monitor] ${username}: 记录了 ${posts.length} 个现有回复`);

      this.storage.markInitialized(username);
      this.storage.save();
    } catch (err) {
      console.error(`[Monitor] 初始化用户 ${username} 失败:`, err.message);
    }
  }

  /**
   * 检查所有用户的新帖子
   */
  async check() {
    if (!this.running) return;

    const now = new Date().toLocaleString('zh-CN');
    console.log(`[Monitor] ${now} - 开始检查...`);

    for (const username of this.config.monitorUsers) {
      try {
        await this.checkUser(username);
      } catch (err) {
        console.error(`[Monitor] 检查用户 ${username} 失败:`, err.message);

        // 如果是认证错误，通知用户
        if (err.message.includes('401') || err.message.includes('403')) {
          await this.telegram.notifyError(`Cookie 可能已过期，请更新配置`);
        }
      }
    }

    this.storage.updateLastCheck();
  }

  /**
   * 检查单个用户
   */
  async checkUser(username) {
    // 检查新话题
    if (this.config.monitorTopics !== false) {
      await this.checkUserTopics(username);
    }

    // 检查新回复
    if (this.config.monitorReplies !== false) {
      await this.checkUserPosts(username);
    }
  }

  /**
   * 检查用户新话题
   */
  async checkUserTopics(username) {
    const topics = await this.api.getUserTopics(username);
    let newCount = 0;

    for (const topic of topics) {
      if (this.storage.isNewTopic(username, topic.id)) {
        newCount++;
        console.log(`[Monitor] ${username} 发布了新话题: ${topic.title}`);

        // 发送通知
        await this.telegram.notifyNewTopic(username, topic);

        // 标记为已知
        this.storage.markTopicKnown(username, topic.id);
      }
    }

    if (newCount > 0) {
      this.storage.save();
      console.log(`[Monitor] ${username}: 发现 ${newCount} 个新话题`);
    }
  }

  /**
   * 检查用户新回复
   */
  async checkUserPosts(username) {
    const posts = await this.api.getUserPosts(username);
    let newCount = 0;

    for (const post of posts) {
      if (this.storage.isNewPost(username, post.id)) {
        newCount++;
        console.log(`[Monitor] ${username} 发布了新回复 (话题: ${post.topic_id})`);

        // 发送通知
        await this.telegram.notifyNewReply(username, post, post.topic_title || '未知话题');

        // 标记为已知
        this.storage.markPostKnown(username, post.id);
      }
    }

    if (newCount > 0) {
      this.storage.save();
      console.log(`[Monitor] ${username}: 发现 ${newCount} 个新回复`);
    }
  }
}
