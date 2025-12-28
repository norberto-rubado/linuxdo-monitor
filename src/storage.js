import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '..', 'state.json');

/**
 * 状态存储 - 记录已知的帖子ID
 */
export class Storage {
  constructor() {
    this.state = this.load();
  }

  /**
   * 加载状态
   */
  load() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const data = fs.readFileSync(STATE_FILE, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('[Storage] 加载状态失败:', err.message);
    }

    return {
      users: {},      // { username: { lastTopicId, lastPostId, topicIds: [], postIds: [] } }
      lastCheck: null
    };
  }

  /**
   * 保存状态
   */
  save() {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error('[Storage] 保存状态失败:', err.message);
    }
  }

  /**
   * 获取用户状态
   */
  getUserState(username) {
    if (!this.state.users[username]) {
      this.state.users[username] = {
        topicIds: [],
        postIds: [],
        initialized: false
      };
    }
    return this.state.users[username];
  }

  /**
   * 检查话题是否是新的
   * @param {string} username
   * @param {number} topicId
   * @returns {boolean}
   */
  isNewTopic(username, topicId) {
    const userState = this.getUserState(username);
    return !userState.topicIds.includes(topicId);
  }

  /**
   * 检查回复是否是新的
   * @param {string} username
   * @param {number} postId
   * @returns {boolean}
   */
  isNewPost(username, postId) {
    const userState = this.getUserState(username);
    return !userState.postIds.includes(postId);
  }

  /**
   * 标记话题为已知
   */
  markTopicKnown(username, topicId) {
    const userState = this.getUserState(username);
    if (!userState.topicIds.includes(topicId)) {
      userState.topicIds.push(topicId);
      // 只保留最近 500 个
      if (userState.topicIds.length > 500) {
        userState.topicIds = userState.topicIds.slice(-500);
      }
    }
  }

  /**
   * 标记回复为已知
   */
  markPostKnown(username, postId) {
    const userState = this.getUserState(username);
    if (!userState.postIds.includes(postId)) {
      userState.postIds.push(postId);
      // 只保留最近 1000 个
      if (userState.postIds.length > 1000) {
        userState.postIds = userState.postIds.slice(-1000);
      }
    }
  }

  /**
   * 标记用户已初始化（首次运行不发通知）
   */
  markInitialized(username) {
    this.getUserState(username).initialized = true;
  }

  /**
   * 检查用户是否已初始化
   */
  isInitialized(username) {
    return this.getUserState(username).initialized;
  }

  /**
   * 更新最后检查时间
   */
  updateLastCheck() {
    this.state.lastCheck = new Date().toISOString();
    this.save();
  }
}
