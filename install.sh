#!/usr/bin/env bash

set -e

INSTALL_DIR="/opt/linuxdo-monitor"
REPO_URL="https://github.com/norberto-rubado/linuxdo-monitor.git"

print_header() {
  echo "========================================="
  echo "LinuxDo Monitor 安装脚本"
  echo "========================================="
}

require_root() {
  if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
    echo "需要 root 权限（会写入 $INSTALL_DIR 和 /etc/systemd/system）。"
    echo "请使用：curl -fsSL <url> | sudo bash"
    exit 1
  fi
}

has_tty() {
  [[ -r /dev/tty && -w /dev/tty ]]
}

tty_read() {
  # usage: tty_read VAR "prompt" [silent]
  local __var_name="$1"
  local __prompt="$2"
  local __silent="${3:-false}"

  if ! has_tty; then
    echo "此脚本需要交互输入，但当前没有 TTY。"
    echo "请改用：curl -fsSLo install.sh <url> && chmod +x install.sh && sudo ./install.sh"
    exit 1
  fi

  if [[ "$__silent" == "true" ]]; then
    local __value
    read -r -s -p "$__prompt" __value < /dev/tty
    echo > /dev/tty
    printf -v "$__var_name" '%s' "$__value"
  else
    local __value
    read -r -p "$__prompt" __value < /dev/tty
    printf -v "$__var_name" '%s' "$__value"
  fi
}

json_escape() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//"/\\"}
  s=${s//$'\r'/}
  s=${s//$'\n'/}
  printf '%s' "$s"
}

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    echo "已检测到 Node.js $(node -v)"
    return
  fi

  echo "未检测到 Node.js，开始安装..."

  if [[ -f /etc/debian_version ]]; then
    echo "检测到 Debian/Ubuntu 系统"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get update -y
    apt-get install -y nodejs
  elif [[ -f /etc/redhat-release ]]; then
    echo "检测到 CentOS/RHEL 系统"
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs
  else
    echo "无法自动安装 Node.js，请手动安装 Node.js 18+ 后重试"
    exit 1
  fi
}

ensure_git() {
  if command -v git >/dev/null 2>&1; then
    return
  fi

  echo "未检测到 git，开始安装..."

  if [[ -f /etc/debian_version ]]; then
    apt-get update -y
    apt-get install -y git
  elif [[ -f /etc/redhat-release ]]; then
    yum install -y git
  else
    echo "无法自动安装 git，请手动安装后重试"
    exit 1
  fi
}

maybe_backup_config() {
  if [[ -f "$INSTALL_DIR/config.json" ]]; then
    echo "备份现有配置文件..."
    cp "$INSTALL_DIR/config.json" "/tmp/linuxdo-monitor-config.backup.json"
  fi
}

restore_backup_config() {
  if [[ -f "/tmp/linuxdo-monitor-config.backup.json" ]]; then
    echo "恢复配置文件..."
    cp "/tmp/linuxdo-monitor-config.backup.json" "$INSTALL_DIR/config.json"
    rm -f "/tmp/linuxdo-monitor-config.backup.json"

    local run_user
    run_user="${SUDO_USER:-root}"
    chown "$run_user":"$run_user" "$INSTALL_DIR/config.json" 2>/dev/null || true
    chmod 600 "$INSTALL_DIR/config.json" || true
  fi
}

