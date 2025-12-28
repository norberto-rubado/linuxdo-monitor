import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Monitor } from './monitor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, '..', 'config.json');

/**
 * 加载配置
 */
function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('❌ 配置文件不存在，请复制 config.example.json 为 config.json 并填写配置');
    console.error(`   配置文件路径: ${CONFIG_FILE}`);
    process.exit(1);
  }

  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(data);

    // 验证必要字段
    if (!config.cookie) {
      console.error('❌ 配置缺少 cookie 字段');
      process.exit(1);
    }

    if (!config.telegram?.botToken) {
      console.error('❌ 配置缺少 telegram.botToken 字段');
      process.exit(1);
    }

    if (!config.telegram?.chatId) {
      console.error('❌ 配置缺少 telegram.chatId 字段');
      process.exit(1);
    }

    if (!config.monitorUsers || config.monitorUsers.length === 0) {
      console.error('❌ 配置缺少 monitorUsers 字段');
      process.exit(1);
    }

    // 默认值
    config.checkInterval = config.checkInterval || 300; // 默认 5 分钟
    config.monitorTopics = config.monitorTopics !== false;
    config.monitorReplies = config.monitorReplies !== false;

    return config;
  } catch (err) {
    console.error('❌ 配置文件解析失败:', err.message);
    process.exit(1);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('========================================');
  console.log('   Linux.do 用户帖子监控');
  console.log('========================================');
  console.log('');

  const config = loadConfig();

  console.log('📋 配置信息:');
  console.log(`   监控用户: ${config.monitorUsers.join(', ')}`);
  console.log(`   检查间隔: ${config.checkInterval} 秒`);
  console.log(`   监控话题: ${config.monitorTopics ? '是' : '否'}`);
  console.log(`   监控回复: ${config.monitorReplies ? '是' : '否'}`);
  console.log('');

  const monitor = new Monitor(config);

  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\n正在停止监控...');
    monitor.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n正在停止监控...');
    monitor.stop();
    process.exit(0);
  });

  // 启动监控
  await monitor.start();
}

main().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
