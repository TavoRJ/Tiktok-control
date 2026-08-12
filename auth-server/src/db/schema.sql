-- TavLive Remote Auth Database Relational Schema

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tiktok_username TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT, -- Nullable for OAuth users
    provider TEXT NOT NULL DEFAULT 'credentials', -- 'credentials' | 'google'
    google_id TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'user', -- 'user' | 'admin'
    status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'suspended' | 'banned'
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    key TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'PRO', -- 'FREE' | 'PRO' | 'VIP'
    status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'expired' | 'revoked' | 'paused'
    max_devices INTEGER NOT NULL DEFAULT 2,
    expires_at TEXT,
    tiktok_username TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    license_id TEXT,
    device_identifier TEXT NOT NULL,
    device_name TEXT NOT NULL,
    os_platform TEXT NOT NULL,
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'authorized', -- 'authorized' | 'revoked'
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE SET NULL,
    UNIQUE(user_id, device_identifier)
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_id TEXT,
    refresh_token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
);

-- Indexes for fast query performance
CREATE INDEX IF NOT EXISTS idx_users_tiktok ON users(tiktok_username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_user_device ON devices(user_id, device_identifier);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_hash ON sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