write_config_if_missing() {
  if [[ -f "$INSTALL_DIR/config.json" ]]; then
    return
  fi

  echo ""
  echo "========================================="
  echo "配置向导"
  echo "========================================="

  local cookie bot_token chat_id monitor_users_raw check_interval

  tty_read cookie "请输入 Linux.do Cookie（可留空；若遇到 401/403 再填写）： " true
  tty_read bot_token "请输入 Telegram Bot Token： " true
  tty_read chat_id "请输入 Telegram Chat ID： "
  tty_read monitor_users_raw "请输入要监控的用户名（多个用英文逗号分隔）： "
  tty_read check_interval "检查间隔（秒，默认 300）： "

  if [[ -z "$check_interval" ]]; then
    check_interval="300"
  fi

  local cookie_esc bot_token_esc chat_id_esc
  cookie_esc=$(json_escape "$cookie")
  bot_token_esc=$(json_escape "$bot_token")
  chat_id_esc=$(json_escape "$chat_id")

  IFS=',' read -r -a users_array <<< "$monitor_users_raw"

  local users_json=""
  for u in "${users_array[@]}"; do
    u="${u#${u%%[![:space:]]*}}"
    u="${u%${u##*[![:space:]]}}"
    if [[ -n "$u" ]]; then
      local u_esc
      u_esc=$(json_escape "$u")
      if [[ -n "$users_json" ]]; then
        users_json+=" , "
      fi
      users_json+="\"$u_esc\""
    fi
  done

  if [[ -z "$users_json" ]]; then
    echo "monitorUsers 不能为空"
    exit 1
  fi

  cat > "$INSTALL_DIR/config.json" <<EOF
{
  "cookie": "$cookie_esc",
  "telegram": {
    "botToken": "$bot_token_esc",
    "chatId": "$chat_id_esc"
  },
  "monitorUsers": [$users_json],
  "checkInterval": $check_interval,
  "monitorTopics": true,
  "monitorReplies": true
}
EOF

  local run_user
  run_user="${SUDO_USER:-root}"
  chown "$run_user":"$run_user" "$INSTALL_DIR/config.json" 2>/dev/null || true
  chmod 600 "$INSTALL_DIR/config.json" || true
  echo "配置文件已创建：$INSTALL_DIR/config.json"
}

write_systemd_service() {
  if ! command -v systemctl >/dev/null 2>&1; then
    echo "未检测到 systemctl，跳过 systemd 服务创建。"
    echo "你可以手动运行：cd $INSTALL_DIR && node src/index.js"
    return
  fi

  local node_bin run_user service_file
  node_bin=$(command -v node)
  run_user="${SUDO_USER:-root}"
  service_file="/etc/systemd/system/linuxdo-monitor.service"

  echo "创建 systemd 服务..."

  cat > "$service_file" <<EOF
[Unit]
Description=LinuxDo Monitor Service
After=network.target

[Service]
Type=simple
User=$run_user
WorkingDirectory=$INSTALL_DIR
ExecStart=$node_bin src/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload

  echo ""
  echo "使用以下命令管理服务："
  echo "  启动服务: systemctl start linuxdo-monitor"
  echo "  停止服务: systemctl stop linuxdo-monitor"
  echo "  查看状态: systemctl status linuxdo-monitor"
  echo "  开机自启: systemctl enable linuxdo-monitor"
  echo "  查看日志: journalctl -u linuxdo-monitor -f"

  if has_tty; then
    local reply
    read -r -n 1 -p "是否立即启动服务？(y/n) " reply < /dev/tty
    echo
    if [[ "$reply" =~ ^[Yy]$ ]]; then
      systemctl start linuxdo-monitor
      systemctl enable linuxdo-monitor
      echo "服务已启动并设置为开机自启"
    fi
  fi
}

main() {
  print_header
  require_root

  ensure_git
  ensure_node

  echo "安装目录: $INSTALL_DIR"

  if [[ -d "$INSTALL_DIR" ]]; then
    if has_tty; then
      local overwrite
      read -r -n 1 -p "目录已存在，是否覆盖？(y/n) " overwrite < /dev/tty
      echo
      if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
        echo "安装已取消"
        exit 0
      fi
    else
      echo "目录已存在且无 TTY，无法确认覆盖，退出。"
      exit 1
    fi

    maybe_backup_config
    rm -rf "$INSTALL_DIR"
  fi

  echo "正在克隆项目..."
  git clone "$REPO_URL" "$INSTALL_DIR"

  restore_backup_config

  local run_user
  run_user="${SUDO_USER:-root}"
  if [[ "$run_user" != "root" ]]; then
    chown -R "$run_user":"$run_user" "$INSTALL_DIR" || true
  fi

  write_config_if_missing
  write_systemd_service

  echo ""
  echo "========================================="
  echo "安装完成！"
  echo "========================================="
}

main "$@"
