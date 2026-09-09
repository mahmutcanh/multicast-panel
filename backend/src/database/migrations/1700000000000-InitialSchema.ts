import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar NOT NULL UNIQUE,
        slug varchar NOT NULL UNIQUE,
        description text,
        is_system boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE permissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug varchar NOT NULL UNIQUE,
        group_name varchar NOT NULL,
        description text
      );

      CREATE TABLE role_permissions (
        role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      );

      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar NOT NULL UNIQUE,
        password_hash varchar NOT NULL,
        name varchar NOT NULL,
        locale varchar NOT NULL DEFAULT 'tr',
        is_active boolean NOT NULL DEFAULT true,
        email_verified_at timestamptz,
        mfa_enabled boolean NOT NULL DEFAULT false,
        mfa_secret text,
        mfa_recovery_codes jsonb,
        last_login_at timestamptz,
        failed_login_count int NOT NULL DEFAULT 0,
        locked_until timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE user_roles (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, role_id)
      );

      CREATE TABLE api_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name varchar NOT NULL,
        token_hash varchar NOT NULL,
        scopes jsonb NOT NULL DEFAULT '[]',
        last_used_at timestamptz,
        expires_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX idx_api_tokens_hash ON api_tokens (token_hash);

      CREATE TABLE login_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid,
        email varchar NOT NULL,
        ip varchar NOT NULL,
        user_agent text,
        success boolean NOT NULL,
        reason text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_login_history_created ON login_history (created_at DESC);

      CREATE TABLE audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid,
        user_email varchar,
        action varchar NOT NULL,
        resource varchar NOT NULL,
        resource_id text,
        ip varchar,
        meta jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC);

      CREATE TABLE nodes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar NOT NULL UNIQUE,
        host varchar NOT NULL DEFAULT '127.0.0.1',
        role varchar NOT NULL DEFAULT 'local',
        status varchar NOT NULL DEFAULT 'online',
        last_seen_at timestamptz,
        meta jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE playlists (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar NOT NULL,
        mode varchar NOT NULL DEFAULT 'sequential',
        folder_path text NOT NULL DEFAULT '',
        loop boolean NOT NULL DEFAULT true,
        schedule jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE video_files (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        filename varchar NOT NULL,
        path text NOT NULL,
        size_bytes bigint NOT NULL DEFAULT 0,
        duration_seconds float NOT NULL DEFAULT 0,
        video_codec varchar NOT NULL DEFAULT '',
        audio_codec varchar NOT NULL DEFAULT '',
        resolution varchar NOT NULL DEFAULT '',
        fps float NOT NULL DEFAULT 0,
        bitrate_kbps float NOT NULL DEFAULT 0,
        thumbnail_path text,
        tags jsonb NOT NULL DEFAULT '[]',
        category varchar NOT NULL DEFAULT '',
        uploaded_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX idx_video_files_path ON video_files (path);

      CREATE TABLE playlist_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        playlist_id uuid NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        video_file_id uuid REFERENCES video_files(id) ON DELETE SET NULL,
        url text NOT NULL DEFAULT '',
        position int NOT NULL DEFAULT 0
      );

      CREATE TABLE channels (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar NOT NULL,
        logo_url text,
        category varchar,
        description text,
        epg_id varchar,
        source_type varchar NOT NULL DEFAULT 'test_pattern',
        source_url text,
        playlist_id uuid REFERENCES playlists(id) ON DELETE SET NULL,
        udp_ip varchar NOT NULL DEFAULT '230.120.5.98',
        udp_port int NOT NULL DEFAULT 1234,
        ttl int NOT NULL DEFAULT 64,
        pkt_size int NOT NULL DEFAULT 1316,
        iface varchar NOT NULL DEFAULT '',
        copy_mode boolean NOT NULL DEFAULT true,
        video_codec varchar NOT NULL DEFAULT 'libx264',
        audio_codec varchar NOT NULL DEFAULT 'aac',
        video_bitrate varchar NOT NULL DEFAULT '4000k',
        audio_bitrate varchar NOT NULL DEFAULT '128k',
        resolution varchar NOT NULL DEFAULT '',
        fps int NOT NULL DEFAULT 0,
        gop int NOT NULL DEFAULT 50,
        preset varchar NOT NULL DEFAULT 'veryfast',
        threads int NOT NULL DEFAULT 0,
        bufsize varchar NOT NULL DEFAULT '',
        muxrate varchar NOT NULL DEFAULT '',
        mpegts_opts jsonb,
        hwaccel varchar NOT NULL DEFAULT '',
        probe_size varchar NOT NULL DEFAULT '',
        analyze_duration varchar NOT NULL DEFAULT '',
        reconnect_opts jsonb,
        extra_ffmpeg_args text NOT NULL DEFAULT '',
        loop_mode boolean NOT NULL DEFAULT true,
        auto_start boolean NOT NULL DEFAULT false,
        auto_restart boolean NOT NULL DEFAULT true,
        restart_max int NOT NULL DEFAULT 10,
        schedule jsonb,
        priority int NOT NULL DEFAULT 0,
        notes text,
        engine varchar NOT NULL DEFAULT 'ffmpeg',
        status varchar NOT NULL DEFAULT 'stopped',
        node_id uuid REFERENCES nodes(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE channel_outputs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        type varchar NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        url text NOT NULL DEFAULT '',
        config jsonb NOT NULL DEFAULT '{}',
        public_enabled boolean NOT NULL DEFAULT false,
        token_required boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE stream_processes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        pid int,
        state varchar NOT NULL DEFAULT 'stopped',
        started_at timestamptz,
        stopped_at timestamptz,
        restart_count int NOT NULL DEFAULT 0,
        last_error text,
        last_error_at timestamptz,
        bitrate_kbps float NOT NULL DEFAULT 0,
        fps float NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX idx_stream_processes_channel ON stream_processes (channel_id);

      CREATE TABLE stream_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id uuid,
        level varchar NOT NULL DEFAULT 'info',
        source varchar NOT NULL DEFAULT 'ffmpeg',
        message text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_stream_logs_channel ON stream_logs (channel_id);
      CREATE INDEX idx_stream_logs_created ON stream_logs (created_at DESC);

      CREATE TABLE epg_channels (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        epg_id varchar NOT NULL,
        name varchar NOT NULL,
        icon text,
        channel_id uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX idx_epg_channels_epgid ON epg_channels (epg_id);

      CREATE TABLE epg_programs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        epg_channel_id uuid NOT NULL REFERENCES epg_channels(id) ON DELETE CASCADE,
        title varchar NOT NULL,
        description text,
        start_at timestamptz NOT NULL,
        end_at timestamptz NOT NULL,
        category varchar NOT NULL DEFAULT ''
      );
      CREATE INDEX idx_epg_programs_channel ON epg_programs (epg_channel_id);

      CREATE TABLE m3u_imports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        source varchar NOT NULL DEFAULT 'url',
        url text NOT NULL DEFAULT '',
        filename varchar NOT NULL DEFAULT '',
        channels_created int NOT NULL DEFAULT 0,
        status varchar NOT NULL DEFAULT 'done',
        error text,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE system_settings (
        key varchar PRIMARY KEY,
        value jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE alert_settings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        telegram_enabled boolean NOT NULL DEFAULT false,
        telegram_bot_token varchar NOT NULL DEFAULT '',
        telegram_chat_id varchar NOT NULL DEFAULT '',
        email_enabled boolean NOT NULL DEFAULT false,
        email_to varchar NOT NULL DEFAULT '',
        webhook_enabled boolean NOT NULL DEFAULT false,
        webhook_url text NOT NULL DEFAULT '',
        slack_webhook_url text NOT NULL DEFAULT '',
        discord_webhook_url text NOT NULL DEFAULT '',
        events jsonb NOT NULL DEFAULT '{}',
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type varchar NOT NULL,
        title varchar NOT NULL,
        message text NOT NULL,
        severity varchar NOT NULL DEFAULT 'info',
        read boolean NOT NULL DEFAULT false,
        meta jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_notifications_created ON notifications (created_at DESC);

      CREATE TABLE backups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        filename varchar NOT NULL,
        path text NOT NULL,
        size_bytes bigint NOT NULL DEFAULT 0,
        type varchar NOT NULL DEFAULT 'manual',
        status varchar NOT NULL DEFAULT 'done',
        error text,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE licenses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        license_key text NOT NULL DEFAULT '',
        status varchar NOT NULL DEFAULT 'trial',
        licensed_to varchar NOT NULL DEFAULT '',
        features jsonb NOT NULL DEFAULT '{}',
        expires_at timestamptz,
        grace_days int NOT NULL DEFAULT 7,
        mode varchar NOT NULL DEFAULT 'offline',
        activated_at timestamptz,
        last_validated_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE IF EXISTS licenses, backups, notifications, alert_settings, system_settings,
        m3u_imports, epg_programs, epg_channels, stream_logs, stream_processes, channel_outputs,
        channels, playlist_items, video_files, playlists, nodes, audit_logs, login_history,
        api_tokens, user_roles, users, role_permissions, permissions, roles CASCADE;
    `);
  }
}
