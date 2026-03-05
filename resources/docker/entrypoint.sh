#!/usr/bin/env sh
# shellcheck shell=dash
# =============================================================================
# RMail Entrypoint Script
# =============================================================================
# Initializes the configuration file and starts the Stalwart mail server.
# Supports Railway deployment by detecting the RAILWAY_ENVIRONMENT variable.

# Determine config path
CONFIG_PATH="/opt/stalwart/etc/config.toml"

# If running on Railway and no config exists, use the Railway config
if [ -n "${RAILWAY_ENVIRONMENT:-}" ] && [ ! -f "$CONFIG_PATH" ]; then
    echo "Railway environment detected. Using Railway configuration."
    if [ -f /opt/stalwart/etc/railway-config.toml ]; then
        cp /opt/stalwart/etc/railway-config.toml "$CONFIG_PATH"
    fi
fi

# If the configuration file does not exist, initialize it.
if [ ! -f "$CONFIG_PATH" ]; then
    /usr/local/bin/stalwart --init /opt/stalwart
fi

# If the configuration file exists, start the server.
exec /usr/local/bin/stalwart --config "$CONFIG_PATH"
