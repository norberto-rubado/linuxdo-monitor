import https from 'https';
import zlib from 'zlib';

const BASE_URL = 'https://linux.do';

/**
 * Linux.do API 客户端
 */
export class LinuxDoApi {
  constructor(cookie) {
    this.cookie = cookie;
    this.csrfToken = '';
  }

  /**
   * 发送 HTTPS 请求
   */
  request(url, options = {}) {
    return new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: options.method || 'GET',
        headers: {
          'Cookie': this.cookie,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          ...options.headers
        }
      }, (res) => {
        // 处理重定向
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          const redirectUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : `${BASE_URL}${res.headers.location}`;
          return this.request(redirectUrl, options).then(resolve).catch(reject);
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          let buffer = Buffer.concat(chunks);
          const encoding = res.headers['content-encoding'];

          try {
            let body;
            if (encoding === 'gzip') {
              body = zlib.gunzipSync(buffer).toString('utf-8');
            } else if (encoding === 'deflate') {
              body = zlib.inflateSync(buffer).toString('utf-8');
            } else if (encoding === 'br') {
              body = zlib.brotliDecompressSync(buffer).toString('utf-8');
            } else {
              body = buffer.toString('utf-8');
            }

            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body
            });
          } catch (err) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: buffer.toString('utf-8')
            });
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * 获取用户最近的帖子/话题
   * @param {string} username - 用户名
   * @returns {Promise<Array>} 帖子列表
   */
  async getUserTopics(username) {
    const url = `${BASE_URL}/u/${username}/activity/topics.json`;
    const response = await this.request(url);

    if (response.statusCode !== 200) {
      throw new Error(`获取用户话题失败: ${response.statusCode}`);
    }

    const data = JSON.parse(response.body);
    return data.topic_list?.topics || [];
  }

  /**
   * 获取用户最近的回复
   * @param {string} username - 用户名
   * @returns {Promise<Array>} 回复列表
   */
  async getUserPosts(username) {
    const url = `${BASE_URL}/u/${username}/activity/replies.json`;
    const response = await this.request(url);

    if (response.statusCode !== 200) {
      throw new Error(`获取用户回复失败: ${response.statusCode}`);
    }

    const data = JSON.parse(response.body);
    return data.post_list?.posts || [];
  }

  /**
   * 获取话题详情
   * @param {number} topicId - 话题ID
   * @returns {Promise<Object>} 话题详情
   */
  async getTopic(topicId) {
    const url = `${BASE_URL}/t/${topicId}.json`;
    const response = await this.request(url);

    if (response.statusCode !== 200) {
      throw new Error(`获取话题失败: ${response.statusCode}`);
    }

    return JSON.parse(response.body);
  }

  /**
   * 验证 Cookie 是否有效
   * @returns {Promise<boolean>}
   */
  async validateCookie() {
    try {
      const url = `${BASE_URL}/session/current.json`;
      const response = await this.request(url);
      return response.statusCode === 200;
    } catch {
      return false;
    }
  }
}
