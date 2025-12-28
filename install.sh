#!/bin/bash

# LinuxDo Monitor 安装脚本
# 用于在 VPS 上快速部署

set -e

echo "========================================="
echo "LinuxDo Monitor 安装脚本"
echo "========================================="

# 检查是否以 root 用户运行
if [[ $EUID -ne 0 ]]; then
   echo "建议使用 root 用户运行此脚本"
fi

# 检查 Node.js 是否已安装
if ! command -v node &> /dev/null; then
    echo "未检测到 Node.js，开始安装..."

    # 检测操作系统
    if [ -f /etc/debian_version ]; then
        # Debian/Ubuntu
        echo "检测到 Debian/Ubuntu 系统"
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    elif [ -f /etc/redhat-release ]; then
        # CentOS/RHEL
        echo "检测到 CentOS/RHEL 系统"
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
        yum install -y nodejs
    else
        echo "无法自动安装 Node.js，请手动安装 Node.js 18+ 后重试"
        exit 1
    fi
else
    NODE_VERSION=$(node -v)
    echo "已检测到 Node.js $NODE_VERSION"
fi

# 创建安装目录
INSTALL_DIR="/opt/linuxdo-monitor"
echo "安装目录: $INSTALL_DIR"

# 如果目录存在，询问是否覆盖
if [ -d "$INSTALL_DIR" ]; then
    read -p "目录已存在，是否覆盖？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # 备份配置文件
        if [ -f "$INSTALL_DIR/config.json" ]; then
            echo "备份现有配置文件..."
            cp "$INSTALL_DIR/config.json" "/tmp/linuxdo-monitor-config.backup.json"
        fi
        rm -rf "$INSTALL_DIR"
    else
        echo "安装已取消"
        exit 0
    fi
fi

# 克隆项目
echo "正在克隆项目..."
git clone https://github.com/norberto-rubado/linuxdo-monitor.git "$INSTALL_DIR"
cd "$INSTALL_DIR"

# 恢复备份的配置文件
if [ -f "/tmp/linuxdo-monitor-config.backup.json" ]; then
    echo "恢复配置文件..."
    cp "/tmp/linuxdo-monitor-config.backup.json" "$INSTALL_DIR/config.json"
    rm "/tmp/linuxdo-monitor-config.backup.json"
fi

# 检查配置文件
if [ ! -f "config.json" ]; then
    echo ""
    echo "========================================="
    echo "配置向导"
    echo "========================================="

    read -p "请输入要监控的 LinuxDo 用户名: " USERNAME
    read -p "请输入 Telegram Bot Token: " BOT_TOKEN
    read -p "请输入 Telegram Chat ID: " CHAT_ID
    read -p "检查间隔（秒，默认300）: " CHECK_INTERVAL
    CHECK_INTERVAL=${CHECK_INTERVAL:-300}

    # 创建配置文件
    echo "{" > config.json
    echo "  \"username\": \"$USERNAME\"," >> config.json
    echo "  \"telegram\": {" >> config.json
    echo "    \"botToken\": \"$BOT_TOKEN\"," >> config.json
    echo "    \"chatId\": \"$CHAT_ID\"" >> config.json
    echo "  }," >> config.json
    echo "  \"checkInterval\": $CHECK_INTERVAL" >> config.json
    echo "}" >> config.json
    echo "配置文件已创建"
fi

# 创建 systemd 服务
echo "创建 systemd 服务..."
{
    echo "[Unit]"
    echo "Description=LinuxDo Monitor Service"
    echo "After=network.target"
    echo ""
    echo "[Service]"
    echo "Type=simple"
    echo "User=root"
    echo "WorkingDirectory=/opt/linuxdo-monitor"
    echo "ExecStart=/usr/bin/node src/index.js"
    echo "Restart=always"
    echo "RestartSec=10"
    echo "StandardOutput=journal"
    echo "StandardError=journal"
    echo ""
    echo "[Install]"
    echo "WantedBy=multi-user.target"
} > /etc/systemd/system/linuxdo-monitor.service

# 重新加载 systemd
systemctl daemon-reload

echo ""
echo "========================================="
echo "安装完成！"
echo "========================================="
echo ""
echo "使用以下命令管理服务："
echo "  启动服务: systemctl start linuxdo-monitor"
echo "  停止服务: systemctl stop linuxdo-monitor"
echo "  查看状态: systemctl status linuxdo-monitor"
echo "  开机自启: systemctl enable linuxdo-monitor"
echo "  查看日志: journalctl -u linuxdo-monitor -f"
echo ""
echo "配置文件位置: $INSTALL_DIR/config.json"
echo ""

# 询问是否立即启动
read -p "是否立即启动服务？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    systemctl start linuxdo-monitor
    systemctl enable linuxdo-monitor
    echo "服务已启动并设置为开机自启"
    echo ""
    echo "查看运行状态："
    systemctl status linuxdo-monitor
fi
